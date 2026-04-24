import { STORE_SCHEMA_VERSION } from "./schema-version";

export interface WorkspaceArtifactRef {
  kind: "wasm" | "decoded-xdr" | "storage-query" | "simulation";
  id: string;
  /** SC-003: Contract instance ID linked to this artifact, if deployed */
  contractId?: string;
  /** SC-003: How the link was established */
  relationship?: "inferred" | "confirmed";
}

export interface WorkspaceSnapshot {
  version: typeof STORE_SCHEMA_VERSION;
  id: string;
  name: string;
  contractIds: string[];
  savedCallIds: string[];
  artifactRefs: WorkspaceArtifactRef[];
  selectedNetwork: string;
  createdAt: number;
  updatedAt: number;
}
