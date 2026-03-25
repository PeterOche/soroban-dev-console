import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  type NormalizedContractSpec,
  createNormalizedContractSpecFromFunctionNames,
} from "@devconsole/soroban-utils";

type LegacyContractSpec = {
  functions?: string[];
  rawSpec?: string;
};

interface AbiState {
  specs: Record<string, NormalizedContractSpec>;
  setSpec: (contractId: string, spec: NormalizedContractSpec) => void;
  getSpec: (contractId: string) => NormalizedContractSpec | undefined;
}

export const useAbiStore = create<AbiState>()(
  persist(
    (set, get) => ({
      specs: {},
      setSpec: (contractId, spec) =>
        set((state) => ({
          specs: { ...state.specs, [contractId]: spec },
        })),
      getSpec: (contractId) => get().specs[contractId],
    }),
    {
      name: "soroban-abi-storage",
      version: 2,
      migrate: (persistedState) => {
        const state = persistedState as
          | {
              specs?: Record<string, LegacyContractSpec | NormalizedContractSpec>;
            }
          | undefined;

        const migratedSpecs = Object.fromEntries(
          Object.entries(state?.specs ?? {}).map(([contractId, spec]) => {
            if (spec && Array.isArray((spec as NormalizedContractSpec).functions)) {
              const normalized = spec as NormalizedContractSpec;
              if (
                normalized.functions.every(
                  (entry) => entry && typeof entry === "object" && "name" in entry,
                )
              ) {
                return [contractId, normalized];
              }
            }

            const legacy = spec as LegacyContractSpec;
            return [
              contractId,
              {
                ...createNormalizedContractSpecFromFunctionNames(
                  legacy?.functions ?? [],
                  "workspace",
                  legacy?.rawSpec ?? "",
                ),
                contractId,
              },
            ];
          }),
        );

        return {
          specs: migratedSpecs,
        };
      },
    },
  ),
);
