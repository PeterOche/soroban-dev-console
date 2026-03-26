export interface WorkspaceArtifactRef {
  kind: "wasm" | "decoded-xdr" | "storage-query" | "simulation";
  id: string;
}

export interface WorkspaceSnapshot {
  version: 2;
  id: string;
  name: string;
  contractIds: string[];
  savedCallIds: string[];
  artifactRefs: WorkspaceArtifactRef[];
  selectedNetwork: string;
  createdAt: number;
  updatedAt: number;
}
