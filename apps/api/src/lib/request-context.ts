/**
 * DEVOPS-001: Request context for correlation ID propagation.
 *
 * Uses AsyncLocalStorage to maintain correlation IDs throughout the request
 * lifecycle, enabling end-to-end tracing from frontend through API to RPC calls.
 *
 * Usage:
 *   - CorrelationInterceptor sets the ID on incoming requests
 *   - Services can retrieve it via getCorrelationId()
 *   - All logs and upstream calls should include it
 */

import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

interface RequestContext {
  correlationId: string;
}

const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

/**
 * Get the current correlation ID from request context.
 * Returns undefined if called outside of a request context.
 */
export function getCorrelationId(): string | undefined {
  const context = asyncLocalStorage.getStore();
  return context?.correlationId;
}

/**
 * Run a function with a specific correlation ID in context.
 * Used internally by the interceptor.
 */
export function runWithCorrelation<T>(
  correlationId: string,
  fn: () => T,
): T {
  return asyncLocalStorage.run({ correlationId }, fn);
}

/**
 * Generate a new correlation ID (UUID v4).
 * Exported for use in frontend clients.
 */
export function generateCorrelationId(): string {
  return randomUUID();
}
