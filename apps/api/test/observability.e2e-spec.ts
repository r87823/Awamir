import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Observability (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('propagates request and correlation ids to headers and error body', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('x-request-id', 'req-e2e')
      .set('x-correlation-id', 'corr-e2e')
      .send({})
      .expect(403);

    expect(response.headers['x-request-id']).toBe('req-e2e');
    expect(response.headers['x-correlation-id']).toBe('corr-e2e');
    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'FORBIDDEN',
        message: 'Missing required permission',
        correlationId: 'corr-e2e',
        timestamp: expect.any(String),
      }),
    );
    expect(response.body.details).toEqual(
      expect.objectContaining({
        requiredPermissions: ['orders:create'],
      }),
    );
  });

  it('generates request and correlation ids when missing', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .send({})
      .expect(403);

    expect(response.headers['x-request-id']).toEqual(expect.any(String));
    expect(response.headers['x-correlation-id']).toEqual(expect.any(String));
    expect(response.body.correlationId).toBe(
      response.headers['x-correlation-id'],
    );
  });

  it('sets baseline security headers', async () => {
    const response = await request(app.getHttpServer())
      .get('/health/live')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toContain('camera=()');
  });

  it('allows configured CORS origins without wildcard credentials', async () => {
    const originalOrigins = process.env.CORS_ORIGINS;
    const originalCredentials = process.env.CORS_CREDENTIALS;
    process.env.CORS_ORIGINS = 'https://app.example.test';
    process.env.CORS_CREDENTIALS = 'true';

    try {
      const response = await request(app.getHttpServer())
        .options('/auth/login')
        .set('origin', 'https://app.example.test')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe(
        'https://app.example.test',
      );
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    } finally {
      restoreOptionalEnv('CORS_ORIGINS', originalOrigins);
      restoreOptionalEnv('CORS_CREDENTIALS', originalCredentials);
    }
  });
});

function restoreOptionalEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
