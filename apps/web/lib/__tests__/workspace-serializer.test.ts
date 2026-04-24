/**
 * DEVOPS-004: Workspace serializer tests.
 *
 * Validates serialization and deserialization of workspace state
 * with version checking and round-trip integrity.
 */

import { describe, it, expect } from "vitest";
import { serializeWorkspace, deserializeWorkspace, SERIALIZER_VERSION } from "@/lib/workspace-serializer";
import { STORE_SCHEMA_VERSION } from "@/store/schema-version";
import type { WorkspaceSnapshot } from "@/store/workspace-schema";
import type { Contract } from "@/store/useContractStore";
import type { SavedCall } from "@/store/useSavedCallsStore";

describe("Workspace Serializer", () => {
  describe("serializeWorkspace", () => {
    it("should serialize workspace with correct version", () => {
      const workspace: WorkspaceSnapshot = {
        version: STORE_SCHEMA_VERSION,
        id: "test-ws",
        name: "Test Workspace",
        contractIds: ["contract-1"],
        savedCallIds: ["call-1"],
        artifactRefs: [],
        selectedNetwork: "testnet",
        createdAt: 1000,
        updatedAt: 2000,
      };

      const result = serializeWorkspace(workspace, [], []);

      expect(result.version).toBe(SERIALIZER_VERSION);
      expect(result.workspace.id).toBe("test-ws");
    });

    it("should filter contracts to only those referenced by workspace", () => {
      const workspace: WorkspaceSnapshot = {
        version: STORE_SCHEMA_VERSION,
        id: "test-ws",
        name: "Test",
        contractIds: ["contract-1"],
        savedCallIds: [],
        artifactRefs: [],
        selectedNetwork: "testnet",
        createdAt: 1000,
        updatedAt: 1000,
      };

      const allContracts: Contract[] = [
        { id: "contract-1", network: "testnet", abi: [] } as Contract,
        { id: "contract-2", network: "testnet", abi: [] } as Contract,
      ];

      const result = serializeWorkspace(workspace, allContracts, []);

      expect(result.contracts).toHaveLength(1);
      expect(result.contracts[0].id).toBe("contract-1");
    });

    it("should filter saved calls to only those referenced by workspace", () => {
      const workspace: WorkspaceSnapshot = {
        version: STORE_SCHEMA_VERSION,
        id: "test-ws",
        name: "Test",
        contractIds: [],
        savedCallIds: ["call-1"],
        artifactRefs: [],
        selectedNetwork: "testnet",
        createdAt: 1000,
        updatedAt: 1000,
      };

      const allSavedCalls: SavedCall[] = [
        { id: "call-1", name: "Call 1" } as SavedCall,
        { id: "call-2", name: "Call 2" } as SavedCall,
      ];

      const result = serializeWorkspace(workspace, [], allSavedCalls);

      expect(result.savedCalls).toHaveLength(1);
      expect(result.savedCalls[0].id).toBe("call-1");
    });

    it("should include exportedAt timestamp", () => {
      const workspace: WorkspaceSnapshot = {
        version: STORE_SCHEMA_VERSION,
        id: "test-ws",
        name: "Test",
        contractIds: [],
        savedCallIds: [],
        artifactRefs: [],
        selectedNetwork: "testnet",
        createdAt: 1000,
        updatedAt: 1000,
      };

      const result = serializeWorkspace(workspace, [], []);

      expect(result.exportedAt).toBeDefined();
      expect(new Date(result.exportedAt).getTime()).toBeGreaterThan(0);
    });
  });

  describe("deserializeWorkspace", () => {
    it("should deserialize valid v2 payload", () => {
      const payload = {
        version: SERIALIZER_VERSION,
        exportedAt: new Date().toISOString(),
        workspace: {
          version: STORE_SCHEMA_VERSION,
          id: "test-ws",
          name: "Test Workspace",
          contractIds: [],
          savedCallIds: [],
          artifactRefs: [],
          selectedNetwork: "testnet",
          createdAt: 1000,
          updatedAt: 1000,
        },
        contracts: [],
        savedCalls: [],
      };

      const result = deserializeWorkspace(payload);

      expect(result.workspace.id).toBe("test-ws");
      expect(result.workspace.name).toBe("Test Workspace");
      expect(result.version).toBe(SERIALIZER_VERSION);
    });

    it("should reject null payload", () => {
      expect(() => deserializeWorkspace(null)).toThrow(
        /Malformed workspace export: not an object/,
      );
    });

    it("should reject non-object payload", () => {
      expect(() => deserializeWorkspace("string")).toThrow(
        /Malformed workspace export: not an object/,
      );
      expect(() => deserializeWorkspace(123)).toThrow(
        /Malformed workspace export: not an object/,
      );
    });

    it("should reject payload missing workspace.id", () => {
      const payload = {
        version: SERIALIZER_VERSION,
        exportedAt: new Date().toISOString(),
        workspace: {
          name: "No ID",
        },
        contracts: [],
        savedCalls: [],
      };

      expect(() => deserializeWorkspace(payload)).toThrow(
        /Malformed workspace payload: missing id or name/,
      );
    });

    it("should reject payload missing workspace.name", () => {
      const payload = {
        version: SERIALIZER_VERSION,
        exportedAt: new Date().toISOString(),
        workspace: {
          id: "no-name",
        },
        contracts: [],
        savedCalls: [],
      };

      expect(() => deserializeWorkspace(payload)).toThrow(
        /Malformed workspace payload: missing id or name/,
      );
    });
  });

  describe("Round-trip integrity", () => {
    it("should preserve all data through serialize → deserialize cycle", () => {
      const original: WorkspaceSnapshot = {
        version: STORE_SCHEMA_VERSION,
        id: "roundtrip-test",
        name: "Roundtrip Test",
        contractIds: ["c1", "c2", "c3"],
        savedCallIds: ["s1", "s2"],
        artifactRefs: [
          {
            kind: "wasm",
            id: "a1",
            contractId: "c1",
            relationship: "confirmed",
          },
          {
            kind: "decoded-xdr",
            id: "a2",
          },
        ],
        selectedNetwork: "mainnet",
        createdAt: 1234567890,
        updatedAt: 1234567899,
      };

      const contracts: Contract[] = [
        { id: "c1", network: "mainnet", abi: [] } as Contract,
        { id: "c2", network: "mainnet", abi: [] } as Contract,
        { id: "c3", network: "mainnet", abi: [] } as Contract,
      ];

      const savedCalls: SavedCall[] = [
        { id: "s1", name: "Call 1" } as SavedCall,
        { id: "s2", name: "Call 2" } as SavedCall,
      ];

      const serialized = serializeWorkspace(original, contracts, savedCalls);
      const deserialized = deserializeWorkspace(serialized);

      // Verify all fields preserved
      expect(deserialized.workspace.id).toBe(original.id);
      expect(deserialized.workspace.name).toBe(original.name);
      expect(deserialized.workspace.contractIds).toEqual(original.contractIds);
      expect(deserialized.workspace.savedCallIds).toEqual(original.savedCallIds);
      expect(deserialized.workspace.artifactRefs).toEqual(original.artifactRefs);
      expect(deserialized.workspace.selectedNetwork).toBe(original.selectedNetwork);
      expect(deserialized.workspace.createdAt).toBe(original.createdAt);
      expect(deserialized.workspace.updatedAt).toBe(original.updatedAt);
      expect(deserialized.workspace.version).toBe(original.version);

      // Verify referenced data preserved
      expect(deserialized.contracts).toHaveLength(3);
      expect(deserialized.savedCalls).toHaveLength(2);
    });
  });
});
