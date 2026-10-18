// Hush server entry point: boot only
// Attaches Socket.io to Express HTTP server, initializes background sweeper, and listens on PORT.
import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { PORT, MAX_HTTP_BUFFER_SIZE } from './config.js';
import { registerSocketHandlers } from './sockets/index.js';
import { startSweeper } from './store/sweeper.js';

const server = createServer(app);
const io = new Server(server, { maxHttpBufferSize: MAX_HTTP_BUFFER_SIZE });

registerSocketHandlers(io);
startSweeper();

server.listen(PORT, () => console.log(`Hush on http://localhost:${PORT}`));

export { server, io, app };
