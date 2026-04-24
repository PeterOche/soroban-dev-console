/**
 * SC-002: Fixture and artifact manifest client.
 *
 * Fetches the manifest from /fixture-manifest (served by FixtureManifestModule).
 * Falls back to env-var driven static list when the API is unreachable.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

export interface FixtureContract {
  key: string;
  label: string;
  description: string;
  network: "testnet" | "local";
  contractId: string | null;
  /** SHA-256 hex of the compiled WASM, if known */
  wasmHash?: string | null;
  version?: string;
}

export interface ArtifactManifestEntry {
  key: string;
  wasmHash: string | null;
  version: string;
  builtAt: string | null;
}

export interface FixtureManifestPayload {
  schemaVersion: number;
  generatedAt: string;
  fixtures: FixtureContract[];
  artifacts: ArtifactManifestEntry[];
}

// ── Static fallback (env-var driven) ─────────────────────────────────────────

const env = (key: string): string | null => process.env[key] ?? null;

const STATIC_FIXTURES: FixtureContract[] = [
  { key: "counter", label: "Counter", description: "Simple increment/decrement counter for testing basic calls.", network: "local", contractId: env("NEXT_PUBLIC_CONTRACT_COUNTER_FIXTURE") },
  { key: "token", label: "Token", description: "SAC-compatible token fixture for transfer/mint demos.", network: "local", contractId: env("NEXT_PUBLIC_CONTRACT_TOKEN_FIXTURE") },
  { key: "event", label: "Event Emitter", description: "Emits contract events for testing the event feed.", network: "local", contractId: env("NEXT_PUBLIC_CONTRACT_EVENT_FIXTURE") },
  { key: "failure", label: "Failure Fixture", description: "Intentionally fails to test error handling flows.", network: "local", contractId: env("NEXT_PUBLIC_CONTRACT_FAILURE_FIXTURE") },
  { key: "types-tester", label: "Types Tester", description: "Exercises all Soroban ScVal types for ABI form testing.", network: "local", contractId: env("NEXT_PUBLIC_CONTRACT_TYPES_TESTER") },
  { key: "auth-tester", label: "Auth Tester", description: "Tests authorization flows and account-based access control.", network: "local", contractId: env("NEXT_PUBLIC_CONTRACT_AUTH_TESTER") },
  { key: "source-registry", label: "Source Registry", description: "Registry contract for source verification demos.", network: "local", contractId: env("NEXT_PUBLIC_CONTRACT_SOURCE_REGISTRY") },
  { key: "error-trigger", label: "Error Trigger", description: "Triggers specific error codes for debugging UI.", network: "local", contractId: env("NEXT_PUBLIC_CONTRACT_ERROR_TRIGGER") },
];

// ── Runtime config injection (legacy SSR path) ────────────────────────────────

function readRuntimeFixtures(): FixtureContract[] | null {
  if (typeof document === "undefined") return null;
  try {
    const el = document.getElementById("__runtime_config__");
    if (!el?.textContent) return null;
    const config = JSON.parse(el.textContent) as {
      fixtures?: Array<{ key: string; label: string; description: string; network: string; contractId: string | null }>;
    };
    return (config.fixtures ?? []).map((f) => ({
      ...f,
      network: (f.network === "testnet" ? "testnet" : "local") as "testnet" | "local",
    }));
  } catch {
    return null;
  }
}

// ── API fetch ─────────────────────────────────────────────────────────────────

let cachedManifest: FixtureManifestPayload | null = null;

export async function fetchFixtureManifest(): Promise<FixtureManifestPayload> {
  if (cachedManifest) return cachedManifest;

  try {
    const res = await fetch(`${API_BASE}/fixture-manifest`, {
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as FixtureManifestPayload;
    cachedManifest = data;
    return data;
  } catch {
    console.warn("[fixture-manifest] Failed to fetch from API — using fallback");
    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      fixtures: STATIC_FIXTURES,
      artifacts: STATIC_FIXTURES.map((f) => ({ key: f.key, wasmHash: null, version: "0.1.0", builtAt: null })),
    };
  }
}

/** Reset the in-memory cache (useful for testing). */
export function resetFixtureManifestCache(): void {
  cachedManifest = null;
}

// ── Synchronous accessors (for components that can't await) ───────────────────

export function getFixtureContracts(): FixtureContract[] {
  if (cachedManifest) return cachedManifest.fixtures;
  return readRuntimeFixtures() ?? STATIC_FIXTURES;
}

/** Returns only fixture contracts that have a deployed contract ID. */
export function getDeployedFixtures(): FixtureContract[] {
  return getFixtureContracts().filter((f) => f.contractId !== null);
}

/** @deprecated Use getFixtureContracts() instead */
export const FIXTURE_CONTRACTS = STATIC_FIXTURES;

// ── FE-032: Workspace templates ───────────────────────────────────────────────

import type { WorkspaceArtifactRef } from "@/store/workspace-schema";

/** A versioned workspace template that can be used to bootstrap a new workspace. */
export interface WorkspaceTemplate {
  /** Unique key for this template */
  key: string;
  /** Display name shown in the UI */
  name: string;
  /** Short description of the template's purpose */
  description: string;
  /** Template schema version — increment when the shape changes */
  version: number;
  /** Default network for workspaces created from this template */
  defaultNetwork?: "testnet" | "local" | "mainnet" | "futurenet";
  /** Pre-populated contract IDs */
  contractIds?: string[];
  /** Pre-populated saved call IDs */
  savedCallIds?: string[];
  /** Pre-populated artifact refs */
  artifactRefs?: WorkspaceArtifactRef[];
}

/** Built-in workspace templates for common Soroban developer flows. */
export const WORKSPACE_TEMPLATES: WorkspaceTemplate[] = [
  {
    key: "token-inspection",
    name: "Token Inspection",
    description: "Pre-loaded with the SAC-compatible token fixture for transfer and mint demos.",
    version: 1,
    defaultNetwork: "local",
    contractIds: [],
    savedCallIds: [],
    artifactRefs: [],
  },
  {
    key: "fixture-exploration",
    name: "Fixture Exploration",
    description: "Includes counter, event emitter, and types-tester fixtures for exploring Soroban primitives.",
    version: 1,
    defaultNetwork: "local",
    contractIds: [],
    savedCallIds: [],
    artifactRefs: [],
  },
  {
    key: "deployment-testing",
    name: "Deployment Testing",
    description: "Blank workspace on testnet, ready for WASM upload and contract deployment workflows.",
    version: 1,
    defaultNetwork: "testnet",
    contractIds: [],
    savedCallIds: [],
    artifactRefs: [],
  },
  {
    key: "auth-debugging",
    name: "Auth Debugging",
    description: "Pre-loaded with the auth-tester fixture for testing authorization flows.",
    version: 1,
    defaultNetwork: "local",
    contractIds: [],
    savedCallIds: [],
    artifactRefs: [],
  },
];

/** Look up a template by its key. Returns undefined if not found. */
export function getWorkspaceTemplate(key: string): WorkspaceTemplate | undefined {
  return WORKSPACE_TEMPLATES.find((t) => t.key === key);
}
