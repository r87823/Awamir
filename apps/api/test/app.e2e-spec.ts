import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('App health (e2e)', () => {
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

  it('GET /health', async () => {
    const response = await request(app.getHttpServer())
      .get('/health')
      .expect(200);

    expect(response.body).toEqual(
      expect.objectContaining({
        status: expect.stringMatching(/^(ok|degraded)$/),
        service: 'awamir-plus-api',
        checks: expect.objectContaining({
          db: expect.any(Object),
          redis: expect.any(Object),
          worker: expect.any(Object),
          outbox: expect.any(Object),
        }),
      }),
    );
  });
});
