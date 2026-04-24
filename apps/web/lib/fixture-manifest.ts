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
