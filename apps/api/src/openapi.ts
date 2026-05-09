import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function setupOpenApi(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Awamir Plus API')
    .setDescription('Awamir Plus backend API contract')
    .setVersion('0.1.0')
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-permissions',
        in: 'header',
        description: 'Comma-separated permission names required by endpoint',
      },
      'permissions',
    )
    .addApiKey(
      {
        type: 'apiKey',
        name: 'x-correlation-id',
        in: 'header',
        description: 'Optional caller-supplied correlation id',
      },
      'correlation-id',
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
  return document;
}
