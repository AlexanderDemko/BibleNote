import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

export interface LoopbackListenResult {
  port: number;
  usedFallback: boolean;
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    server.once('error', onError);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', onError);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

function isAddressInUse(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';
}

export async function listenOnLoopbackWithFallback(
  server: Server,
  preferredPort: number
): Promise<LoopbackListenResult> {
  try {
    return { port: await listen(server, preferredPort), usedFallback: false };
  } catch (error) {
    if (!isAddressInUse(error)) throw error;
    return { port: await listen(server, 0), usedFallback: true };
  }
}
