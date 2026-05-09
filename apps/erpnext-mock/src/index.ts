import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';

type MockOptions = {
  failDocuments?: boolean;
};

export type ERPNextMockServer = {
  baseUrl: string;
  close: () => Promise<void>;
  documentCreateCount: () => number;
};

export async function startERPNextMock(
  options: MockOptions = {},
): Promise<ERPNextMockServer> {
  const idempotencyKeys = new Set<string>();
  let documentCount = 0;

  const server = createServer(async (request, response) => {
    if (request.url === '/api/method/ping' && request.method === 'GET') {
      return json(response, 200, { message: 'pong' });
    }

    if (
      request.url === '/api/resource/Awamir%20Placeholder' &&
      request.method === 'POST'
    ) {
      if (options.failDocuments) {
        return json(response, 500, {
          exc_type: 'MockERPNextFailure',
          api_secret: 'must-not-leak',
        });
      }

      const idempotencyKey = request.headers['idempotency-key'];
      const stableKey = Array.isArray(idempotencyKey)
        ? idempotencyKey[0]
        : idempotencyKey;

      if (stableKey && !idempotencyKeys.has(stableKey)) {
        idempotencyKeys.add(stableKey);
        documentCount += 1;
      }

      await readBody(request);
      return json(response, 200, {
        data: { name: `MOCK-${documentCount}` },
        authorization: 'must-not-leak',
      });
    }

    return json(response, 404, { error: 'not_found' });
  });

  await listen(server);
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Unable to start ERPNext mock');
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
    documentCreateCount: () => documentCount,
  };
}

function listen(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
}

function json(response: ServerResponse, status: number, body: object) {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function readBody(request: IncomingMessage) {
  return new Promise<string>((resolve, reject) => {
    let body = '';
    request.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}
