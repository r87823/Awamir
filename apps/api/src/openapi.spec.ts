import { Test } from '@nestjs/testing';
import { setupOpenApi } from './openapi';

describe('OpenAPI', () => {
  it('creates the Swagger document', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();

    const document = setupOpenApi(app);

    expect(document.info.title).toBe('Awamir Plus API');
    expect(document.components?.securitySchemes).toEqual(
      expect.objectContaining({
        permissions: expect.any(Object),
        'correlation-id': expect.any(Object),
      }),
    );
    await app.close();
  });
});
