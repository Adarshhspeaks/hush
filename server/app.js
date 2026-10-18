// Express application setup: security middleware, static file serving, and /r/:id route
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { securityHeaders } from './security.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.resolve(__dirname, '../public');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

// Apply strict Content-Security-Policy and privacy headers
app.use(securityHeaders);

// Serve static assets from public/
app.use(express.static(publicDir));

// Route /r/:id serves the room page
app.get('/r/:id', (_req, res) => {
  res.sendFile(path.join(publicDir, 'room.html'));
});

export default app;
