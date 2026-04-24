import { WasmEntry } from "../store/useWasmStore";

export interface ArtifactIntrospection {
  contractId: string;
  wasmHash?: string;
  lastModifiedLedger?: number;
  localArtifact?: WasmEntry;
  hasOnchainCode: boolean;
  hasLocalArtifact: boolean;
}

export function buildArtifactIntrospection(
  contractId: string,
  wasmHash: string | undefined,
  lastModifiedLedger: number | undefined,
  wasms: WasmEntry[],
): ArtifactIntrospection {
  const localArtifact = wasmHash
    ? wasms.find((w) => w.hash === wasmHash)
    : undefined;

  return {
    contractId,
    wasmHash,
    lastModifiedLedger,
    localArtifact,
    hasOnchainCode: !!wasmHash,
    hasLocalArtifact: !!localArtifact,
  };
}

export function formatWasmHash(hash: string | undefined): string {
  if (!hash) return "—";
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}
