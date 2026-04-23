import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";
import { validateEnv } from "./lib/validate-env.js";
import { ApiErrorFilter } from "./lib/api-error.filter.js";
import { ApiResponseInterceptor } from "./lib/api-response.interceptor.js";

async function bootstrap() {
  validateEnv();
  const app = await NestFactory.create(AppModule, {
    cors: false
  });

  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  app.enableCors({
    origin: webOrigin,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-owner-key", "x-request-id"],
    credentials: true
  });
  app.setGlobalPrefix("api");
  app.useGlobalFilters(new ApiErrorFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidUnknownValues: false
    })
  );

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
}

void bootstrap();
