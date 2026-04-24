import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export interface FixtureManifestEntry {
  key: string;
  label: string;
  description: string;
  network: string;
  contractId: string | null;
  version: string;
  /** SHA-256 hex of the compiled WASM, if known */
  wasmHash: string | null;
}

export interface ArtifactManifestEntry {
  key: string;
  wasmHash: string | null;
  version: string;
  builtAt: string | null;
}

export interface FixtureManifestPayload {
  schemaVersion: 1;
  generatedAt: string;
  fixtures: FixtureManifestEntry[];
  artifacts: ArtifactManifestEntry[];
}

const FIXTURE_DEFS: Array<Omit<FixtureManifestEntry, "contractId" | "wasmHash"> & { envKey: string; hashEnvKey: string }> = [
  { key: "counter", label: "Counter", description: "Simple increment/decrement counter for testing basic calls.", network: "local", version: "0.1.0", envKey: "CONTRACT_COUNTER_FIXTURE", hashEnvKey: "WASM_HASH_COUNTER_FIXTURE" },
  { key: "token", label: "Token", description: "SAC-compatible token fixture for transfer/mint demos.", network: "local", version: "0.1.0", envKey: "CONTRACT_TOKEN_FIXTURE", hashEnvKey: "WASM_HASH_TOKEN_FIXTURE" },
  { key: "event", label: "Event Emitter", description: "Emits contract events for testing the event feed.", network: "local", version: "0.1.0", envKey: "CONTRACT_EVENT_FIXTURE", hashEnvKey: "WASM_HASH_EVENT_FIXTURE" },
  { key: "failure", label: "Failure Fixture", description: "Intentionally fails to test error handling flows.", network: "local", version: "0.1.0", envKey: "CONTRACT_FAILURE_FIXTURE", hashEnvKey: "WASM_HASH_FAILURE_FIXTURE" },
  { key: "types-tester", label: "Types Tester", description: "Exercises all Soroban ScVal types for ABI form testing.", network: "local", version: "0.1.0", envKey: "CONTRACT_TYPES_TESTER", hashEnvKey: "WASM_HASH_TYPES_TESTER" },
  { key: "auth-tester", label: "Auth Tester", description: "Tests authorization flows and account-based access control.", network: "local", version: "0.1.0", envKey: "CONTRACT_AUTH_TESTER", hashEnvKey: "WASM_HASH_AUTH_TESTER" },
  { key: "source-registry", label: "Source Registry", description: "Registry contract for source verification demos.", network: "local", version: "0.1.0", envKey: "CONTRACT_SOURCE_REGISTRY", hashEnvKey: "WASM_HASH_SOURCE_REGISTRY" },
  { key: "error-trigger", label: "Error Trigger", description: "Triggers specific error codes for debugging UI.", network: "local", version: "0.1.0", envKey: "CONTRACT_ERROR_TRIGGER", hashEnvKey: "WASM_HASH_ERROR_TRIGGER" },
];

@Injectable()
export class FixtureManifestService {
  constructor(private readonly config: ConfigService) {}

  getManifest(): FixtureManifestPayload {
    const fixtures: FixtureManifestEntry[] = FIXTURE_DEFS.map(({ envKey, hashEnvKey, ...rest }) => ({
      ...rest,
      contractId: this.config.get<string>(envKey) ?? null,
      wasmHash: this.config.get<string>(hashEnvKey) ?? null,
    }));

    const artifacts: ArtifactManifestEntry[] = FIXTURE_DEFS.map(({ key, version, hashEnvKey }) => ({
      key,
      version,
      wasmHash: this.config.get<string>(hashEnvKey) ?? null,
      builtAt: this.config.get<string>(`WASM_BUILT_AT_${key.toUpperCase().replace(/-/g, "_")}`) ?? null,
    }));

    return {
      schemaVersion: 1,
      generatedAt: new Date().toISOString(),
      fixtures,
      artifacts,
    };
  }
}
