export type ParseQuality = "full" | "partial" | "failed";

export interface UploadProvenance {
  filename: string;
  uploadedAt: number;
  parseQuality: ParseQuality;
  functionCount: number;
  source: "file" | "paste";
}

export interface UploadValidationResult {
  valid: boolean;
  provenance: UploadProvenance;
  functions: string[];
  rawSpec: string;
  error?: string;
}

export function validateInterfaceUpload(
  raw: string,
  filename: string,
  source: "file" | "paste" = "file",
): UploadValidationResult {
  const provenance: UploadProvenance = {
    filename,
    uploadedAt: Date.now(),
    parseQuality: "failed",
    functionCount: 0,
    source,
  };

  if (!raw?.trim()) {
    return { valid: false, provenance, functions: [], rawSpec: raw ?? "", error: "Empty input" };
  }

  try {
    const parsed = JSON.parse(raw);
    const functions: string[] = Array.isArray(parsed)
      ? parsed.filter((f) => typeof f === "string")
      : Array.isArray(parsed?.functions)
        ? parsed.functions.filter((f: unknown) => typeof f === "string")
        : [];

    const parseQuality: ParseQuality = functions.length > 0 ? "full" : "partial";

    return {
      valid: functions.length > 0,
      provenance: { ...provenance, parseQuality, functionCount: functions.length },
      functions,
      rawSpec: raw,
    };
  } catch {
    return {
      valid: false,
      provenance: { ...provenance, parseQuality: "failed" },
      functions: [],
      rawSpec: raw,
      error: "Failed to parse interface JSON",
    };
  }
}
