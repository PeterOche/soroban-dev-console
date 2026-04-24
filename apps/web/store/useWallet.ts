import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  walletProviders,
  assertCapability,
  type WalletCapabilities,
  type WalletProviderId,
} from "@/lib/wallet/provider";
import { useNetworkStore } from "@/store/useNetworkStore";

// FE-042: Session revalidation state
export type SessionStatus = "valid" | "stale" | "mismatch" | "disconnected";

interface WalletState {
  isConnected: boolean;
  address: string | null;
  walletType: WalletProviderId | null;
  // FE-042: track session health
  sessionStatus: SessionStatus;
  networkAtConnect: string | null;
  // FE-043: sandbox mode
  isSandboxMode: boolean;

  connect: (provider: WalletProviderId) => Promise<void>;
  disconnect: () => void;
  // FE-041: capability-aware sign abstraction
  signTransaction: (xdr: string, networkPassphrase: string) => Promise<string>;
  getCapabilities: () => WalletCapabilities | null;
  // FE-042: revalidation
  revalidateSession: () => Promise<SessionStatus>;
  // FE-043: sandbox helpers
  enterSandbox: () => void;
  exitSandbox: () => void;
}

export const useWallet = create<WalletState>()(
  persist(
    (set, get) => ({
      isConnected: false,
      address: null,
      walletType: null,
      sessionStatus: "disconnected",
      networkAtConnect: null,
      isSandboxMode: false,

      connect: async (provider) => {
        try {
          const session = await walletProviders[provider].connect();
          const currentNetwork = useNetworkStore.getState().currentNetwork;
          set({
            isConnected: true,
            address: session.address,
            walletType: session.provider,
            sessionStatus: "valid",
            networkAtConnect: currentNetwork,
            isSandboxMode: false,
          });
        } catch (e: any) {
          console.error(`${provider} connection failed`, e);
          throw e;
        }
      },

      disconnect: () => {
        set({
          isConnected: false,
          address: null,
          walletType: null,
          sessionStatus: "disconnected",
          networkAtConnect: null,
          isSandboxMode: false,
        });
      },

      // FE-041: unified signing abstraction with capability guard
      signTransaction: async (xdr, networkPassphrase) => {
        const { walletType, isConnected } = get();
        if (!isConnected || !walletType) {
          throw new Error("No wallet connected.");
        }
        assertCapability(walletType, "canSign");
        return walletProviders[walletType].signTransaction(xdr, networkPassphrase);
      },

      // FE-041: expose capability metadata
      getCapabilities: () => {
        const { walletType } = get();
        if (!walletType) return null;
        return walletProviders[walletType].capabilities;
      },

      // FE-042: revalidate persisted session against live provider state
      revalidateSession: async () => {
        const { walletType, isConnected, networkAtConnect } = get();

        if (!isConnected || !walletType) {
          set({ sessionStatus: "disconnected" });
          return "disconnected";
        }

        const stillLive = await walletProviders[walletType].revalidate();
        if (!stillLive) {
          set({ sessionStatus: "stale", isConnected: false });
          return "stale";
        }

        // FE-042: detect network mismatch
        const currentNetwork = useNetworkStore.getState().currentNetwork;
        if (networkAtConnect && networkAtConnect !== currentNetwork) {
          set({ sessionStatus: "mismatch" });
          return "mismatch";
        }

        set({ sessionStatus: "valid" });
        return "valid";
      },

      // FE-043: enter wallet-less sandbox mode
      enterSandbox: () => {
        set({ isSandboxMode: true });
      },

      // FE-043: exit sandbox, preserving any in-progress state
      exitSandbox: () => {
        set({ isSandboxMode: false });
      },
    }),
    {
      name: "soroban-wallet-storage",
      // FE-042: don't persist transient session status
      partialize: (state) => ({
        isConnected: state.isConnected,
        address: state.address,
        walletType: state.walletType,
        networkAtConnect: state.networkAtConnect,
      }),
    },
  ),
);
