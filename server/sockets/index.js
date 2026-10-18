// Socket connection wiring: initializes per-socket state and attaches event handlers
import { TokenBucket } from '../utils/rateLimit.js';
import { registerRoomHandlers } from './rooms.js';
import { registerMessageHandlers } from './messages.js';
import { registerTypingHandlers } from './typing.js';

export function registerSocketHandlers(io) {
  io.on('connection', (socket) => {
    const context = {
      roomId: null,
      bucket: new TokenBucket(),
    };

    registerRoomHandlers(socket, io, context);
    registerMessageHandlers(socket, io, context);
    registerTypingHandlers(socket, () => context.roomId);
  });
}
