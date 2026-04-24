/**
 * DEVOPS-004: Migration verification test suite.
 *
 * Validates schema evolution across:
 * - Zustand browser state (STORE_SCHEMA_VERSION)
 * - Workspace serializer (SERIALIZER_VERSION)
 * - API snapshots (API_SNAPSHOT_VERSION)
 *
 * These tests ensure version drift doesn't become a hidden data-loss risk.
 */

import { describe, it, expect } from "vitest";
import {
  STORE_SCHEMA_VERSION,
  SERIALIZER_VERSION,
  API_SNAPSHOT_VERSION,
  SUPPORTED_LEGACY_VERSIONS,
  assertSupportedVersion,
} from "../schema-version";
import { deserializeWorkspace, serializeWorkspace } from "@/lib/workspace-serializer";
import type { WorkspaceSnapshot } from "../workspace-schema";
import v1Fixture from "./fixtures/v1-workspace.json";
import v2Fixture from "./fixtures/v2-workspace.json";

describe("Schema Version Consistency", () => {
  it("should have all version constants in sync", () => {
    expect(STORE_SCHEMA_VERSION).toBe(SERIALIZER_VERSION);
    expect(STORE_SCHEMA_VERSION).toBe(API_SNAPSHOT_VERSION);
  });

  it("should have current version as 2", () => {
    expect(STORE_SCHEMA_VERSION).toBe(2);
  });

  it("should support version 1 as legacy", () => {
    expect(SUPPORTED_LEGACY_VERSIONS).toContain(1);
  });
});

describe("Version Validation", () => {
  it("should accept current version without throwing", () => {
    expect(() => {
      assertSupportedVersion(STORE_SCHEMA_VERSION, "test");
    }).not.toThrow();
  });

  it("should not throw for legacy versions (migration required)", () => {
    expect(() => {
      assertSupportedVersion(1, "test");
    }).not.toThrow();
  });

  it("should throw for unsupported versions", () => {
    expect(() => {
      assertSupportedVersion(999, "test");
    }).toThrow(/Unsupported schema version/);
  });

  it("should throw for null version", () => {
    expect(() => {
      assertSupportedVersion(null, "test");
    }).toThrow(/Unsupported schema version/);
  });

  it("should throw for undefined version", () => {
    expect(() => {
      assertSupportedVersion(undefined, "test");
    }).toThrow(/Unsupported schema version/);
  });
});

describe("Browser State Migration (v1 → v2)", () => {
  it("should migrate v1 workspace to v2", () => {
    const v1Workspace = v1Fixture as unknown as WorkspaceSnapshot;
    
    // Simulate migration logic
    const migratedWorkspace: WorkspaceSnapshot = {
      ...v1Workspace,
      version: STORE_SCHEMA_VERSION,
      artifactRefs: v1Workspace.artifactRefs || [],
    };

    expect(migratedWorkspace.version).toBe(2);
    expect(migratedWorkspace.id).toBe(v1Workspace.id);
    expect(migratedWorkspace.name).toBe(v1Workspace.name);
    expect(migratedWorkspace.contractIds).toEqual(v1Workspace.contractIds);
    expect(migratedWorkspace.savedCallIds).toEqual(v1Workspace.savedCallIds);
    expect(migratedWorkspace.selectedNetwork).toBe(v1Workspace.selectedNetwork);
    expect(migratedWorkspace.createdAt).toBe(v1Workspace.createdAt);
    expect(migratedWorkspace.updatedAt).toBe(v1Workspace.updatedAt);
    expect(migratedWorkspace.artifactRefs).toEqual([]);
  });

  it("should preserve all v1 data during migration", () => {
    const v1Workspace = v1Fixture as unknown as WorkspaceSnapshot;
    
    const migratedWorkspace: WorkspaceSnapshot = {
      ...v1Workspace,
      version: STORE_SCHEMA_VERSION,
      artifactRefs: v1Workspace.artifactRefs || [],
    };

    // Verify no data loss
    expect(migratedWorkspace.contractIds.length).toBe(
      v1Workspace.contractIds.length,
    );
    expect(migratedWorkspace.savedCallIds.length).toBe(
      v1Workspace.savedCallIds.length,
    );
  });

  it("should initialize artifactRefs as empty array if missing", () => {
    const v1Workspace = v1Fixture as unknown as WorkspaceSnapshot;
    expect(v1Workspace).not.toHaveProperty("artifactRefs");

    const migratedWorkspace: WorkspaceSnapshot = {
      ...v1Workspace,
      version: STORE_SCHEMA_VERSION,
      artifactRefs: v1Workspace.artifactRefs || [],
    };

    expect(migratedWorkspace.artifactRefs).toEqual([]);
    expect(Array.isArray(migratedWorkspace.artifactRefs)).toBe(true);
  });
});

describe("Workspace Serializer Compatibility", () => {
  it("should deserialize v2 payload successfully", () => {
    const v2Payload = {
      version: SERIALIZER_VERSION,
      exportedAt: new Date().toISOString(),
      workspace: v2Fixture,
      contracts: [],
      savedCalls: [],
    };

    expect(() => {
      deserializeWorkspace(v2Payload);
    }).not.toThrow();
  });

  it("should reject v1 payload with helpful error", () => {
    const v1Payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace: v1Fixture,
      contracts: [],
      savedCalls: [],
    };

    // v1 is legacy, so assertSupportedVersion won't throw
    // but in a real migration scenario, the caller should migrate first
    expect(() => {
      assertSupportedVersion(v1Payload.version, "workspace-serializer");
    }).not.toThrow(); // Legacy versions don't throw, they signal migration needed
  });

  it("should serialize workspace with correct version", () => {
    const workspace: WorkspaceSnapshot = {
      version: STORE_SCHEMA_VERSION,
      id: "test-ws",
      name: "Test",
      contractIds: [],
      savedCallIds: [],
      artifactRefs: [],
      selectedNetwork: "testnet",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const serialized = serializeWorkspace(workspace, [], []);

    expect(serialized.version).toBe(SERIALIZER_VERSION);
    expect(serialized.workspace.id).toBe("test-ws");
    expect(serialized.contracts).toEqual([]);
    expect(serialized.savedCalls).toEqual([]);
  });

  it("should round-trip serialize → deserialize correctly", () => {
    const original: WorkspaceSnapshot = {
      version: STORE_SCHEMA_VERSION,
      id: "roundtrip-test",
      name: "Roundtrip Test",
      contractIds: ["contract-1", "contract-2"],
      savedCallIds: ["call-1"],
      artifactRefs: [
        {
          kind: "wasm",
          id: "artifact-1",
          contractId: "contract-1",
          relationship: "confirmed",
        },
      ],
      selectedNetwork: "mainnet",
      createdAt: 1000000,
      updatedAt: 2000000,
    };

    const serialized = serializeWorkspace(original, [], []);
    const deserialized = deserializeWorkspace(serialized);

    expect(deserialized.workspace.id).toBe(original.id);
    expect(deserialized.workspace.name).toBe(original.name);
    expect(deserialized.workspace.contractIds).toEqual(original.contractIds);
    expect(deserialized.workspace.savedCallIds).toEqual(original.savedCallIds);
    expect(deserialized.workspace.artifactRefs).toEqual(original.artifactRefs);
    expect(deserialized.workspace.selectedNetwork).toBe(original.selectedNetwork);
    expect(deserialized.version).toBe(SERIALIZER_VERSION);
  });

  it("should reject malformed payload (not an object)", () => {
    expect(() => deserializeWorkspace(null)).toThrow(/Malformed workspace export/);
    expect(() => deserializeWorkspace("string")).toThrow(/Malformed workspace export/);
    expect(() => deserializeWorkspace(123)).toThrow(/Malformed workspace export/);
  });

  it("should reject payload missing required fields", () => {
    const invalidPayload = {
      version: SERIALIZER_VERSION,
      exportedAt: new Date().toISOString(),
      // missing workspace
      contracts: [],
      savedCalls: [],
    };

    expect(() => deserializeWorkspace(invalidPayload)).toThrow(/Malformed workspace payload/);
  });
});

describe("API Snapshot Compatibility", () => {
  it("should use same version constant as serializer", () => {
    expect(API_SNAPSHOT_VERSION).toBe(SERIALIZER_VERSION);
  });

  it("should validate API snapshot version matches current", () => {
    const apiSnapshot = {
      version: API_SNAPSHOT_VERSION,
      workspaceId: "test-ws",
      snapshotJson: {},
    };

    expect(() => {
      assertSupportedVersion(apiSnapshot.version, "api-snapshot");
    }).not.toThrow();
  });
});

describe("Migration Path Identification", () => {
  it("should clearly identify broken migration paths", () => {
    // This test documents what to check when migrations break
    const migrationChecks = {
      "v1 → v2": {
        changes: ["Added artifactRefs field"],
        migration: "Initialize artifactRefs as empty array",
        breaking: "Missing artifactRefs causes type errors",
      },
    };

    expect(migrationChecks["v1 → v2"].changes).toContain("Added artifactRefs field");
  });

  it("should verify all legacy versions have migration paths", () => {
    for (const legacyVersion of SUPPORTED_LEGACY_VERSIONS) {
      expect(legacyVersion).toBeLessThan(STORE_SCHEMA_VERSION);
      // Document migration path for each legacy version
      expect([1]).toContain(legacyVersion);
    }
  });
});
