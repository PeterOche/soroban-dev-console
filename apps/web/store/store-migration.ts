/**
 * FE-036: Browser-store migration framework for persisted Zustand state.
 *
 * Provides a consistent, testable way to register schema versions and
 * migration functions across all persisted stores. Replaces ad-hoc
 * per-store migration logic with a shared contract.
 *
 * Usage:
 *   const migrations = buildMigrations<MyState>([
 *     { fromVersion: 1, toVersion: 2, migrate: (old) => ({ ...old, newField: "default" }) },
 *   ]);
 *
 *   export const useMyStore = create<MyState>()(
 *     persist((set, get) => ({ ... }), {
 *       name: "my-store",
 *       version: CURRENT_VERSION,
 *       migrate: createMigrateFn(migrations, CURRENT_VERSION, "my-store"),
 *     }),
 *   );
 */

export interface MigrationStep<T> {
  fromVersion: number;
  toVersion: number;
  /**
   * Transform persisted state from `fromVersion` to `toVersion`.
   * Receives the raw persisted object (may be partial/unknown shape).
   * Must return a value compatible with `toVersion`'s shape.
   */
  migrate: (persisted: unknown) => Partial<T>;
}

export interface MigrationResult<T> {
  state: Partial<T>;
  migratedFrom: number;
  migratedTo: number;
  steps: number;
}

/**
 * Build a sorted, validated migration chain from a list of steps.
 * Throws at build time if there are gaps or duplicate steps.
 */
export function buildMigrations<T>(steps: MigrationStep<T>[]): MigrationStep<T>[] {
  const sorted = [...steps].sort((a, b) => a.fromVersion - b.fromVersion);

  for (let i = 0; i < sorted.length - 1; i++) {
    const current = sorted[i];
    const next = sorted[i + 1];
    if (current.toVersion !== next.fromVersion) {
      throw new Error(
        `[store-migration] Gap in migration chain: ${current.toVersion} → ${next.fromVersion}`,
      );
    }
  }

  const seen = new Set<number>();
  for (const step of sorted) {
    if (seen.has(step.fromVersion)) {
      throw new Error(
        `[store-migration] Duplicate migration step from version ${step.fromVersion}`,
      );
    }
    seen.add(step.fromVersion);
  }

  return sorted;
}

/**
 * Run a migration chain from `fromVersion` to `targetVersion`.
 * Returns a MigrationResult with the final state and diagnostic info.
 * Throws with context if any step fails, so failures are recoverable.
 */
export function runMigrations<T>(
  persisted: unknown,
  fromVersion: number,
  targetVersion: number,
  steps: MigrationStep<T>[],
  storeName: string,
): MigrationResult<T> {
  if (fromVersion === targetVersion) {
    return { state: persisted as Partial<T>, migratedFrom: fromVersion, migratedTo: targetVersion, steps: 0 };
  }

  let current: unknown = persisted;
  let currentVersion = fromVersion;
  let stepCount = 0;

  while (currentVersion < targetVersion) {
    const step = steps.find((s) => s.fromVersion === currentVersion);
    if (!step) {
      throw new Error(
        `[store-migration:${storeName}] No migration step from version ${currentVersion} to ${targetVersion}. ` +
          `Persisted state may be from an unsupported older version. ` +
          `Clear localStorage key "${storeName}" to reset.`,
      );
    }

    try {
      current = step.migrate(current);
    } catch (err) {
      throw new Error(
        `[store-migration:${storeName}] Migration step ${currentVersion}→${step.toVersion} failed: ` +
          (err instanceof Error ? err.message : String(err)),
      );
    }

    currentVersion = step.toVersion;
    stepCount++;
  }

  return {
    state: current as Partial<T>,
    migratedFrom: fromVersion,
    migratedTo: currentVersion,
    steps: stepCount,
  };
}

/**
 * Create a Zustand-compatible `migrate` function from a migration chain.
 * Pass this directly to the `persist` middleware's `migrate` option.
 *
 * @param steps     - Built migration chain (from buildMigrations)
 * @param targetVersion - The current schema version (STORE_SCHEMA_VERSION)
 * @param storeName - Used in error messages for debuggability
 */
export function createMigrateFn<T>(
  steps: MigrationStep<T>[],
  targetVersion: number,
  storeName: string,
): (persisted: unknown, version: number) => Partial<T> {
  return (persisted, version) => {
    const result = runMigrations(persisted, version, targetVersion, steps, storeName);
    if (result.steps > 0) {
      console.info(
        `[store-migration:${storeName}] Migrated ${result.steps} step(s): v${result.migratedFrom} → v${result.migratedTo}`,
      );
    }
    return result.state;
  };
}
