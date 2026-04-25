import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ResultBundleKind = "single-call" | "batch" | "deploy";

export interface ResultBundle {
  id: string;
  kind: ResultBundleKind;
  title: string;
  createdAt: number;
  networkId: string;
  workspaceId?: string;
  contractId?: string;
  txHash?: string;
  payload: unknown;
}

interface ResultBundlesState {
  bundles: ResultBundle[];
  addBundle: (bundle: Omit<ResultBundle, "id" | "createdAt">) => ResultBundle;
  removeBundle: (id: string) => void;
  clearBundles: () => void;
  getRecentBundles: (limit?: number) => ResultBundle[];
}

export const useResultBundlesStore = create<ResultBundlesState>()(
  persist(
    (set, get) => ({
      bundles: [],

      addBundle: (bundle) => {
        const entry: ResultBundle = {
          ...bundle,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };
        set((state) => ({ bundles: [entry, ...state.bundles].slice(0, 200) }));
        return entry;
      },

      removeBundle: (id) =>
        set((state) => ({ bundles: state.bundles.filter((bundle) => bundle.id !== id) })),

      clearBundles: () => set({ bundles: [] }),

      getRecentBundles: (limit = 20) => get().bundles.slice(0, limit),
    }),
    { name: "soroban-result-bundles" },
  ),
);
