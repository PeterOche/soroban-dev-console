import { xdr, scValToNative } from "@stellar/stellar-sdk";

export interface DiffResult {
  key: string;
  keyDecoded?: string;
  oldValue: string | null;
  newValue: string | null;
  type: "added" | "modified" | "deleted";
  valueType?: string;
}

function tryDecodeScVal(base64: string): { display: string; type: string } {
  try {
    const val = xdr.ScVal.fromXDR(base64, "base64");
    const native = scValToNative(val);
    return {
      display: typeof native === "object" ? JSON.stringify(native) : String(native),
      type: val.switch().name,
    };
  } catch {
    return { display: base64, type: "raw" };
  }
}

function tryDecodeLedgerKey(base64: string): string {
  try {
    const key = xdr.LedgerKey.fromXDR(base64, "base64");
    const contractData = key.contractData?.();
    if (contractData) {
      const keyVal = contractData.key();
      const native = scValToNative(keyVal);
      return typeof native === "object" ? JSON.stringify(native) : String(native);
    }
    return base64.slice(0, 16) + "…";
  } catch {
    return base64.slice(0, 16) + "…";
  }
}

export function computeStateDiff(
  oldState: Record<string, string>,
  newState: Record<string, string>,
): DiffResult[] {
  const diffs: DiffResult[] = [];
  const allKeys = new Set([...Object.keys(oldState), ...Object.keys(newState)]);

  allKeys.forEach((key) => {
    const oldVal = oldState[key];
    const newVal = newState[key];

    if (oldVal === newVal) return;

    const keyDecoded = tryDecodeLedgerKey(key);
    const newDecoded = newVal ? tryDecodeScVal(newVal) : null;
    const oldDecoded = oldVal ? tryDecodeScVal(oldVal) : null;

    const entry: DiffResult = {
      key,
      keyDecoded,
      oldValue: oldDecoded?.display ?? null,
      newValue: newDecoded?.display ?? null,
      type: !oldVal ? "added" : !newVal ? "deleted" : "modified",
      valueType: (newDecoded ?? oldDecoded)?.type,
    };

    diffs.push(entry);
  });

  return diffs;
}

export interface StorageSnapshot {
  label: string;
  takenAt: number;
  entries: Record<string, string>;
}

export function takeSnapshot(
  label: string,
  entries: Record<string, string>,
): StorageSnapshot {
  return { label, takenAt: Date.now(), entries: { ...entries } };
}

export function diffSnapshots(
  before: StorageSnapshot,
  after: StorageSnapshot,
): DiffResult[] {
  return computeStateDiff(before.entries, after.entries);
}
