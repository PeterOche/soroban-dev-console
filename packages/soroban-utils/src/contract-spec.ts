import type { ArgType } from "./soroban-types";

export type ContractSpecSource = "wasm" | "json" | "rpc" | "workspace";

export type NormalizedArgType = ArgType | "bytes" | "unknown";

export interface NormalizedContractField {
  name: string;
  type: NormalizedArgType;
  required: boolean;
  doc?: string;
}

export interface NormalizedContractFunction {
  name: string;
  doc?: string;
  inputs: NormalizedContractField[];
  outputs: NormalizedContractField[];
}

export interface NormalizedContractSpec {
  contractId?: string;
  source: ContractSpecSource;
  rawSpec: string;
  functions: NormalizedContractFunction[];
  ingestedAt: number;
}

type LooseRecord = Record<string, unknown>;

function normalizeType(input: unknown): NormalizedArgType {
  if (typeof input !== "string") {
    return "unknown";
  }

  const value = input.toLowerCase();

  if (value.includes("address")) return "address";
  if (value.includes("symbol")) return "symbol";
  if (value.includes("string") || value.includes("str")) return "string";
  if (value.includes("bool")) return "bool";
  if (value.includes("i32")) return "i32";
  if (value.includes("u32")) return "u32";
  if (value.includes("i128")) return "i128";
  if (value.includes("u128")) return "u128";
  if (value.includes("vec")) return "vec";
  if (value.includes("map")) return "map";
  if (value.includes("bytes")) return "bytes";

  return "unknown";
}

function normalizeField(entry: LooseRecord, index: number): NormalizedContractField {
  return {
    name: typeof entry.name === "string" ? entry.name : `arg_${index + 1}`,
    type: normalizeType(entry.type ?? entry.valueType ?? entry.kind ?? entry.value),
    required: entry.required !== false,
    doc: typeof entry.doc === "string" ? entry.doc : undefined,
  };
}

function extractFunctionEntries(abi: unknown): LooseRecord[] {
  if (Array.isArray(abi)) {
    return abi.filter((entry): entry is LooseRecord => !!entry && typeof entry === "object");
  }

  if (abi && typeof abi === "object") {
    const record = abi as LooseRecord;

    if (Array.isArray(record.functions)) {
      return record.functions.filter(
        (entry): entry is LooseRecord => !!entry && typeof entry === "object",
      );
    }

    if (Array.isArray(record.spec)) {
      return record.spec.filter(
        (entry): entry is LooseRecord => !!entry && typeof entry === "object",
      );
    }
  }

  return [];
}

export function createNormalizedContractSpecFromFunctionNames(
  names: string[],
  source: ContractSpecSource,
  rawSpec = "",
): NormalizedContractSpec {
  return {
    source,
    rawSpec,
    ingestedAt: Date.now(),
    functions: Array.from(new Set(names))
      .filter(Boolean)
      .map((name) => ({
        name,
        inputs: [],
        outputs: [],
      })),
  };
}

export function normalizeAbiJson(
  abi: unknown,
  source: ContractSpecSource = "json",
): NormalizedContractSpec {
  const functions = extractFunctionEntries(abi)
    .map((entry) => {
      const rawName =
        typeof entry.name === "string"
          ? entry.name
          : typeof entry.fn === "string"
            ? entry.fn
            : null;

      if (!rawName) {
        return null;
      }

      const rawType =
        typeof entry.type === "string"
          ? entry.type.toLowerCase()
          : typeof entry.kind === "string"
            ? entry.kind.toLowerCase()
            : "";

      if (rawType && !rawType.includes("func")) {
        const hasExplicitShape =
          Array.isArray(entry.inputs) ||
          Array.isArray(entry.outputs) ||
          typeof entry.doc === "string";

        if (!hasExplicitShape) {
          return null;
        }
      }

      const inputs = Array.isArray(entry.inputs)
        ? entry.inputs
            .filter((item): item is LooseRecord => !!item && typeof item === "object")
            .map(normalizeField)
        : [];

      const outputs = Array.isArray(entry.outputs)
        ? entry.outputs
            .filter((item): item is LooseRecord => !!item && typeof item === "object")
            .map(normalizeField)
        : [];

      const normalized: NormalizedContractFunction = {
        name: rawName,
        inputs,
        outputs,
      };

      if (typeof entry.doc === "string") {
        normalized.doc = entry.doc;
      }

      return normalized;
    })
    .filter((entry): entry is NormalizedContractFunction => entry !== null);

  if (functions.length > 0) {
    return {
      source,
      rawSpec: JSON.stringify(abi, null, 2),
      functions,
      ingestedAt: Date.now(),
    };
  }

  const fallbackNames = extractFunctionEntries(abi)
    .map((entry) => entry.name)
    .filter((name): name is string => typeof name === "string");

  return createNormalizedContractSpecFromFunctionNames(
    fallbackNames,
    source,
    JSON.stringify(abi, null, 2),
  );
}
