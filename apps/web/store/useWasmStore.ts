import { create } from "zustand";
import { persist } from "zustand/middleware";

// ── Provenance ────────────────────────────────────────────────────────────────

export type ProvenanceRelationship = "inferred" | "confirmed";

export interface ProvenanceNode {
  /** The WASM hash this node belongs to */
  wasmHash: string;
  /** Contract instance ID produced by deploying this WASM */
  contractId: string;
  /** How the link was established */
  relationship: ProvenanceRelationship;
  network: string;
  deployedAt: number;
}

// ── WASM entry ────────────────────────────────────────────────────────────────

export interface WasmEntry {
  hash: string;
  name: string;
  network: string;
  installedAt: number;
  functions?: string[];
  /** Contract ID associated after a successful deploy */
  deployedContractId?: string;
  deployedAt?: number;
  /** Workspace context at upload time */
  workspaceId?: string;
  /** Whether the last parse attempt failed */
  parseError?: boolean;
  /** SC-003: Provenance nodes linking this WASM to deployed contract instances */
  provenance?: ProvenanceNode[];
}

// ── Store ─────────────────────────────────────────────────────────────────────

interface WasmState {
  wasms: WasmEntry[];
  addWasm: (entry: WasmEntry) => void;
  removeWasm: (hash: string) => void;
  associateContract: (hash: string, contractId: string, relationship?: ProvenanceRelationship) => void;
  /** SC-003: Add a provenance node to a WASM entry */
  addProvenanceNode: (node: ProvenanceNode) => void;
  /** SC-003: Get all provenance nodes for a given WASM hash */
  getProvenance: (hash: string) => ProvenanceNode[];
  /** FE-048: Guided deploy pipeline state */
  pipeline: DeployPipelineState;
  /** FE-048: Advance the pipeline to the next phase */
  advancePipeline: (phase: DeployPhase, update?: Partial<DeployPipelineState>) => void;
  /** FE-048: Reset the pipeline to idle */
  resetPipeline: () => void;
}

export const useWasmStore = create<WasmState>()(
  persist(
    (set, get) => ({
      wasms: [],

      addWasm: (entry) =>
        set((state) => {
          const existing = state.wasms.find((w) => w.hash === entry.hash);
          if (existing) {
            return {
              wasms: state.wasms.map((w) =>
                w.hash === entry.hash
                  ? { ...w, name: entry.name, network: entry.network, functions: entry.functions ?? w.functions }
                  : w,
              ),
            };
          }
          return { wasms: [entry, ...state.wasms] };
        }),

      removeWasm: (hash) =>
        set((state) => ({
          wasms: state.wasms.filter((w) => w.hash !== hash),
        })),

      associateContract: (hash, contractId, relationship = "confirmed") =>
        set((state) => ({
          wasms: state.wasms.map((w) => {
            if (w.hash !== hash) return w;
            const now = Date.now();
            const network = w.network;
            const node: ProvenanceNode = { wasmHash: hash, contractId, relationship, network, deployedAt: now };
            return {
              ...w,
              deployedContractId: contractId,
              deployedAt: now,
              provenance: [...(w.provenance ?? []).filter((p) => p.contractId !== contractId), node],
            };
          }),
        })),

      addProvenanceNode: (node) =>
        set((state) => ({
          wasms: state.wasms.map((w) =>
            w.hash === node.wasmHash
              ? {
                  ...w,
                  provenance: [...(w.provenance ?? []).filter((p) => p.contractId !== node.contractId), node],
                }
              : w,
          ),
        })),

      getProvenance: (hash) => {
        const entry = get().wasms.find((w) => w.hash === hash);
        return entry?.provenance ?? [];
      },

      // FE-048: Deploy pipeline
      pipeline: INITIAL_PIPELINE,

      advancePipeline: (phase, update = {}) =>
        set((state) => ({
          pipeline: {
            ...state.pipeline,
            ...update,
            phase,
            phaseStartedAt: Date.now(),
            error: phase === "error" ? (update.error ?? state.pipeline.error) : null,
          },
        })),

      resetPipeline: () => set({ pipeline: INITIAL_PIPELINE }),
    }),
    { name: "soroban-wasm-storage" },
  ),
);

// ── FE-048: Deploy pipeline state machine ─────────────────────────────────────

/** Ordered phases of the guided deploy pipeline */
export type DeployPhase = "idle" | "install" | "instantiate" | "publish" | "done" | "error";

export interface DeployPipelineState {
  phase: DeployPhase;
  wasmHash: string | null;
  contractId: string | null;
  txHash: string | null;
  error: string | null;
  /** Timestamp when the current phase started */
  phaseStartedAt: number | null;
}

const INITIAL_PIPELINE: DeployPipelineState = {
  phase: "idle",
  wasmHash: null,
  contractId: null,
  txHash: null,
  error: null,
  phaseStartedAt: null,
};
