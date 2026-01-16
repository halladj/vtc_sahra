import { createServer } from 'http';
import app from './app';
import { initializeSocket } from './socket';

const port = process.env.PORT || 3000;

// Create HTTP server
const httpServer = createServer(app);

// Initialize Socket.IO
initializeSocket(httpServer);

// Start server
httpServer.listen(port, () => {
  /* eslint-disable no-console */
  console.log(`🚀 Server listening on http://localhost:${port}`);
  console.log(`📡 WebSocket server ready`);
  /* eslint-enable no-console */
});