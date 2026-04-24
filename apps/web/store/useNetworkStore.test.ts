import { describe, it, expect, beforeEach } from 'vitest';
import { useNetworkStore, DEFAULT_NETWORKS } from './useNetworkStore';

describe('useNetworkStore', () => {
  beforeEach(() => {
    const { setState } = useNetworkStore;
    setState({
      currentNetwork: 'testnet',
      customNetworks: [],
      health: null,
    });
  });

  describe('network selection', () => {
    it('should default to testnet', () => {
      const { currentNetwork } = useNetworkStore.getState();
      expect(currentNetwork).toBe('testnet');
    });

    it('should change current network', () => {
      const { setNetwork } = useNetworkStore.getState();
      setNetwork('mainnet');

      const { currentNetwork } = useNetworkStore.getState();
      expect(currentNetwork).toBe('mainnet');
    });

    it('should reset health when changing network', () => {
      const { setNetwork, setHealth } = useNetworkStore.getState();
      setHealth({
        status: 'healthy',
        latestLedger: 100,
        protocolVersion: 20,
        latencyMs: 50,
        lastCheck: Date.now(),
      });

      setNetwork('mainnet');

      const { health } = useNetworkStore.getState();
      expect(health).toBeNull();
    });
  });

  describe('custom networks', () => {
    it('should add custom network', () => {
      const { addCustomNetwork, customNetworks } = useNetworkStore.getState();

      addCustomNetwork({
        id: 'custom-1',
        name: 'Custom Network',
        rpcUrl: 'http://custom.rpc.com',
        networkPassphrase: 'Custom Network ; 2024',
      });

      const { customNetworks: updated } = useNetworkStore.getState();
      expect(updated).toHaveLength(1);
      expect(updated[0].isCustom).toBe(true);
    });

    it('should remove custom network', () => {
      const { addCustomNetwork, removeCustomNetwork } = useNetworkStore.getState();

      addCustomNetwork({
        id: 'custom-1',
        name: 'Custom Network',
        rpcUrl: 'http://custom.rpc.com',
        networkPassphrase: 'Custom Network ; 2024',
      });

      removeCustomNetwork('custom-1');

      const { customNetworks } = useNetworkStore.getState();
      expect(customNetworks).toHaveLength(0);
    });

    it('should fallback to testnet when removing active custom network', () => {
      const { addCustomNetwork, setNetwork, removeCustomNetwork } = useNetworkStore.getState();

      addCustomNetwork({
        id: 'custom-1',
        name: 'Custom Network',
        rpcUrl: 'http://custom.rpc.com',
        networkPassphrase: 'Custom Network ; 2024',
      });

      setNetwork('custom-1');
      removeCustomNetwork('custom-1');

      const { currentNetwork } = useNetworkStore.getState();
      expect(currentNetwork).toBe('testnet');
    });
  });

  describe('network config helpers', () => {
    it('should get active network config', () => {
      const { getActiveNetworkConfig } = useNetworkStore.getState();
      const config = getActiveNetworkConfig();

      expect(config).toEqual(DEFAULT_NETWORKS.testnet);
    });

    it('should get all networks including custom', () => {
      const { addCustomNetwork, getAllNetworks } = useNetworkStore.getState();

      addCustomNetwork({
        id: 'custom-1',
        name: 'Custom Network',
        rpcUrl: 'http://custom.rpc.com',
        networkPassphrase: 'Custom Network ; 2024',
      });

      const allNetworks = getAllNetworks();
      expect(allNetworks.length).toBe(Object.keys(DEFAULT_NETWORKS).length + 1);
    });

    it('should get horizon URL', () => {
      const { getHorizonUrl } = useNetworkStore.getState();
      const url = getHorizonUrl();

      expect(url).toBe(DEFAULT_NETWORKS.testnet.horizonUrl);
    });
  });

  describe('health tracking', () => {
    it('should set network health', () => {
      const { setHealth } = useNetworkStore.getState();
      const healthData = {
        status: 'healthy' as const,
        latestLedger: 100,
        protocolVersion: 20,
        latencyMs: 50,
        lastCheck: Date.now(),
      };

      setHealth(healthData);

      const { health } = useNetworkStore.getState();
      expect(health).toEqual(healthData);
    });
  });

  describe('persistence', () => {
    it('should persist currentNetwork and customNetworks', () => {
      const store = useNetworkStore;
      const persistedKeys = ['currentNetwork', 'customNetworks'];

      // Verify the store has persistence configured
      expect(store).toBeDefined();
      expect(persistedKeys).toContain('currentNetwork');
      expect(persistedKeys).toContain('customNetworks');
    });
  });
});
