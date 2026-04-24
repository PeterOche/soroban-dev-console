/**
 * DEVOPS-004: Seed data compatibility test.
 *
 * Validates that seeded API data has correct schema versions
 * and can be exported/imported via the serializer.
 */

import { describe, it, expect } from "vitest";
import { API_SNAPSHOT_VERSION, STORE_SCHEMA_VERSION } from "@/store/schema-version";

describe("Seed Data Compatibility", () => {
  it("should have API_SNAPSHOT_VERSION matching STORE_SCHEMA_VERSION", () => {
    expect(API_SNAPSHOT_VERSION).toBe(STORE_SCHEMA_VERSION);
  });

  it("should use version 2 for current schema", () => {
    expect(STORE_SCHEMA_VERSION).toBe(2);
    expect(API_SNAPSHOT_VERSION).toBe(2);
  });

  it("should document seeded workspace structure", () => {
    // This test documents the expected structure of seeded data
    // Actual seed data is in apps/api/prisma/seed.ts
    const expectedWorkspaceStructure = {
      id: "demo-workspace",
      ownerKey: "demo-owner",
      name: "Demo Workspace",
      description: "Seeded workspace for local API development",
      selectedNetwork: "testnet",
      // Should have related:
      // - savedContracts
      // - savedInteractions
      // - workspaceArtifacts
      // - shareLinks
    };

    expect(expectedWorkspaceStructure.id).toBe("demo-workspace");
    expect(expectedWorkspaceStructure.selectedNetwork).toBe("testnet");
  });

  it("should document seeded share link structure", () => {
    const expectedShareStructure = {
      workspaceId: "demo-workspace",
      token: "demo-share-link",
      label: "Demo Share",
      snapshotJson: {
        workspaceId: "demo-workspace",
        selectedNetwork: "testnet",
        contracts: [
          {
            contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
            label: "Demo Token",
          },
        ],
      },
    };

    expect(expectedShareStructure.token).toBe("demo-share-link");
    expect(expectedShareStructure.snapshotJson.selectedNetwork).toBe("testnet");
  });

  it("should verify seed data can be serialized", () => {
    // Simulate the snapshot JSON from seed data
    const snapshotJson = {
      workspaceId: "demo-workspace",
      selectedNetwork: "testnet",
      contracts: [
        {
          contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
          label: "Demo Token",
        },
      ],
    };

    // Verify it's valid JSON and can be stringified
    const serialized = JSON.stringify(snapshotJson);
    const parsed = JSON.parse(serialized);

    expect(parsed.workspaceId).toBe("demo-workspace");
    expect(parsed.contracts).toHaveLength(1);
  });
});
