import type { ResultBundle } from "@/store/useResultBundlesStore";

export function downloadJsonFile(filename: string, payload: unknown): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function exportResultBundle(bundle: ResultBundle): void {
  const stamp = new Date(bundle.createdAt).toISOString().slice(0, 19).replace(/:/g, "-");
  downloadJsonFile(`result-bundle-${bundle.kind}-${stamp}.json`, {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    bundle,
  });
}

export function exportAllResultBundles(bundles: ResultBundle[]): void {
  downloadJsonFile(`result-bundles-${new Date().toISOString().slice(0, 10)}.json`, {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    count: bundles.length,
    bundles,
  });
}
