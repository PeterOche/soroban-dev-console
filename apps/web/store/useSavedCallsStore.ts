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
  workspaceId?: string;
}

export interface CartItem extends SavedCall {
  cartItemId: string;
}

export interface OperationPreset {
  id: string;
  name: string;
  contractId: string;
  fnName: string;
  args: ContractArg[];
  network: string;
  source: "token" | "admin" | "explorer" | "custom";
  createdAt: number;
  lastUsedAt?: number;
}

interface SavedCallsState {
  savedCalls: SavedCall[];
  cartItems: CartItem[];
  presets: OperationPreset[];
  saveCall: (call: Omit<SavedCall, "id" | "createdAt">) => SavedCall;
  removeCall: (id: string) => void;
  getCallsForContract: (contractId: string) => SavedCall[];
  addToCart: (call: SavedCall) => void;
  removeFromCart: (cartItemId: string) => void;
  moveCartItem: (cartItemId: string, direction: "up" | "down") => void;
  clearCart: () => void;
  getCallsForWorkspace: (workspaceId: string) => SavedCall[];
  assignCallToWorkspace: (callId: string, workspaceId: string) => void;
  unassignCallFromWorkspace: (callId: string) => void;
  /** FE-056: persist reusable operation presets */
  savePreset: (preset: Omit<OperationPreset, "id" | "createdAt" | "lastUsedAt">) => OperationPreset;
  removePreset: (presetId: string) => void;
  getPresetsForContract: (contractId: string) => OperationPreset[];
  /** FE-056: apply a preset by creating a saved call and adding it to cart */
  applyPresetToCart: (presetId: string, options?: { workspaceId?: string }) => SavedCall | null;
  /** FE-056: recover stale preset by switching network context */
  repairPresetNetwork: (presetId: string, network: string) => void;
}

export const useSavedCallsStore = create<SavedCallsState>()(
  persist(
    (set, get) => ({
      savedCalls: [],
      cartItems: [],
      presets: [],

      saveCall: (call) => {
        const savedCall: SavedCall = {
          ...call,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };
        set((state) => ({ savedCalls: [savedCall, ...state.savedCalls] }));
        return savedCall;
      },

      removeCall: (id) =>
        set((state) => ({
          savedCalls: state.savedCalls.filter((c) => c.id !== id),
        })),

      getCallsForContract: (contractId) =>
        get().savedCalls.filter((c) => c.contractId === contractId),

      addToCart: (call) =>
        set((state) => ({
          cartItems: [
            ...state.cartItems,
            { ...call, cartItemId: crypto.randomUUID() },
          ],
        })),

      removeFromCart: (cartItemId) =>
        set((state) => ({
          cartItems: state.cartItems.filter((c) => c.cartItemId !== cartItemId),
        })),

      moveCartItem: (cartItemId, direction) =>
        set((state) => {
          const items = [...state.cartItems];
          const index = items.findIndex((c) => c.cartItemId === cartItemId);
          if (index === -1) return state;
          const target = direction === "up" ? index - 1 : index + 1;
          if (target < 0 || target >= items.length) return state;
          [items[index], items[target]] = [items[target], items[index]];
          return { cartItems: items };
        }),

      clearCart: () => set({ cartItems: [] }),

      getCallsForWorkspace: (workspaceId) =>
        get().savedCalls.filter((c) => c.workspaceId === workspaceId),

      assignCallToWorkspace: (callId, workspaceId) =>
        set((state) => ({
          savedCalls: state.savedCalls.map((c) =>
            c.id === callId ? { ...c, workspaceId } : c,
          ),
        })),

      unassignCallFromWorkspace: (callId) =>
        set((state) => ({
          savedCalls: state.savedCalls.map((c) =>
            c.id === callId ? { ...c, workspaceId: undefined } : c,
          ),
        })),

      savePreset: (preset) => {
        const next: OperationPreset = {
          ...preset,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        };
        set((state) => ({ presets: [next, ...state.presets] }));
        return next;
      },

      removePreset: (presetId) =>
        set((state) => ({
          presets: state.presets.filter((preset) => preset.id !== presetId),
        })),

      getPresetsForContract: (contractId) =>
        get().presets.filter((preset) => preset.contractId === contractId),

      applyPresetToCart: (presetId, options) => {
        const preset = get().presets.find((entry) => entry.id === presetId);
        if (!preset) return null;

        const savedCall: SavedCall = {
          id: crypto.randomUUID(),
          name: preset.name,
          contractId: preset.contractId,
          fnName: preset.fnName,
          args: preset.args,
          network: preset.network,
          createdAt: Date.now(),
          workspaceId: options?.workspaceId,
        };

        set((state) => ({
          savedCalls: [savedCall, ...state.savedCalls],
          cartItems: [...state.cartItems, { ...savedCall, cartItemId: crypto.randomUUID() }],
          presets: state.presets.map((entry) =>
            entry.id === presetId ? { ...entry, lastUsedAt: Date.now() } : entry,
          ),
        }));

        return savedCall;
      },

      repairPresetNetwork: (presetId, network) =>
        set((state) => ({
          presets: state.presets.map((preset) =>
            preset.id === presetId ? { ...preset, network } : preset,
          ),
        })),
    }),
    { name: "soroban-saved-calls" },
  ),
);
