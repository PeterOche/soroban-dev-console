import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface NetworkHealth {
  status: "healthy" | "degraded" | "offline";
  latestLedger: number;
  protocolVersion: number;
  latencyMs: number;
  lastCheck: number;
}

export interface NetworkConfig {
  id: string;
  name: string;
  rpcUrl: string;
  networkPassphrase: string;
  horizonUrl?: string;
  isCustom?: boolean;
}

// Default/System Networks (Read-only)
export const DEFAULT_NETWORKS: Record<string, NetworkConfig> = {
  mainnet: {
    id: "mainnet",
    name: "Mainnet",
    rpcUrl: "https://soroban-rpc.mainnet.stellar.org",
    networkPassphrase: "Public Global Stellar Network ; September 2015",
    horizonUrl: "https://horizon.stellar.org",
  },
  testnet: {
    id: "testnet",
    name: "Testnet",
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    horizonUrl: "https://horizon-testnet.stellar.org",
  },
  futurenet: {
    id: "futurenet",
    name: "Futurenet",
    rpcUrl: "https://rpc-futurenet.stellar.org",
    networkPassphrase: "Test SDF Future Network ; October 2022",
    horizonUrl: "https://horizon-futurenet.stellar.org",
  },
  local: {
    id: "local",
    name: "Local Standalone",
    rpcUrl: "http://localhost:8000/soroban/rpc",
    networkPassphrase: "Standalone Network ; February 2017",
    horizonUrl: "http://localhost:8000",
  },
};

interface NetworkState {
  currentNetwork: string;
  customNetworks: NetworkConfig[];
  health: NetworkHealth | null;

  setNetwork: (id: string) => void;
  setHealth: (health: NetworkHealth | null) => void;
  addCustomNetwork: (network: NetworkConfig) => void;
  removeCustomNetwork: (id: string) => void;

  // Helpers
  getActiveNetworkConfig: () => NetworkConfig;
  getAllNetworks: () => NetworkConfig[];
  getHorizonUrl: () => string;
  // FE-042: check if a previously-recorded network still matches current
  isNetworkMismatch: (recordedNetworkId: string | null) => boolean;
}

export const useNetworkStore = create<NetworkState>()(
  persist(
    (set, get) => ({
      currentNetwork: "testnet",
      customNetworks: [],
      health: null,

      setNetwork: (id) => set({ currentNetwork: id, health: null }),
      setHealth: (health) => set({ health }),

      addCustomNetwork: (network) =>
        set((state) => ({
          customNetworks: [
            ...state.customNetworks,
            { ...network, isCustom: true },
          ],
        })),

      removeCustomNetwork: (id) =>
        set((state) => {
          const nextNetwork =
            state.currentNetwork === id ? "testnet" : state.currentNetwork;
          return {
            customNetworks: state.customNetworks.filter((n) => n.id !== id),
            currentNetwork: nextNetwork,
          };
        }),

      getActiveNetworkConfig: () => {
        const state = get();
        const all = { ...DEFAULT_NETWORKS };
        state.customNetworks.forEach((n) => (all[n.id] = n));
        return all[state.currentNetwork] || DEFAULT_NETWORKS["testnet"];
      },

      getAllNetworks: () => {
        const state = get();
        return [...Object.values(DEFAULT_NETWORKS), ...state.customNetworks];
      },

      getHorizonUrl: () => {
        const network = get().getActiveNetworkConfig();
        return network.horizonUrl ?? DEFAULT_NETWORKS["testnet"].horizonUrl!;
      },

      // FE-042: returns true when the active network differs from a recorded one
      isNetworkMismatch: (recordedNetworkId) => {
        if (!recordedNetworkId) return false;
        return get().currentNetwork !== recordedNetworkId;
      },
    }),
    {
      name: "soroban-network-storage",
      partialize: (state) => ({
        currentNetwork: state.currentNetwork,
        customNetworks: state.customNetworks,
      }),
    },
  ),
);
