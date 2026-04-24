import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  PayloadTooLargeException,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";
import { DomainEventBus } from "../../lib/domain-event-bus.js";
import {
  RPC_PROXIED,
  RPC_CACHE_HIT,
  RPC_UPSTREAM_ERROR,
} from "../../lib/domain-events.js";
import { RpcCacheService } from "./rpc-cache.service.js";
import { RpcFailoverService } from "./rpc-failover.service.js";
import {
  isMethodAllowed,
  getMethodPolicy,
  buildMethodNotAllowedError,
} from "./rpc-method-policy.js";
import { getCorrelationId } from "../../lib/request-context.js";

const networkSchema = z.enum(["mainnet", "testnet", "futurenet", "local"]);

const singleRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    method: z.string().trim().min(1),
    params: z.unknown().optional(),
    id: z.union([z.string(), z.number(), z.null()]).optional()
  })
  .passthrough();

const rpcRequestSchema = z.union([
  singleRpcRequestSchema,
  z.array(singleRpcRequestSchema).min(1)
]);

type RpcNetwork = z.infer<typeof networkSchema>;

const MAX_BATCH_REQUESTS = 25;
const MAX_PAYLOAD_BYTES = 50_000;

export type ProxiedRpcResponse = {
  statusCode: number;
  contentType: string;
  body: unknown;
};

@Injectable()
export class RpcService {
  constructor(
    private readonly configService: ConfigService,
    private readonly events: DomainEventBus,
    private readonly rpcCache: RpcCacheService,
    private readonly failover: RpcFailoverService,
  ) {}

  async proxy(network: string, payload: unknown): Promise<ProxiedRpcResponse> {
    const parsedNetwork = networkSchema.safeParse(network);
    if (!parsedNetwork.success) {
      throw new BadRequestException("Unsupported network");
    }

    const parsedPayload = rpcRequestSchema.safeParse(payload);
    if (!parsedPayload.success) {
      throw new BadRequestException({
        error: "Invalid JSON-RPC payload",
        details: parsedPayload.error.flatten()
      });
    }

    if (
      Array.isArray(parsedPayload.data) &&
      parsedPayload.data.length > MAX_BATCH_REQUESTS
    ) {
      throw new BadRequestException(
        `RPC batch size exceeds limit of ${MAX_BATCH_REQUESTS}`
      );
    }

    // BE-007: Enforce method policy on single requests.
    // For batch requests, reject the whole batch if any method is unsupported.
    const isSingle = !Array.isArray(parsedPayload.data);
    if (isSingle) {
      const method = (parsedPayload.data as { method: string }).method;
      if (!isMethodAllowed(method)) {
        const id = (parsedPayload.data as { id?: string | number | null }).id;
        return {
          statusCode: 200,
          contentType: "application/json",
          body: buildMethodNotAllowedError(method, id),
        };
      }
    } else {
      const disallowed = (parsedPayload.data as Array<{ method: string; id?: string | number | null }>)
        .filter((r) => !isMethodAllowed(r.method));
      if (disallowed.length > 0) {
        return {
          statusCode: 200,
          contentType: "application/json",
          body: disallowed.map((r) => buildMethodNotAllowedError(r.method, r.id)),
        };
      }
    }

    const serializedPayload = JSON.stringify(parsedPayload.data);
    if (serializedPayload.length > MAX_PAYLOAD_BYTES) {
      throw new PayloadTooLargeException(
        `RPC payload exceeds limit of ${MAX_PAYLOAD_BYTES} bytes`
      );
    }

    // BE-008: Get ordered endpoints (healthy first).
    const endpoints = this.failover.getEndpoints(parsedNetwork.data);
    if (endpoints.length === 0) {
      throw new ServiceUnavailableException(
        `RPC URL is not configured for network '${parsedNetwork.data}'`
      );
    }

    const method = isSingle
      ? (parsedPayload.data as { method: string }).method
      : ((parsedPayload.data as Array<{ method: string }>)[0]?.method ?? "batch");

    // Only single (non-batch) requests are eligible for caching/deduplication.
    if (isSingle && this.rpcCache.isCacheable(method)) {
      const cacheKey = this.rpcCache.buildKey(
        parsedNetwork.data,
        method,
        (parsedPayload.data as { params?: unknown }).params,
      );

      const cached = this.rpcCache.get(cacheKey);
      if (cached !== undefined) {
        this.events.emit(RPC_CACHE_HIT, { network: parsedNetwork.data, method });
        return cached as ProxiedRpcResponse;
      }

      return this.rpcCache.deduplicate(cacheKey, async () => {
        const result = await this.fetchWithFailover(
          endpoints,
          parsedNetwork.data,
          method,
          serializedPayload,
        );
        if (result.statusCode === 200) {
          this.rpcCache.set(cacheKey, method, result);
        }
        return result;
      });
    }

    return this.fetchWithFailover(endpoints, parsedNetwork.data, method, serializedPayload);
  }

  /** BE-008: Try each endpoint in order, recording failures for flap prevention. */
  private async fetchWithFailover(
    endpoints: string[],
    network: string,
    method: string,
    serializedPayload: string,
  ): Promise<ProxiedRpcResponse> {
    let lastError: unknown;

    for (const url of endpoints) {
      try {
        const result = await this.fetchUpstream(url, serializedPayload, network, method);
        this.failover.recordSuccess(network, url);
        return result;
      } catch (err) {
        this.failover.recordFailure(network, url);
        lastError = err;
        // Continue to next endpoint unless it's a client error (4xx)
        if (
          err instanceof BadRequestException ||
          err instanceof PayloadTooLargeException
        ) {
          throw err;
        }
      }
    }

    throw lastError ?? new BadGatewayException("All upstream RPC endpoints failed");
  }

  private async fetchUpstream(
    rpcUrl: string,
    serializedPayload: string,
    network: string,
    method: string,
  ): Promise<ProxiedRpcResponse> {
    const policy = getMethodPolicy(method);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), policy.timeoutMs);
    const start = Date.now();
    const correlationId = getCorrelationId();

    try {
      const upstreamResponse = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // DEVOPS-001: Propagate correlation ID to upstream RPC
          ...(correlationId ? { "x-request-id": correlationId } : {}),
        },
        body: serializedPayload,
        signal: controller.signal,
      });

      const rawBody = await upstreamResponse.text();
      const contentType =
        upstreamResponse.headers.get("content-type") ?? "text/plain";

      const result: ProxiedRpcResponse = contentType.includes("application/json")
        ? (() => {
            try {
              return { statusCode: upstreamResponse.status, contentType, body: JSON.parse(rawBody) };
            } catch {
              return { statusCode: upstreamResponse.status, contentType: "text/plain", body: rawBody };
            }
          })()
        : { statusCode: upstreamResponse.status, contentType, body: rawBody };

      this.events.emit(RPC_PROXIED, {
        network,
        method,
        statusCode: result.statusCode,
        durationMs: Date.now() - start,
        cached: false,
        correlationId,
      });

      return result;
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        this.events.emit(RPC_UPSTREAM_ERROR, {
          network,
          method,
          errorName: "AbortError",
          correlationId,
        });
        throw new GatewayTimeoutException(
          `RPC upstream timed out after ${policy.timeoutMs}ms`
        );
      }

      this.events.emit(RPC_UPSTREAM_ERROR, {
        network,
        method,
        errorName: error instanceof Error ? error.name : "UnknownError",
        correlationId,
      });
      throw new BadGatewayException("Failed to proxy RPC request");
    } finally {
      clearTimeout(timeout);
    }
  }
}
