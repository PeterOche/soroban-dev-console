import { create } from "zustand";
import { persist } from "zustand/middleware";
import { ContractArg } from "@devconsole/soroban-utils";

export interface SavedCall {
  id: string;
  name: string;
  contractId: string;
  fnName: string;
  args: ContractArg[];
  network: string;
  createdAt: number;
}

interface SavedCallsState {
  savedCalls: SavedCall[];
  saveCall: (call: Omit<SavedCall, "id" | "createdAt">) => SavedCall;
  removeCall: (id: string) => void;
  getCallsForContract: (contractId: string) => SavedCall[];
}

export const useSavedCallsStore = create<SavedCallsState>()(
  persist(
    (set, get) => ({
      savedCalls: [],

      saveCall: (call) => {
        const savedCall = {
          ...call,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };

        set((state) => ({
          savedCalls: [savedCall, ...state.savedCalls],
        }));

        return savedCall;
      },

      removeCall: (id) =>
        set((state) => ({
          savedCalls: state.savedCalls.filter((c) => c.id !== id),
        })),

      getCallsForContract: (contractId) => {
        return get().savedCalls.filter((c) => c.contractId === contractId);
      },
    }),
    {
      name: "soroban-saved-calls",
    },
  ),
);
