import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ZodExceptionFilter } from './common/filters/zod-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Allow any localhost origin in dev (regardless of which port Next.js
  // picks), plus the configured app URL in production.
  const allowedOrigins = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim());

  app.enableCors({
    origin: (origin, cb) => {
      // No Origin header → same-origin / curl / Postman → allow
      if (!origin) return cb(null, true);
      if (
        process.env.NODE_ENV !== 'production' &&
        /^https?:\/\/localhost(:\d+)?$/.test(origin)
      ) {
        return cb(null, true);
      }
      if (allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origin ${origin} not allowed by CORS`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.setGlobalPrefix('api/v1');

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Map Zod validation failures (thrown by inline `Schema.parse(body)` calls in
  // controllers) to clean 400 responses. `@Catch(ZodError)` is targeted, so it
  // leaves Nest's default handling of every other exception type untouched.
  app.useGlobalFilters(new ZodExceptionFilter());

  // Swagger / OpenAPI
  const config = new DocumentBuilder()
    .setTitle('Inboudly API')
    .setDescription('AI-native social media intelligence platform')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  console.log(`🚀 Inboudly API running on http://localhost:${port}`);
  console.log(`📘 Docs: http://localhost:${port}/api/docs`);
}

bootstrap();
