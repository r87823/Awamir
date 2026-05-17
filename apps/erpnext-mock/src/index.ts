import {
  createServer,
  IncomingMessage,
  Server,
  ServerResponse,
} from 'node:http';

type MockOptions = {
  failDocuments?: boolean;
  delayMs?: number;
  duplicateDocuments?: boolean;
  paymentEntryLookupReferences?: Record<string, string>;
};

export type ERPNextMockServer = {
  baseUrl: string;
  close: () => Promise<void>;
  documentCreateCount: () => number;
  lastRequestBodies: () => unknown[];
};

export async function startERPNextMock(
  options: MockOptions = {},
): Promise<ERPNextMockServer> {
  const idempotencyKeys = new Set<string>();
  const bodies: unknown[] = [];
  let documentCount = 0;

  const server = createServer(async (request, response) => {
    if (request.url === '/api/method/ping' && request.method === 'GET') {
      return json(response, 200, { message: 'pong' });
    }

    if (request.method === 'GET' && isPaymentEntryLookupPath(request.url)) {
      const referenceNo = paymentEntryReferenceNoFromLookup(request.url);
      const name =
        referenceNo && options.paymentEntryLookupReferences?.[referenceNo];
      return json(response, 200, {
        data: name ? [{ name, reference_no: referenceNo, docstatus: 0 }] : [],
      });
    }

    if (request.method === 'POST' && isDocumentCreatePath(request.url)) {
      if (options.delayMs) {
        await delay(options.delayMs);
      }
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

      bodies.push(parseBody(await readBody(request)));
      if (options.duplicateDocuments) {
        return json(response, 409, {
          exc_type: 'DuplicateEntryError',
          exception: 'Duplicate document',
        });
      }

      return json(response, 200, {
        data: { name: `MOCK-${documentCount}` },
        authorization: 'must-not-leak',
      });
    }

    if (
      request.url === '/api/method/frappe.client.submit' &&
      request.method === 'POST'
    ) {
      bodies.push(parseBody(await readBody(request)));
      return json(response, 200, {
        data: { name: `MOCK-SUBMITTED-${documentCount || 1}` },
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
    lastRequestBodies: () => bodies,
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

function isDocumentCreatePath(url: string | undefined) {
  const normalized = decodeURIComponent(url ?? '');
  return [
    '/api/resource/Awamir Placeholder',
    '/api/resource/Sales Order',
    '/api/resource/Sales Invoice',
    '/api/resource/Payment Entry',
  ].includes(normalized);
}

function isPaymentEntryLookupPath(url: string | undefined) {
  return decodeURIComponent(url ?? '').startsWith(
    '/api/resource/Payment Entry?',
  );
}

function paymentEntryReferenceNoFromLookup(url: string | undefined) {
  const parsed = new URL(url ?? '/', 'http://127.0.0.1');
  const filters = parsed.searchParams.get('filters');
  if (!filters) return null;

  try {
    const decoded = JSON.parse(filters) as unknown;
    if (!Array.isArray(decoded)) return null;

    const referenceFilter = decoded.find(
      (item) =>
        Array.isArray(item) &&
        item[0] === 'Payment Entry' &&
        item[1] === 'reference_no' &&
        item[2] === '=' &&
        typeof item[3] === 'string',
    );
    return Array.isArray(referenceFilter) ? referenceFilter[3] : null;
  } catch {
    return null;
  }
}

function parseBody(raw: string) {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
