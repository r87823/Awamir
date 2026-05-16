import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupOpenApi } from './openapi';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const expressApp = app.getHttpAdapter().getInstance();
  if (process.env.TRUST_PROXY) {
    expressApp.set('trust proxy', process.env.TRUST_PROXY);
  }
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: false,
      transform: true,
    }),
  );
  setupOpenApi(app);
  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
