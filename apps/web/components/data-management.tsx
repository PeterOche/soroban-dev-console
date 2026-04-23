"use client";

import { useState } from "react";
import { Button } from "@devconsole/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@devconsole/ui";
import {
  Download,
  Upload,
  AlertTriangle,
  Loader2,
  FileJson,
  Share2,
  Copy,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useContractStore } from "@/store/useContractStore";
import { useSavedCallsStore } from "@/store/useSavedCallsStore";
import {
  serializeWorkspace,
  deserializeWorkspace,
} from "@/lib/workspace-serializer";
import { sharesApi } from "@/lib/api/workspaces";

// The keys defined in your Zustand 'persist' middleware options
const STORAGE_KEYS = {
  CONTRACTS: "soroban-contracts-storage",
  SAVED_CALLS: "soroban-saved-calls",
  NETWORKS: "soroban-network-storage",
};

export function DataManagement() {
  const [isImporting, setIsImporting] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [isCopied, setIsCopied] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

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

        // Try versioned workspace import first (FE-012)
        if (json.version === 1 && json.workspace) {
          const payload = deserializeWorkspace(json);
          // Merge contracts and saved calls into localStorage stores
          const contractsKey = STORAGE_KEYS.CONTRACTS;
          const existing = JSON.parse(
            localStorage.getItem(contractsKey) ?? '{"state":{"contracts":[]}}',
          );
          const merged = [
            ...payload.contracts,
            ...(existing?.state?.contracts ?? []),
          ].filter(
            (c, i, arr) => arr.findIndex((x) => x.id === c.id) === i,
          );
          existing.state.contracts = merged;
          localStorage.setItem(contractsKey, JSON.stringify(existing));

          toast.success(
            `Workspace "${payload.workspace.name}" imported! Reloading...`,
          );
          setTimeout(() => window.location.reload(), 1500);
          return;
        }

        // Legacy full-backup import
        if (!json.contracts && !json.savedCalls && !json.networks) {
          throw new Error("Invalid backup file format");
        }

        if (json.contracts)
          localStorage.setItem(
            STORAGE_KEYS.CONTRACTS,
            JSON.stringify(json.contracts),
          );
        if (json.savedCalls)
          localStorage.setItem(
            STORAGE_KEYS.SAVED_CALLS,
            JSON.stringify(json.savedCalls),
          );
        if (json.networks)
          localStorage.setItem(
            STORAGE_KEYS.NETWORKS,
            JSON.stringify(json.networks),
          );

        toast.success("Data imported successfully! Reloading...");
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

  // FE-014: create a shareable read-only link
  const handleShare = async () => {
    const workspace = getActiveWorkspace();
    if (!workspace) {
      toast.error("No active workspace to share");
      return;
    }

    setIsSharing(true);
    try {
      let workspaceCloudId = cloudId;

      // Sync to cloud first if not yet synced
      if (!workspaceCloudId) {
        const contractRefs = contracts
          .filter((c) => workspace.contractIds.includes(c.id))
          .map((c) => ({ contractId: c.id, network: c.network }));
        const interactionRefs = savedCalls
          .filter((c) => workspace.savedCallIds.includes(c.id))
          .map((c) => ({ functionName: c.fnName, argumentsJson: c.args }));

        const shareId = await syncToCloud({
          name: workspace.name,
          contracts: contractRefs,
          interactions: interactionRefs,
        });

        if (!shareId) throw new Error("Failed to sync workspace to cloud");
        workspaceCloudId = shareId;
      }

      const snapshot = serializeWorkspace(workspace, contracts, savedCalls);
      const link = await sharesApi.create({
        workspaceId: workspaceCloudId,
        snapshotJson: snapshot,
        label: workspace.name,
      });

      const url = `${window.location.origin}/share/${link.token}`;
      setShareUrl(url);
    } catch (err) {
      console.error(err);
      toast.error(
        `Share failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    } finally {
      setIsSharing(false);
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setIsCopied(true);
    toast.success("Link copied to clipboard");
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
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

          {/* Import Button (Hidden Input Wrapper) */}
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

          {/* Share Button (FE-014) */}
          <Button
            onClick={handleShare}
            variant="outline"
            className="h-20 flex-1 gap-2 py-4 sm:h-auto"
            disabled={isSharing}
          >
            {isSharing ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <Share2 className="h-5 w-5" />
            )}
            <div className="text-left">
              <div className="font-semibold">Share Workspace</div>
              <div className="text-xs font-normal text-muted-foreground">
                Create read-only link
              </div>
            </div>
          </Button>
        </div>

        {/* Share URL display (FE-014) */}
        {shareUrl && (
          <div className="flex items-center gap-2 rounded-md border bg-muted/50 px-3 py-2 text-sm">
            <span className="flex-1 truncate font-mono text-xs">{shareUrl}</span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 shrink-0"
              onClick={handleCopy}
            >
              {isCopied ? (
                <Check className="h-4 w-4 text-green-500" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}

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
  );
}
