import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('MVP auth (e2e)', () => {
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

  it('logs in and returns a backend session', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'demo' })
      .expect(201);

    expect(response.body).toEqual(
      expect.objectContaining({
        token: expect.any(String),
        user: expect.objectContaining({
          actorId: 'mvp-admin',
          permissions: expect.arrayContaining(['orders:view']),
        }),
      }),
    );
  });

  it('uses standardized error shape for invalid login', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'missing', password: 'demo' })
      .expect(400);

    expect(response.body).toEqual(
      expect.objectContaining({
        code: 'INVALID_LOGIN',
        correlationId: expect.any(String),
        timestamp: expect.any(String),
      }),
    );
  });
});
