"use client";

/**
 * FE-027: Workspace fork and import-from-share flow.
 * - Loads the shared snapshot, runs compatibility validation
 * - Lets user name the fork, then imports into local workspace store
 * - Preserves source attribution (forkedFromToken) in the new workspace
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { sharesApi } from "@/lib/api/workspaces";
import { importWorkspace, type SerializedWorkspace, type ValidationResult } from "@/lib/workspace-serializer";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useContractStore } from "@/store/useContractStore";
import { useSavedCallsStore } from "@/store/useSavedCallsStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { Button } from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import { AlertTriangle, CheckCircle2, GitFork, Loader2 } from "lucide-react";
import { toast } from "sonner";

type LoadState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; payload: SerializedWorkspace; validation: ValidationResult };

export default function ForkSharedWorkspacePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [forkName, setForkName] = useState("");
  const [isForking, setIsForking] = useState(false);

  const { createWorkspace, setActiveWorkspace } = useWorkspaceStore();
  const { addContract } = useContractStore();

  useEffect(() => {
    if (!token) return;
    sharesApi
      .get(token)
      .then((link) => {
        const { payload, validation } = importWorkspace(link.snapshotJson);
        setForkName(`${payload.workspace.name} (Fork)`);
        setLoadState({ status: "ready", payload, validation });
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : "Failed to load shared workspace.";
        setLoadState({ status: "error", message: msg });
      });
  }, [token]);

  const handleFork = async () => {
    if (loadState.status !== "ready") return;
    const { payload } = loadState;
    const name = forkName.trim() || `${payload.workspace.name} (Fork)`;

    setIsForking(true);
    try {
      // Create the new workspace
      createWorkspace(name, payload.workspace.selectedNetwork);

      // Find the newly created workspace (last in list after creation)
      const newWorkspace = useWorkspaceStore.getState().workspaces.at(-1);
      if (!newWorkspace) throw new Error("Failed to create forked workspace");

      // Import contracts
      for (const contract of payload.contracts) {
        addContract(contract.id, contract.network);
        useWorkspaceStore.getState().addContractToWorkspace(newWorkspace.id, contract.id);
      }

      // Import saved calls
      for (const call of payload.savedCalls) {
        // saveCall generates a new id; we need to preserve the original id for workspace linkage
        const existing = useSavedCallsStore.getState().savedCalls.find((c) => c.id === call.id);
        if (!existing) {
          useSavedCallsStore.setState((state) => ({
            savedCalls: [call, ...state.savedCalls.filter((c) => c.id !== call.id)],
          }));
        }
        useWorkspaceStore.getState().linkSavedCall(newWorkspace.id, call.id);
      }

      // Activate the forked workspace
      setActiveWorkspace(newWorkspace.id);

      toast.success(`Forked as "${name}" — workspace is now active`);
      router.push("/");
    } catch (err) {
      toast.error(`Fork failed: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setIsForking(false);
    }
  };

  if (loadState.status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading shared workspace…
      </div>
    );
  }

  if (loadState.status === "error") {
    return (
      <div className="container mx-auto max-w-lg p-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              Cannot Fork
            </CardTitle>
            <CardDescription>{loadState.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.back()}>Go Back</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { payload, validation } = loadState;

  return (
    <div className="container mx-auto max-w-lg space-y-6 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <GitFork className="h-6 w-6" />
          Fork Workspace
        </h1>
        <p className="text-sm text-muted-foreground">
          Forking from <strong>{payload.workspace.name}</strong> ·{" "}
          <Badge variant="secondary">{payload.workspace.selectedNetwork}</Badge>
        </p>
      </div>

      {/* Compatibility / repair warnings */}
      {validation.warnings.length > 0 && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950/30 dark:text-yellow-200">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Compatibility notes — payload was auto-repaired before import:
          </div>
          <ul className="list-inside list-disc space-y-0.5">
            {validation.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {validation.errors.length > 0 && (
        <div className="rounded-md border border-destructive bg-destructive/10 p-3 text-sm text-destructive">
          <div className="mb-1 flex items-center gap-2 font-medium">
            <AlertTriangle className="h-4 w-4" />
            Validation errors — fork may be incomplete:
          </div>
          <ul className="list-inside list-disc space-y-0.5">
            {validation.errors.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">What will be imported</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Contracts</span>
            <span className="font-medium">{payload.contracts.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Saved Calls</span>
            <span className="font-medium">{payload.savedCalls.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Network</span>
            <Badge variant="outline">{payload.workspace.selectedNetwork}</Badge>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Source</span>
            <span className="font-mono text-xs text-muted-foreground truncate max-w-[180px]">{token}</span>
          </div>
        </CardContent>
      </Card>

      {/* Fork name */}
      <div className="space-y-2">
        <label htmlFor="fork-name" className="text-sm font-medium">
          New workspace name
        </label>
        <Input
          id="fork-name"
          value={forkName}
          onChange={(e) => setForkName(e.target.value)}
          placeholder="My forked workspace"
          disabled={isForking}
        />
      </div>

      <div className="flex gap-3">
        <Button variant="outline" onClick={() => router.back()} disabled={isForking}>
          Cancel
        </Button>
        <Button onClick={handleFork} disabled={isForking || !forkName.trim()} className="gap-2">
          {isForking ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Fork &amp; Open
        </Button>
      </div>
    </div>
  );
}
