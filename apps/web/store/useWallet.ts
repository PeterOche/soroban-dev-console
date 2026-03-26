import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  walletProviders,
  type WalletProviderId,
} from "@/lib/wallet/provider";

interface WalletState {
  isConnected: boolean;
  address: string | null;
  walletType: WalletProviderId | null;
  connect: (provider: WalletProviderId) => Promise<void>;
  disconnect: () => void;
}

export const useWallet = create<WalletState>()(
  persist(
    (set) => ({
      isConnected: false,
      address: null,
      walletType: null,

      connect: async (provider) => {
        try {
          const session = await walletProviders[provider].connect();

          set({
            isConnected: true,
            address: session.address,
            walletType: session.provider,
          });
        } catch (e: any) {
          console.error(`${provider} connection failed`, e);
          throw e;
        }
      },

      disconnect: () => {
        set({ isConnected: false, address: null, walletType: null });
      },
    }),
    {
      name: "soroban-wallet-storage",
    },
  ),
);
