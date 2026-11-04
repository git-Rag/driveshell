import { createServer } from 'net';

/**
 * Finds the first available TCP port at or above `startPort` on 127.0.0.1.
 * Probes by briefly binding a server and immediately releasing it.
 */
export function findAvailablePort(startPort: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.listen(startPort, '127.0.0.1', () => {
      const address = server.address();
      // address is null only if the server is not listening, which cannot happen here
      const port = (address as { port: number }).port;
      server.close(() => resolve(port));
    });

    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        // Try the next port
        findAvailablePort(startPort + 1).then(resolve, reject);
      } else {
        reject(err);
      }
    });
  });
}
