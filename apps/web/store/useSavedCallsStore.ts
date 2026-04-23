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

interface SavedCallsState {
  savedCalls: SavedCall[];
  cartItems: CartItem[];
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
}

export const useSavedCallsStore = create<SavedCallsState>()(
  persist(
    (set, get) => ({
      savedCalls: [],
      cartItems: [],

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
    }),
    { name: "soroban-saved-calls" },
  ),
);
