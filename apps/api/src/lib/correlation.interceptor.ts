/**
 * DEVOPS-001: Correlation ID interceptor for NestJS.
 *
 * Extracts or generates correlation IDs for every incoming request,
 * sets them in the async context, and adds them to response headers.
 * This enables end-to-end request tracing across the entire stack.
 */

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Request, Response } from "express";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { generateCorrelationId, runWithCorrelation } from "./request-context.js";

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    // Extract correlation ID from header or generate new one
    const correlationId =
      (req.headers["x-request-id"] as string) || generateCorrelationId();

    // Set in response headers so client can reference it
    res.setHeader("x-request-id", correlationId);

    // Log request with correlation ID
    console.log(
      `[${correlationId}] ${req.method} ${req.url}`,
    );

    // Run the handler within the correlation context
    return runWithCorrelation(correlationId, () => {
      return next.handle().pipe(
        tap({
          next: (data) => {
            console.log(
              `[${correlationId}] Response sent`,
            );
          },
          error: (error) => {
            console.error(
              `[${correlationId}] Error: ${error?.message || 'Unknown error'}`,
            );
          },
        }),
      );
    });
  }
}
