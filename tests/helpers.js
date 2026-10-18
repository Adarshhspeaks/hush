// Test helpers for Hush characterization and regression tests
import { spawn } from 'child_process';
import net from 'net';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { io } from 'socket.io-client';
import {
  newKeyString,
  importKey,
  encrypt,
  decrypt,
  encryptBytes,
  decryptBytes,
  randomId,
} from '../public/crypto.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

export {
  newKeyString,
  importKey,
  encrypt,
  decrypt,
  encryptBytes,
  decryptBytes,
  randomId,
};

export function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export async function startServer(customEnv = {}) {
  const port = await getFreePort();
  const serverPath = fs.existsSync(path.join(projectRoot, 'server', 'index.js'))
    ? path.join(projectRoot, 'server', 'index.js')
    : path.join(projectRoot, 'server.js');

  const proc = spawn('node', [serverPath], {
    cwd: projectRoot,
    env: {
      ...process.env,
      PORT: String(port),
      ...customEnv,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const url = `http://localhost:${port}`;

  await new Promise((resolve, reject) => {
    let output = '';
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes('Hush on http://localhost:')) {
        cleanup();
        resolve();
      }
    };
    const onError = (err) => {
      cleanup();
      reject(err);
    };
    const onExit = (code) => {
      cleanup();
      reject(new Error(`Server exited prematurely with code ${code}. Output: ${output}`));
    };

    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', onError);
    proc.on('exit', onExit);

    function cleanup() {
      proc.stdout.removeListener('data', onData);
      proc.stderr.removeListener('data', onData);
      proc.removeListener('error', onError);
      proc.removeListener('exit', onExit);
    }

    setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for server on port ${port}. Output: ${output}`));
    }, 10000);
  });

  return {
    url,
    port,
    process: proc,
    stop: () => {
      return new Promise((resolve) => {
        if (proc.killed || proc.exitCode !== null) return resolve();
        proc.on('exit', resolve);
        proc.kill('SIGTERM');
        setTimeout(() => {
          try { proc.kill('SIGKILL'); } catch {}
          resolve();
        }, 2000);
      });
    },
  };
}

export function createClient(url) {
  return new Promise((resolve, reject) => {
    const socket = io(url, { reconnection: false, timeout: 5000 });
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

export function createRoom(socket) {
  return new Promise((resolve) => socket.emit('room:create', null, resolve));
}

export function joinRoom(socket, roomId) {
  return new Promise((resolve) => socket.emit('room:join', roomId, resolve));
}

export function sendMessage(socket, packet) {
  return new Promise((resolve) => socket.emit('msg:send', packet, resolve));
}

export function deleteMessage(socket, { id, delToken, adminToken }) {
  return new Promise((resolve) => socket.emit('msg:delete', { id, delToken, adminToken }, resolve));
}

export function destroyRoom(socket, adminToken) {
  return new Promise((resolve) => socket.emit('room:destroy', adminToken, resolve));
}
