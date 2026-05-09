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
});
