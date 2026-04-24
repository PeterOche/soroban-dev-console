/**
 * FE-013 / FE-014: Typed API client for workspace CRUD and share-link operations.
 * Aligned with backend NestJS routes and shared contracts.
 *
 * DEVOPS-001: Includes correlation ID tracking for end-to-end request tracing.
 */

import {
  ApiEnvelope,
  ApiErrorResponse,
  ApiResponse,
  WorkspaceSummary,
  WorkspaceDetail,
  CreateWorkspacePayload,
  UpdateWorkspacePayload,
  ShareSummary,
  ShareDetail,
  CreateSharePayload,
} from "@devconsole/api-contracts";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

// DEVOPS-001: Generate correlation IDs for request tracing
function generateCorrelationId(): string {
  return crypto.randomUUID?.() || `req-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

async function apiFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // DEVOPS-001: Generate correlation ID for this request
  const correlationId = generateCorrelationId();
  
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 
      "Content-Type": "application/json",
      // If we had auth tokens, we'd add them here
      "x-owner-key": localStorage.getItem("owner-key") || "default-dev-key",
      // DEVOPS-001: Include correlation ID for tracing
      "x-request-id": correlationId,
    },
    ...init,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as ApiEnvelope<any>;
    if (body && "error" in body) {
      throw new ApiError(
        `${body.error.message} [${correlationId}]`,
        body.error.code,
        body.error.details,
      );
    }
    throw new Error(`API error ${res.status}: ${res.statusText} [${correlationId}]`);
  }

  // We assume for now that the backend might or might not wrap success responses
  // But our contracts define ApiResponse<T>. Let's handle both.
  const body = await res.json();
  if (body && typeof body === "object" && "success" in body && body.success === true) {
    return body.data as T;
  }
  return body as T;
}

export class ApiError extends Error {
  constructor(
    public message: string,
    public code: string,
    public details?: any,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Workspaces ────────────────────────────────────────────────────────────────

export const workspacesApi = {
  list: () => 
    apiFetch<WorkspaceSummary[]>("/api/workspaces"),

  get: (id: string) => 
    apiFetch<WorkspaceDetail>(`/api/workspaces/${id}`),

  create: (payload: CreateWorkspacePayload) =>
    apiFetch<WorkspaceSummary>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  update: (id: string, payload: UpdateWorkspacePayload) =>
    apiFetch<WorkspaceSummary>(`/api/workspaces/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  remove: (id: string) =>
    apiFetch<void>(`/api/workspaces/${id}`, {
      method: "DELETE",
    }),

  import: (data: any) =>
    apiFetch<WorkspaceSummary>("/api/workspaces/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),

  export: (id: string) =>
    apiFetch<any>(`/api/workspaces/${id}/export`),
};

// ── Share links ───────────────────────────────────────────────────────────────

export const sharesApi = {
  create: (payload: CreateSharePayload) =>
    apiFetch<ShareDetail>("/api/shares", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  get: (token: string) =>
    apiFetch<ShareDetail>(`/api/shares/${token}`),

  revoke: (token: string) =>
    apiFetch<void>(`/api/shares/${token}`, {
      method: "DELETE",
    }),

  listForWorkspace: (workspaceId: string) =>
    apiFetch<ShareSummary[]>(`/api/shares/workspace/${workspaceId}`),
};
