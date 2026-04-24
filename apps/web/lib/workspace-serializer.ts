/**
 * FE-012 / DEVOPS-003 / FE-025: Workspace serialization layer.
 * Defines the versioned export/import format for workspace state.
 * Sensitive or purely ephemeral state (wallet keys, health data) is excluded.
 *
 * FE-025: Added deep validation, repair tooling, and round-trip fidelity checks.
 * Version is sourced from schema-version.ts — the single source of truth.
 */

import { SERIALIZER_VERSION, assertSupportedVersion } from "@/store/schema-version";
import type { WorkspaceSnapshot } from "@/store/workspace-schema";
import type { Contract } from "@/store/useContractStore";
import type { SavedCall } from "@/store/useSavedCallsStore";

export { SERIALIZER_VERSION };

export interface SerializedWorkspace {
  version: typeof SERIALIZER_VERSION;
  exportedAt: string;
  workspace: WorkspaceSnapshot;
  /** Only contracts referenced by this workspace */
  contracts: Contract[];
  /** Only saved calls referenced by this workspace */
  savedCalls: SavedCall[];
}

// FE-025: Structured validation result — allows partial repair instead of all-or-nothing failure
export interface ValidationResult {
  valid: boolean;
  repaired: boolean;
  warnings: string[];
  errors: string[];
}

/** FE-025: Deep-validate and optionally repair a deserialized payload in-place. */
export function validateAndRepair(payload: SerializedWorkspace): ValidationResult {
  const result: ValidationResult = { valid: true, repaired: false, warnings: [], errors: [] };

  // --- Workspace fields ---
  if (!payload.workspace.id) {
    payload.workspace.id = crypto.randomUUID();
    result.repaired = true;
    result.warnings.push("workspace.id was missing — generated a new one");
  }
  if (!payload.workspace.name || typeof payload.workspace.name !== "string") {
    payload.workspace.name = "Imported Workspace";
    result.repaired = true;
    result.warnings.push("workspace.name was missing — defaulted to 'Imported Workspace'");
  }
  if (!Array.isArray(payload.workspace.contractIds)) {
    payload.workspace.contractIds = [];
    result.repaired = true;
    result.warnings.push("workspace.contractIds was not an array — reset to []");
  }
  if (!Array.isArray(payload.workspace.savedCallIds)) {
    payload.workspace.savedCallIds = [];
    result.repaired = true;
    result.warnings.push("workspace.savedCallIds was not an array — reset to []");
  }
  if (!Array.isArray(payload.workspace.artifactRefs)) {
    payload.workspace.artifactRefs = [];
    result.repaired = true;
    result.warnings.push("workspace.artifactRefs was not an array — reset to []");
  }
  if (!payload.workspace.selectedNetwork || typeof payload.workspace.selectedNetwork !== "string") {
    payload.workspace.selectedNetwork = "testnet";
    result.repaired = true;
    result.warnings.push("workspace.selectedNetwork was missing — defaulted to 'testnet'");
  }
  if (typeof payload.workspace.createdAt !== "number") {
    payload.workspace.createdAt = Date.now();
    result.repaired = true;
    result.warnings.push("workspace.createdAt was invalid — set to now");
  }
  if (typeof payload.workspace.updatedAt !== "number") {
    payload.workspace.updatedAt = Date.now();
    result.repaired = true;
    result.warnings.push("workspace.updatedAt was invalid — set to now");
  }

  // --- Contracts ---
  if (!Array.isArray(payload.contracts)) {
    payload.contracts = [];
    result.repaired = true;
    result.warnings.push("contracts was not an array — reset to []");
  } else {
    // Remove contracts missing required id field; warn for each
    const before = payload.contracts.length;
    payload.contracts = payload.contracts.filter((c) => c && typeof c.id === "string");
    if (payload.contracts.length < before) {
      result.repaired = true;
      result.warnings.push(`Removed ${before - payload.contracts.length} contract(s) with missing id`);
    }
    // Reconcile: contractIds should only reference contracts present in the payload
    const contractIdSet = new Set(payload.contracts.map((c) => c.id));
    const orphaned = payload.workspace.contractIds.filter((id) => !contractIdSet.has(id));
    if (orphaned.length > 0) {
      payload.workspace.contractIds = payload.workspace.contractIds.filter((id) => contractIdSet.has(id));
      result.repaired = true;
      result.warnings.push(`Removed ${orphaned.length} orphaned contractId reference(s) from workspace`);
    }
  }

  // --- Saved calls ---
  if (!Array.isArray(payload.savedCalls)) {
    payload.savedCalls = [];
    result.repaired = true;
    result.warnings.push("savedCalls was not an array — reset to []");
  } else {
    const before = payload.savedCalls.length;
    payload.savedCalls = payload.savedCalls.filter((c) => c && typeof c.id === "string");
    if (payload.savedCalls.length < before) {
      result.repaired = true;
      result.warnings.push(`Removed ${before - payload.savedCalls.length} savedCall(s) with missing id`);
    }
    const savedCallIdSet = new Set(payload.savedCalls.map((c) => c.id));
    const orphaned = payload.workspace.savedCallIds.filter((id) => !savedCallIdSet.has(id));
    if (orphaned.length > 0) {
      payload.workspace.savedCallIds = payload.workspace.savedCallIds.filter((id) => savedCallIdSet.has(id));
      result.repaired = true;
      result.warnings.push(`Removed ${orphaned.length} orphaned savedCallId reference(s) from workspace`);
    }
  }

  // --- exportedAt ---
  if (!payload.exportedAt || isNaN(Date.parse(payload.exportedAt))) {
    payload.exportedAt = new Date().toISOString();
    result.repaired = true;
    result.warnings.push("exportedAt was invalid — set to now");
  }

  result.valid = result.errors.length === 0;
  return result;
}

/** FE-025: Verify round-trip fidelity: serialize → deserialize → compare key fields. */
export function verifyRoundTrip(original: SerializedWorkspace): boolean {
  try {
    const json = JSON.stringify(original);
    const restored = deserializeWorkspace(JSON.parse(json));
    return (
      restored.workspace.id === original.workspace.id &&
      restored.workspace.name === original.workspace.name &&
      restored.contracts.length === original.contracts.length &&
      restored.savedCalls.length === original.savedCalls.length
    );
  } catch {
    return false;
  }
}

export function serializeWorkspace(
  workspace: WorkspaceSnapshot,
  allContracts: Contract[],
  allSavedCalls: SavedCall[],
): SerializedWorkspace {
  const contractSet = new Set(workspace.contractIds);
  const savedCallSet = new Set(workspace.savedCallIds);

  return {
    version: SERIALIZER_VERSION,
    exportedAt: new Date().toISOString(),
    workspace,
    contracts: allContracts.filter((c) => contractSet.has(c.id)),
    savedCalls: allSavedCalls.filter((c) => savedCallSet.has(c.id)),
  };
}

export function deserializeWorkspace(raw: unknown): SerializedWorkspace {
  if (!raw || typeof raw !== "object") {
    throw new Error("Malformed workspace export: not an object");
  }

  const payload = raw as SerializedWorkspace;

  // Validate version — throws with recovery guidance for unsupported versions.
  assertSupportedVersion(payload.version, "workspace-serializer");

  if (!payload.workspace?.id || !payload.workspace?.name) {
    throw new Error("Malformed workspace payload: missing id or name");
  }

  return payload;
}

/**
 * FE-025: Parse, validate, and repair a raw import payload.
 * Returns the repaired payload and the validation result.
 * Throws only for truly unrecoverable errors (bad JSON structure, unsupported version).
 */
export function importWorkspace(raw: unknown): {
  payload: SerializedWorkspace;
  validation: ValidationResult;
} {
  const payload = deserializeWorkspace(raw);
  const validation = validateAndRepair(payload);
  return { payload, validation };
}
