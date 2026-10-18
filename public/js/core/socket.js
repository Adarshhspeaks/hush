// Socket.io client loader and connection factory
export async function connectSocket() {
  const { io } = await import('/socket.io/socket.io.esm.min.js');
  return io();
}
