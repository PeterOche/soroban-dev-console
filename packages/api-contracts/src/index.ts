/**
 * Shared API contracts and types for Soroban Dev Console
 */

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    path?: string;
  };
}

export interface ApiResponse<T> {
  success: true;
  data: T;
}

export type ApiEnvelope<T> = ApiResponse<T> | ApiErrorResponse;

// ── Workspaces ────────────────────────────────────────────────────────────────

export interface WorkspaceContract {
  contractId: string;
  network: string;
}

export interface WorkspaceInteraction {
  functionName: string;
  argumentsJson: unknown;
}

export interface WorkspaceArtifact {
  kind: string;
  name: string;
  network: string;
  hash: string | null;
  metadata?: unknown;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  description: string | null;
  selectedNetwork: string;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface WorkspaceDetail extends WorkspaceSummary {
  savedContracts: WorkspaceContract[];
  savedInteractions: WorkspaceInteraction[];
  artifacts: WorkspaceArtifact[];
  shares: ShareSummary[];
}

export interface CreateWorkspacePayload {
  name: string;
  description?: string;
  selectedNetwork?: string;
  contracts?: WorkspaceContract[];
  interactions?: WorkspaceInteraction[];
}

export interface UpdateWorkspacePayload {
  name?: string;
  description?: string;
  selectedNetwork?: string;
  contracts?: WorkspaceContract[];
  interactions?: WorkspaceInteraction[];
}

// ── Shares ───────────────────────────────────────────────────────────────────

export interface ShareSummary {
  id: string;
  token: string;
  label: string | null;
  expiresAt: Date | string | null;
  revokedAt: Date | string | null;
  createdAt: Date | string;
}

export interface ShareDetail extends ShareSummary {
  snapshotJson: unknown;
  workspaceId: string;
}

export interface CreateSharePayload {
  workspaceId: string;
  snapshotJson: unknown;
  label?: string;
  expiresInSeconds?: number;
}
