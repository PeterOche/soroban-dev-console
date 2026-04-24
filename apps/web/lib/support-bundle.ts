/**
 * FE-039: Support bundle generation.
 *
 * Packages workspace, transaction, and environment context into a
 * reproducible, redacted artifact for debugging and support.
 *
 * Sensitive client-only data (owner keys, wallet addresses) is excluded.
 */

import type { WorkspaceSnapshot } from "@/store/workspace-schema";
import type { SavedCall } from "@/store/useSavedCallsStore";
import type { NetworkConfig } from "@/store/useNetworkStore";

export interface SupportBundle {
  bundleVersion: 1;
  generatedAt: string;
  appVersion: string;
  environment: BundleEnvironment;
  workspace: BundleWorkspace | null;
  recentCalls: BundleCall[];
}

interface BundleEnvironment {
  network: string;
  rpcUrl: string;
  userAgent: string;
  schemaVersion: number;
}

interface BundleWorkspace {
  id: string;
  name: string;
  contractCount: number;
  savedCallCount: number;
  artifactCount: number;
  selectedNetwork: string;
  createdAt: string;
  updatedAt: string;
}

interface BundleCall {
  id: string;
  name: string;
  contractId: string;
  fnName: string;
  network: string;
  createdAt: string;
}

export function generateSupportBundle(
  workspace: WorkspaceSnapshot | undefined,
  savedCalls: SavedCall[],
  network: NetworkConfig,
  schemaVersion: number,
): SupportBundle {
  const workspaceCalls = workspace
    ? savedCalls.filter((c) => workspace.savedCallIds.includes(c.id))
    : [];

  return {
    bundleVersion: 1,
    generatedAt: new Date().toISOString(),
    // Use env var if available, otherwise a placeholder
    appVersion: process.env.NEXT_PUBLIC_APP_VERSION ?? "dev",
    environment: {
      network: network.id,
      rpcUrl: network.rpcUrl,
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "unknown",
      schemaVersion,
    },
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          contractCount: workspace.contractIds.length,
          savedCallCount: workspace.savedCallIds.length,
          artifactCount: workspace.artifactRefs.length,
          selectedNetwork: workspace.selectedNetwork,
          createdAt: new Date(workspace.createdAt).toISOString(),
          updatedAt: new Date(workspace.updatedAt).toISOString(),
        }
      : null,
    // Include up to 20 most recent calls; omit raw args (may contain sensitive data)
    recentCalls: workspaceCalls.slice(0, 20).map((c) => ({
      id: c.id,
      name: c.name,
      contractId: c.contractId,
      fnName: c.fnName,
      network: c.network,
      createdAt: new Date(c.createdAt).toISOString(),
    })),
  };
}

export function downloadSupportBundle(bundle: SupportBundle): void {
  const blob = new Blob([JSON.stringify(bundle, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `support-bundle-${bundle.generatedAt.slice(0, 19).replace(/:/g, "-")}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
