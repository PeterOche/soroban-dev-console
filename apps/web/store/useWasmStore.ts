import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Provenance ────────────────────────────────────────────────────────────────

export type ProvenanceRelationship = "inferred" | "confirmed";

export interface ProvenanceNode {
  wasmHash: string;
  contractId: string;
  relationship: ProvenanceRelationship;
  network: string;
  deployedAt: number;
}

// ── WASM entry ────────────────────────────────────────────────────────────────

export interface WasmEntry {
  hash: string;
  /** FE-050: canonical name shared across versions */
  name: string;
  /** FE-050: semver-style version tag, e.g. "1.0.0" */
  version: string;
  network: string;
  installedAt: number;
  functions?: string[];
  deployedContractId?: string;
  deployedAt?: number;
  workspaceId?: string;
  parseError?: boolean;
  provenance?: ProvenanceNode[];
  /** FE-050: IDs of workspaces / deployments that pin this artifact */
  pinnedBy?: string[];
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface WasmState {
  wasms: WasmEntry[];
  addWasm: (entry: Omit<WasmEntry, "version"> & { version?: string }) => void;
  removeWasm: (hash: string) => void;
  associateContract: (hash: string, contractId: string, relationship?: ProvenanceRelationship) => void;
  addProvenanceNode: (node: ProvenanceNode) => void;
  getProvenance: (hash: string) => ProvenanceNode[];
  /** FE-050: pin an artifact so retention rules won't auto-remove it */
  pinArtifact: (hash: string, pinnedById: string) => void;
  /** FE-050: unpin an artifact */
  unpinArtifact: (hash: string, pinnedById: string) => void;
  /** FE-050: remove entries that are not pinned and older than maxAgeMs */
  pruneUnpinned: (maxAgeMs?: number) => void;
}

/** FE-050: derive the next version for a given artifact name */
function nextVersion(existing: WasmEntry[], name: string): string {
  const versions = existing
    .filter((w) => w.name === name)
    .map((w) => {
      const parts = w.version.split(".").map(Number);
      return parts[0] * 1_000_000 + (parts[1] ?? 0) * 1_000 + (parts[2] ?? 0);
    });
  if (versions.length === 0) return "1.0.0";
  const max = Math.max(...versions);
  const major = Math.floor(max / 1_000_000);
  const minor = Math.floor((max % 1_000_000) / 1_000);
  const patch = max % 1_000;
  return `${major}.${minor}.${patch + 1}`;
}

const DEFAULT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const useWasmStore = create<WasmState>()(
  persist(
    (set, get) => ({
      wasms: [],

      addWasm: (entry) =>
        set((state) => {
          // FE-050: deduplication — same binary hash on same network is a no-op update
          const existing = state.wasms.find(
            (w) => w.hash === entry.hash && w.network === entry.network,
          );
          if (existing) {
            return {
              wasms: state.wasms.map((w) =>
                w.hash === entry.hash && w.network === entry.network
                  ? {
                      ...w,
                      name: entry.name,
                      functions: entry.functions ?? w.functions,
                      workspaceId: entry.workspaceId ?? w.workspaceId,
                    }
                  : w,
              ),
            };
          }

          // FE-050: same name → bump version; new name → 1.0.0
          const version = entry.version ?? nextVersion(state.wasms, entry.name);
          return { wasms: [{ ...entry, version }, ...state.wasms] };
        }),

      removeWasm: (hash) =>
        set((state) => {
          const entry = state.wasms.find((w) => w.hash === hash);
          // FE-050: retention — refuse to remove pinned artifacts
          if (entry && (entry.pinnedBy?.length ?? 0) > 0) return state;
          return { wasms: state.wasms.filter((w) => w.hash !== hash) };
        }),

      associateContract: (hash, contractId, relationship = "confirmed") =>
        set((state) => ({
          wasms: state.wasms.map((w) => {
            if (w.hash !== hash) return w;
            const now = Date.now();
            const node: ProvenanceNode = {
              wasmHash: hash,
              contractId,
              relationship,
              network: w.network,
              deployedAt: now,
            };
            return {
              ...w,
              deployedContractId: contractId,
              deployedAt: now,
              provenance: [
                ...(w.provenance ?? []).filter((p) => p.contractId !== contractId),
                node,
              ],
            };
          }),
        })),

      addProvenanceNode: (node) =>
        set((state) => ({
          wasms: state.wasms.map((w) =>
            w.hash === node.wasmHash
              ? {
                  ...w,
                  provenance: [
                    ...(w.provenance ?? []).filter((p) => p.contractId !== node.contractId),
                    node,
                  ],
                }
              : w,
          ),
        })),

      getProvenance: (hash) => {
        const entry = get().wasms.find((w) => w.hash === hash);
        return entry?.provenance ?? [];
      },

      pinArtifact: (hash, pinnedById) =>
        set((state) => ({
          wasms: state.wasms.map((w) =>
            w.hash === hash
              ? { ...w, pinnedBy: [...new Set([...(w.pinnedBy ?? []), pinnedById])] }
              : w,
          ),
        })),

      unpinArtifact: (hash, pinnedById) =>
        set((state) => ({
          wasms: state.wasms.map((w) =>
            w.hash === hash
              ? { ...w, pinnedBy: (w.pinnedBy ?? []).filter((id) => id !== pinnedById) }
              : w,
          ),
        })),

      pruneUnpinned: (maxAgeMs = DEFAULT_RETENTION_MS) => {
        const cutoff = Date.now() - maxAgeMs;
        set((state) => ({
          wasms: state.wasms.filter(
            (w) =>
              (w.pinnedBy?.length ?? 0) > 0 ||
              w.deployedContractId !== undefined ||
              w.installedAt > cutoff,
          ),
        }));
      },
    }),
    { name: "soroban-wasm-storage" },
  ),
);
