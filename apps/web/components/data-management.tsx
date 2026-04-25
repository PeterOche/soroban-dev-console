"use client";

/**
 * FE-012 / FE-014 / FE-025 / FE-028: Data management panel.
 * FE-025: Uses importWorkspace() for deep validation + repair on import.
 * FE-028: Full share-link management — create (with expiry), list, inspect, revoke.
 */

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { Button } from "@devconsole/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import {
  Download,
  Upload,
  AlertTriangle,
  Loader2,
  FileJson,
  Share2,
  Copy,
  Check,
  ShieldAlert,
  Package,
  Trash2,
  ExternalLink,
  RefreshCw,
  Clock,
  ShieldOff,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useContractStore } from "@/store/useContractStore";
import { useSavedCallsStore } from "@/store/useSavedCallsStore";
import {
  serializeWorkspace,
  importWorkspace,
} from "@/lib/workspace-serializer";
import { sharesApi } from "@/lib/api/workspaces";
import {
  scanAllStores,
  buildSalvageExport,
  safeReadLocalStorage,
} from "@/lib/state-repair";
import {
  generateSupportBundle,
  downloadSupportBundle,
} from "@/lib/support-bundle";
import { useNetworkStore } from "@/store/useNetworkStore";
import { STORE_SCHEMA_VERSION } from "@/store/schema-version";
import type { ShareSummary } from "@devconsole/api-contracts";
import { useResultBundlesStore } from "@/store/useResultBundlesStore";
import { exportAllResultBundles, exportResultBundle } from "@/lib/result-bundles";
import { useWasmStore } from "@/store/useWasmStore";

// The keys defined in your Zustand 'persist' middleware options
const STORAGE_KEYS = {
  CONTRACTS: "soroban-contracts-storage",
  SAVED_CALLS: "soroban-saved-calls",
  NETWORKS: "soroban-network-storage",
};

// ── Share management sub-component ───────────────────────────────────────────

function ShareManagement({ workspaceCloudId }: { workspaceCloudId: string | null }) {
  const [shares, setShares] = useState<ShareSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [label, setLabel] = useState("");
  const [expiryHours, setExpiryHours] = useState("");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const { getActiveWorkspace, syncToCloud, cloudId } = useWorkspaceStore();
  const { contracts } = useContractStore();
  const { savedCalls } = useSavedCallsStore();

  const loadShares = useCallback(async (wsId: string) => {
    setIsLoading(true);
    try {
      const list = await sharesApi.listForWorkspace(wsId);
      setShares(list);
    } catch {
      toast.error("Failed to load share links");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (workspaceCloudId) loadShares(workspaceCloudId);
  }, [workspaceCloudId, loadShares]);

  const handleCreate = async () => {
    const workspace = getActiveWorkspace();
    if (!workspace) { toast.error("No active workspace"); return; }

    setIsCreating(true);
    try {
      let wsCloudId = workspaceCloudId;

      if (!wsCloudId) {
        const contractRefs = contracts
          .filter((c) => workspace.contractIds.includes(c.id))
          .map((c) => ({ contractId: c.id, network: c.network }));
        const interactionRefs = savedCalls
          .filter((c) => workspace.savedCallIds.includes(c.id))
          .map((c) => ({ functionName: c.fnName, argumentsJson: c.args }));

        wsCloudId = await syncToCloud({
          name: workspace.name,
          contracts: contractRefs,
          interactions: interactionRefs,
        });
        if (!wsCloudId) throw new Error("Failed to sync workspace to cloud");
      }

      const snapshot = serializeWorkspace(workspace, contracts, savedCalls);
      const expiresInSeconds = expiryHours ? parseInt(expiryHours) * 3600 : undefined;

      const link = await sharesApi.create({
        workspaceId: wsCloudId,
        snapshotJson: snapshot,
        label: label.trim() || workspace.name,
        expiresInSeconds,
      });

      setShares((prev) => [link, ...prev]);
      setLabel("");
      setExpiryHours("");
      toast.success("Share link created");
    } catch (err) {
      toast.error(`Failed to create share: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsCreating(false);
    }
  };

  const handleRevoke = async (token: string) => {
    try {
      await sharesApi.revoke(token);
      setShares((prev) =>
        prev.map((s) =>
          s.token === token ? { ...s, revokedAt: new Date().toISOString() } : s,
        ),
      );
      toast.success("Share link revoked");
    } catch {
      toast.error("Failed to revoke share link");
    }
  };

  const handleCopy = async (token: string) => {
    const url = `${window.location.origin}/share/${token}`;
    await navigator.clipboard.writeText(url);
    setCopiedToken(token);
    toast.success("Link copied to clipboard");
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const isExpired = (s: ShareSummary) =>
    s.expiresAt != null && new Date(s.expiresAt) < new Date();
  const isRevoked = (s: ShareSummary) => s.revokedAt != null;
  const isActive = (s: ShareSummary) => !isRevoked(s) && !isExpired(s);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Share2 className="h-4 w-4" />
          Share Links
          {workspaceCloudId && (
            <Button
              size="icon"
              variant="ghost"
              className="ml-auto h-7 w-7"
              onClick={() => workspaceCloudId && loadShares(workspaceCloudId)}
              disabled={isLoading}
              aria-label="Refresh share links"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Create read-only links to share this workspace. Links can have an optional expiry and can be revoked at any time.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Create form */}
        <div className="space-y-2 rounded-md border p-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">New share link</p>
          <div className="flex gap-2">
            <Input
              placeholder="Label (optional)"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              disabled={isCreating}
              className="flex-1"
            />
            <Input
              placeholder="Expires in (hours)"
              type="number"
              min="1"
              value={expiryHours}
              onChange={(e) => setExpiryHours(e.target.value)}
              disabled={isCreating}
              className="w-40"
            />
            <Button onClick={handleCreate} disabled={isCreating} className="gap-2 shrink-0">
              {isCreating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Share2 className="h-4 w-4" />}
              Create
            </Button>
          </div>
        </div>

        {/* Share list */}
        {!workspaceCloudId ? (
          <p className="text-sm text-muted-foreground">
            Sync your workspace to the cloud first to manage share links.
          </p>
        ) : isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading share links…
          </div>
        ) : shares.length === 0 ? (
          <p className="text-sm text-muted-foreground">No share links yet.</p>
        ) : (
          <ul className="space-y-2">
            {shares.map((s) => (
              <li
                key={s.id}
                className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium truncate">{s.label ?? s.token}</span>
                    {isRevoked(s) && (
                      <Badge variant="destructive" className="shrink-0 gap-1">
                        <ShieldOff className="h-3 w-3" /> Revoked
                      </Badge>
                    )}
                    {!isRevoked(s) && isExpired(s) && (
                      <Badge variant="secondary" className="shrink-0 gap-1">
                        <Clock className="h-3 w-3" /> Expired
                      </Badge>
                    )}
                    {isActive(s) && (
                      <Badge variant="outline" className="shrink-0 text-green-600 border-green-300">
                        Active
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Created {new Date(s.createdAt).toLocaleDateString()}
                    {s.expiresAt && (
                      <> · Expires {new Date(s.expiresAt).toLocaleDateString()}</>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => handleCopy(s.token)}
                    disabled={isRevoked(s)}
                    aria-label="Copy link"
                  >
                    {copiedToken === s.token ? (
                      <Check className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => window.open(`/share/${s.token}`, "_blank")}
                    disabled={isRevoked(s) || isExpired(s)}
                    aria-label="Open link"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Button>
                  {!isRevoked(s) && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => handleRevoke(s.token)}
                      aria-label="Revoke link"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main DataManagement component ─────────────────────────────────────────────

export function DataManagement() {
  const [isImporting, setIsImporting] = useState(false);
  const [isGeneratingBundle, setIsGeneratingBundle] = useState(false);

  // FE-037: recovery state
  const [corruptionSummary, setCorruptionSummary] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const { getActiveWorkspace, cloudId } = useWorkspaceStore();
  const { contracts } = useContractStore();
  const { savedCalls } = useSavedCallsStore();
  const { bundles, removeBundle, clearBundles } = useResultBundlesStore();
  const { wasms } = useWasmStore();
  const { getActiveNetworkConfig } = useNetworkStore();
  const deployOutcomes = wasms.filter((entry) => Boolean(entry.deployedContractId));

  const handleExport = () => {
    try {
      const workspace = getActiveWorkspace();

      if (workspace) {
        // FE-012: versioned workspace export
        const payload = serializeWorkspace(workspace, contracts, savedCalls);
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `workspace-${workspace.name.replace(/\s+/g, "-")}-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Fallback: full localStorage backup
        const contractsRaw = localStorage.getItem(STORAGE_KEYS.CONTRACTS);
        const savedCallsRaw = localStorage.getItem(STORAGE_KEYS.SAVED_CALLS);
        const networksRaw = localStorage.getItem(STORAGE_KEYS.NETWORKS);
        const data = {
          version: 1,
          timestamp: new Date().toISOString(),
          contracts: contractsRaw ? JSON.parse(contractsRaw) : null,
          savedCalls: savedCallsRaw ? JSON.parse(savedCallsRaw) : null,
          networks: networksRaw ? JSON.parse(networksRaw) : null,
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `soroban-console-backup-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }

      toast.success("Backup downloaded successfully");
    } catch (e) {
      console.error(e);
      toast.error("Failed to export data");
    }
  };

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string);

        // FE-025: use importWorkspace for deep validation + repair
        if (json.version && json.workspace) {
          const { payload, validation } = importWorkspace(json);

          if (validation.warnings.length > 0) {
            toast.warning(
              `Import repaired ${validation.warnings.length} issue(s) — workspace may be partially restored`,
            );
          }

          const upsertById = <T extends { id: string }>(nextItems: T[], existingItems: T[]) => [
            ...nextItems,
            ...existingItems.filter(
              (existingItem) =>
                !nextItems.some((nextItem) => nextItem.id === existingItem.id),
            ),
          ];

          const existingContracts = (safeReadLocalStorage(STORAGE_KEYS.CONTRACTS) as any)?.state?.contracts ?? [];
          localStorage.setItem(
            STORAGE_KEYS.CONTRACTS,
            JSON.stringify({
              state: {
                contracts: upsertById(payload.contracts, existingContracts),
              },
              version: STORE_SCHEMA_VERSION,
            }),
          );

          const existingSavedCalls = (safeReadLocalStorage(STORAGE_KEYS.SAVED_CALLS) as any)?.state?.savedCalls ?? [];
          localStorage.setItem(
            STORAGE_KEYS.SAVED_CALLS,
            JSON.stringify({
              state: {
                savedCalls: upsertById(payload.savedCalls, existingSavedCalls),
                cartItems: [],
              },
              version: STORE_SCHEMA_VERSION,
            }),
          );

          const existingWorkspacesState = (safeReadLocalStorage("soroban-workspaces") as any)?.state ?? {};
          const existingWorkspaces = existingWorkspacesState.workspaces ?? [];
          localStorage.setItem(
            "soroban-workspaces",
            JSON.stringify({
              state: {
                ...existingWorkspacesState,
                workspaces: upsertById([payload.workspace], existingWorkspaces),
                activeWorkspaceId: payload.workspace.id,
              },
              version: STORE_SCHEMA_VERSION,
            }),
          );

          if (payload.notes) {
            const existingNotesState =
              (safeReadLocalStorage("soroban-workspace-notes") as any)?.state ?? {};
            const existingNotes = existingNotesState.notes ?? [];
            localStorage.setItem(
              "soroban-workspace-notes",
              JSON.stringify({
                state: {
                  ...existingNotesState,
                  notes: upsertById(payload.notes, existingNotes),
                },
                version: STORE_SCHEMA_VERSION,
              }),
            );
          }

          toast.success(`Workspace "${payload.workspace.name}" imported! Reloading…`);
          setTimeout(() => window.location.reload(), 1500);
          return;
        }

        // Legacy full-backup import
        if (!json.contracts && !json.savedCalls && !json.networks) {
          throw new Error("Invalid backup file format");
        }

        if (json.contracts)
          localStorage.setItem(STORAGE_KEYS.CONTRACTS, JSON.stringify(json.contracts));
        if (json.savedCalls)
          localStorage.setItem(STORAGE_KEYS.SAVED_CALLS, JSON.stringify(json.savedCalls));
        if (json.networks)
          localStorage.setItem(STORAGE_KEYS.NETWORKS, JSON.stringify(json.networks));

        toast.success("Data imported successfully! Reloading…");
        setTimeout(() => window.location.reload(), 1500);
      } catch (err: unknown) {
        console.error(err);
        toast.error(
          `Import failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
        setIsImporting(false);
      }
    };

    reader.readAsText(file);
  };

  // FE-037: scan all stores for corruption and offer salvage export
  const handleRecoveryScan = () => {
    setIsScanning(true);
    try {
      const reports = scanAllStores();
      const corrupted = Object.entries(reports).filter(([, r]) => r.isCorrupted);

      if (corrupted.length === 0) {
        setCorruptionSummary(null);
        toast.success("All stores are healthy — no corruption detected.");
        return;
      }

      const summary = corrupted
        .map(([label, r]) => `${label}: ${r.reasons.join("; ")}`)
        .join("\n");
      setCorruptionSummary(summary);
      toast.warning(`Corruption detected in ${corrupted.length} store(s). See details below.`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSalvageExport = () => {
    try {
      const reports = scanAllStores();
      const allSalvageable = Object.values(reports).flatMap(
        (r) => r.salvageableWorkspaces,
      );
      const rawContracts = (safeReadLocalStorage(STORAGE_KEYS.CONTRACTS) as any)?.state
        ?.contracts;
      const rawSavedCalls = (safeReadLocalStorage(STORAGE_KEYS.SAVED_CALLS) as any)?.state
        ?.savedCalls;

      const json = buildSalvageExport(allSalvageable, rawContracts, rawSavedCalls);
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salvage-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Salvage export downloaded.");
    } catch (err) {
      toast.error(`Salvage export failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  // FE-039: generate and download a support bundle
  const handleSupportBundle = async () => {
    setIsGeneratingBundle(true);
    try {
      const workspace = getActiveWorkspace();
      const network = getActiveNetworkConfig();
      const bundle = generateSupportBundle(workspace, savedCalls, network, STORE_SCHEMA_VERSION);
      downloadSupportBundle(bundle);
      toast.success("Support bundle downloaded.");
    } catch (err) {
      toast.error(
        `Bundle generation failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsGeneratingBundle(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Export / Import */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileJson className="h-5 w-5" />
            Data Management
          </CardTitle>
          <CardDescription>
            Export your local data (contracts, saved interactions, networks) for
            backup or to transfer to another browser.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row">
            {/* Export Button */}
            <Button
              onClick={handleExport}
              variant="outline"
              className="h-20 flex-1 gap-2 py-4 sm:h-auto"
            >
              <Download className="h-5 w-5" />
              <div className="text-left">
                <div className="font-semibold">Export Backup</div>
                <div className="text-xs font-normal text-muted-foreground">
                  Download .json file
                </div>
              </div>
            </Button>

            {/* Import Button */}
            <div className="flex-1">
              <input
                type="file"
                id="import-file"
                accept=".json"
                className="hidden"
                onChange={handleImport}
                disabled={isImporting}
              />
              <label htmlFor="import-file">
                <Button
                  variant="outline"
                  className="h-20 w-full cursor-pointer gap-2 py-4 sm:h-full"
                  asChild
                  disabled={isImporting}
                >
                  <span>
                    {isImporting ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Upload className="h-5 w-5" />
                    )}
                    <div className="text-left">
                      <div className="font-semibold">Import Backup</div>
                      <div className="text-xs font-normal text-muted-foreground">
                        Restore from .json file
                      </div>
                    </div>
                  </span>
                </Button>
              </label>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <strong>Warning:</strong> Importing data will{" "}
              <strong>overwrite</strong> your current contracts, saved calls, and
              custom networks. This action cannot be undone.
            </p>
          </div>
          {/* FE-039: Support Bundle */}
          <div className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-2">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Support Bundle</p>
                <p className="text-xs text-muted-foreground">
                  Download a redacted snapshot of workspace, calls, and environment for debugging.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleSupportBundle}
              disabled={isGeneratingBundle}
              className="shrink-0"
            >
              {isGeneratingBundle ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Generate Bundle
            </Button>
          </div>

          {/* FE-055: Result bundle export */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <Package className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="flex-1">
                <p className="text-sm font-medium">Result Bundles</p>
                <p className="text-xs text-muted-foreground">
                  Export simulation and transaction outcomes from single-call,
                  batch, and deployment workflows.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={bundles.length === 0}
                onClick={() => {
                  exportAllResultBundles(bundles);
                  toast.success("All result bundles exported");
                }}
              >
                <Download className="mr-2 h-3 w-3" />
                Export All Bundles ({bundles.length})
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={bundles.length === 0}
                onClick={() => {
                  clearBundles();
                  toast.success("Result bundles cleared");
                }}
              >
                <Trash2 className="mr-2 h-3 w-3" />
                Clear Bundles
              </Button>
            </div>

            {bundles.length > 0 && (
              <div className="space-y-2">
                {bundles.slice(0, 8).map((bundle) => (
                  <div
                    key={bundle.id}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{bundle.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {bundle.kind} · {bundle.networkId} ·{" "}
                        {new Date(bundle.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => exportResultBundle(bundle)}
                        aria-label="Export result bundle"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => removeBundle(bundle.id)}
                        aria-label="Delete result bundle"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {deployOutcomes.length > 0 && (
              <div className="space-y-2 pt-1">
                <p className="text-xs font-medium text-muted-foreground">
                  Deployment Outcomes
                </p>
                {deployOutcomes.slice(0, 5).map((entry) => (
                  <div
                    key={`${entry.hash}-${entry.deployedContractId}`}
                    className="flex items-center justify-between rounded-md border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{entry.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.network} · {entry.deployedContractId}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        const bundle = {
                          id: crypto.randomUUID(),
                          kind: "deploy" as const,
                          title: `Deploy outcome · ${entry.name}`,
                          createdAt: entry.deployedAt ?? Date.now(),
                          networkId: entry.network,
                          contractId: entry.deployedContractId,
                          payload: {
                            wasmHash: entry.hash,
                            version: entry.version,
                            installedAt: entry.installedAt,
                            deployedAt: entry.deployedAt,
                            workspaceId: entry.workspaceId,
                            provenance: entry.provenance,
                          },
                        };
                        exportResultBundle(bundle);
                        toast.success("Deploy outcome bundle exported");
                      }}
                    >
                      <Download className="mr-2 h-3 w-3" />
                      Export
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* FE-037: Recovery Tooling */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-start gap-2">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
              <div className="flex-1">
                <p className="text-sm font-medium">State Recovery</p>
                <p className="text-xs text-muted-foreground">
                  Scan local stores for corruption. Export salvageable data before resetting.
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleRecoveryScan}
                disabled={isScanning}
              >
                {isScanning ? (
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                ) : (
                  <ShieldAlert className="mr-2 h-3 w-3" />
                )}
                Scan for Corruption
              </Button>
              {corruptionSummary && (
                <Button size="sm" variant="outline" onClick={handleSalvageExport}>
                  <Download className="mr-2 h-3 w-3" />
                  Export Salvageable Data
                </Button>
              )}
            </div>
            {corruptionSummary && (
              <pre className="mt-1 rounded bg-red-50 p-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300 whitespace-pre-wrap">
                {corruptionSummary}
              </pre>
            )}
          </div>
        </CardContent>
      </Card>
      {/* FE-028: Share link management */}
      <ShareManagement workspaceCloudId={cloudId} />
    </div>
  );
}
