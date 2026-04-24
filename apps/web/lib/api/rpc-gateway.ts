/**
 * BE-013: Unified API-backed RPC execution gateway.
 *
 * Routes simulation, ledger reads, and transaction polling through the
 * backend /api/rpc/:network endpoint instead of calling Soroban RPC directly.
 * Network and upstream errors are normalized consistently.
 *
 * DEVOPS-001: Includes correlation ID tracking for end-to-end request tracing.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

// DEVOPS-001: Generate correlation IDs for request tracing
function generateCorrelationId(): string {
  return crypto.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export class RpcGatewayError extends Error {
  constructor(
    message: string,
    public readonly code?: string,
    public readonly upstream?: unknown,
  ) {
    super(message);
    this.name = "RpcGatewayError";
  }
}

let requestId = 0;

function nextId(): number {
  return ++requestId;
}

export interface JsonRpcRequest {
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

/**
 * Send a single JSON-RPC request through the API gateway.
 */
export async function rpcCall<T = unknown>(
  network: string,
  method: string,
  params?: unknown,
): Promise<T> {
  const id = nextId();
  const correlationId = generateCorrelationId();
  const body: JsonRpcRequest & { jsonrpc: "2.0"; id: number } = {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/rpc/${network}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // DEVOPS-001: Include correlation ID for tracing
        "x-request-id": correlationId,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    throw new RpcGatewayError(
      `Network error reaching RPC gateway [${correlationId}]`,
      "NETWORK_ERROR",
      err,
    );
  }

  if (!res.ok) {
    throw new RpcGatewayError(
      `RPC gateway returned HTTP ${res.status} [${correlationId}]`,
      "HTTP_ERROR",
    );
  }

  const json = (await res.json()) as JsonRpcResponse<T>;

  if (json.error) {
    throw new RpcGatewayError(
      json.error.message,
      String(json.error.code),
      json.error.data,
    );
  }

  return json.result as T;
}

/**
 * Send a batch of JSON-RPC requests through the API gateway.
 */
export async function rpcBatch<T = unknown>(
  network: string,
  requests: JsonRpcRequest[],
): Promise<JsonRpcResponse<T>[]> {
  const correlationId = generateCorrelationId();
  const batch = requests.map((r) => ({
    jsonrpc: "2.0" as const,
    id: nextId(),
    method: r.method,
    params: r.params,
  }));

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/api/rpc/${network}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // DEVOPS-001: Include correlation ID for tracing
        "x-request-id": correlationId,
      },
      body: JSON.stringify(batch),
    });
  } catch (err) {
    throw new RpcGatewayError(
      `Network error reaching RPC gateway [${correlationId}]`,
      "NETWORK_ERROR",
      err,
    );
  }

  if (!res.ok) {
    throw new RpcGatewayError(
      `RPC gateway returned HTTP ${res.status} [${correlationId}]`,
      "HTTP_ERROR",
    );
  }

  return res.json() as Promise<JsonRpcResponse<T>[]>;
}

// ── Typed helpers for common Soroban RPC methods ──────────────────────────────

export const sorobanRpc = {
  simulateTransaction: (network: string, xdr: string) =>
    rpcCall(network, "simulateTransaction", { transaction: xdr }),

  sendTransaction: (network: string, xdr: string) =>
    rpcCall(network, "sendTransaction", { transaction: xdr }),

  getTransaction: (network: string, hash: string) =>
    rpcCall(network, "getTransaction", { hash }),

  getLedgerEntries: (network: string, keys: string[]) =>
    rpcCall(network, "getLedgerEntries", { keys }),

  getLatestLedger: (network: string) =>
    rpcCall(network, "getLatestLedger"),

  getEvents: (network: string, params: unknown) =>
    rpcCall(network, "getEvents", params),
};
