import { StorageQueryResult } from "./storage-query";

export type Durability = "persistent" | "temporary";

export interface StorageEntry {
  key: string;
  value: string;
  durability: Durability;
  lastModified?: number;
  decodeConfidence: "high" | "low";
  valueType: string;
}

export interface StoragePage {
  entries: StorageEntry[];
  cursor?: string;
  hasMore: boolean;
}

export function paginateEntries(
  entries: StorageEntry[],
  page: number,
  pageSize = 20,
): StoragePage {
  const start = page * pageSize;
  const slice = entries.slice(start, start + pageSize);
  return {
    entries: slice,
    hasMore: start + pageSize < entries.length,
    cursor: slice.length > 0 ? String(start + pageSize) : undefined,
  };
}

export function fromStorageQueryResult(
  key: string,
  result: StorageQueryResult,
  durability: Durability = "persistent",
): StorageEntry | null {
  if (!result.found || result.decodedValue === undefined) return null;
  return {
    key,
    value: result.decodedValue,
    durability,
    lastModified: result.lastModified,
    decodeConfidence: "high",
    valueType: typeof result.decodedValue,
  };
}

export function filterByDurability(
  entries: StorageEntry[],
  durability: Durability,
): StorageEntry[] {
  return entries.filter((e) => e.durability === durability);
}
