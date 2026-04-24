export type ErrorCategory =
  | "auth"
  | "simulation"
  | "invocation"
  | "network"
  | "contract"
  | "unknown";

export interface DecodedError {
  category: ErrorCategory;
  summary: string;
  detail: string;
  raw: string;
}

const ERROR_PATTERNS: Array<{
  pattern: RegExp;
  category: ErrorCategory;
  summary: string;
}> = [
  { pattern: /auth|unauthorized|signature/i, category: "auth", summary: "Authorization failure" },
  { pattern: /simulation|preflight/i, category: "simulation", summary: "Simulation error" },
  { pattern: /invoke|invocation/i, category: "invocation", summary: "Invocation error" },
  { pattern: /network|timeout|connection/i, category: "network", summary: "Network error" },
  { pattern: /trap|wasm|contract/i, category: "contract", summary: "Contract execution error" },
];

export function decodeError(raw: string): DecodedError {
  if (!raw) {
    return { category: "unknown", summary: "Unknown error", detail: "", raw: "" };
  }

  for (const { pattern, category, summary } of ERROR_PATTERNS) {
    if (pattern.test(raw)) {
      return { category, summary, detail: raw, raw };
    }
  }

  return { category: "unknown", summary: "Unexpected error", detail: raw, raw };
}

export function formatErrorForDisplay(decoded: DecodedError): string {
  return `[${decoded.category.toUpperCase()}] ${decoded.summary}: ${decoded.detail}`;
}
