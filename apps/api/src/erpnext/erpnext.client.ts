import { Injectable } from '@nestjs/common';
import { ERPNextConfigService } from './erpnext.config';
import { ERPNextRequest, ERPNextResponse } from './erpnext.types';

@Injectable()
export class ERPNextClient {
  constructor(private readonly configService: ERPNextConfigService) {}

  validateERPNextConnection(): Promise<ERPNextResponse> {
    return this.request({ method: 'GET', path: '/api/method/ping' });
  }

  async request(input: ERPNextRequest): Promise<ERPNextResponse> {
    const config = this.configService.getConfig();
    const response = await fetch(new URL(input.path, config.baseUrl), {
      method: input.method,
      headers: {
        Authorization: `token ${config.apiKey}:${config.apiSecret}`,
        'Content-Type': 'application/json',
        ...(input.idempotencyKey
          ? { 'Idempotency-Key': input.idempotencyKey }
          : {}),
      },
      body: input.body ? JSON.stringify(input.body) : undefined,
    });

    return {
      status: response.status,
      ok: response.ok,
      body: await readResponseBody(response),
    };
  }
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
