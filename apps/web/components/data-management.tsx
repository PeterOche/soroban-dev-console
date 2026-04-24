"use client";

/**
 * FE-012 / FE-014 / FE-025 / FE-028: Data management panel.
 * FE-025: Uses importWorkspace() for deep validation + repair on import.
 * FE-028: Full share-link management — create (with expiry), list, inspect, revoke.
 */

import { useCallback, useEffect, useState } from "react";
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
import type { ShareSummary } from "@devconsole/api-contracts";

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

  const { getActiveWorkspace, syncToCloud, cloudId } = useWorkspaceStore();
  const { contracts } = useContractStore();
  const { savedCalls } = useSavedCallsStore();

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

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
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

          // Merge contracts into localStorage store
          const contractsKey = STORAGE_KEYS.CONTRACTS;
          const existing = JSON.parse(
            localStorage.getItem(contractsKey) ?? '{"state":{"contracts":[]}}',
          );
          const merged = [
            ...payload.contracts,
            ...(existing?.state?.contracts ?? []),
          ].filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i);
          existing.state.contracts = merged;
          localStorage.setItem(contractsKey, JSON.stringify(existing));

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
        </CardContent>
      </Card>

      {/* FE-028: Share link management */}
      <ShareManagement workspaceCloudId={cloudId} />
    </div>
  );
}
