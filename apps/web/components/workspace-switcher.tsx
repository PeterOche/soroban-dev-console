"use client";

import {
  Briefcase,
  PlusCircle,
  Cloud,
  CloudOff,
  Loader2,
  LayoutTemplate,
  ChevronDown,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@devconsole/ui";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useContractStore } from "@/store/useContractStore";
import { useSavedCallsStore } from "@/store/useSavedCallsStore";
import { WORKSPACE_TEMPLATES } from "@/lib/fixture-manifest";
import { toast } from "sonner";

// ── FE-030: Recent workspace tracking ────────────────────────────────────────

const RECENT_WS_KEY = "soroban-recent-workspaces";
const MAX_RECENT_WS = 3;

function loadRecentWorkspaceIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_WS_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function pushRecentWorkspaceId(id: string): void {
  if (typeof window === "undefined") return;
  const ids = loadRecentWorkspaceIds().filter((x) => x !== id);
  ids.unshift(id);
  localStorage.setItem(RECENT_WS_KEY, JSON.stringify(ids.slice(0, MAX_RECENT_WS)));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function WorkspaceSwitcher() {
  const {
    workspaces,
    activeWorkspaceId,
    setActiveWorkspace,
    createWorkspace,
    createWorkspaceFromTemplate,
    getActiveWorkspace,
    syncToCloud,
    syncState,
    cloudId,
  } = useWorkspaceStore();

  const { currentNetwork } = useNetworkStore();
  const { contracts } = useContractStore();
  const { savedCalls } = useSavedCallsStore();

  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [showTemplates, setShowTemplates] = useState(false);

  // FE-030: Recent workspaces
  const recentIds = loadRecentWorkspaceIds();
  const recentWorkspaces = recentIds
    .map((id) => workspaces.find((w) => w.id === id))
    .filter(Boolean) as typeof workspaces;

  const handleCreate = () => {
    if (newName.trim()) {
      createWorkspace(newName, currentNetwork);
      setNewName("");
      setIsCreating(false);
    }
  };

  const handleSelectWorkspace = (id: string) => {
    setActiveWorkspace(id);
    pushRecentWorkspaceId(id);
  };

  // FE-032: Create from template
  const handleCreateFromTemplate = (templateKey: string) => {
    const template = WORKSPACE_TEMPLATES.find((t) => t.key === templateKey);
    if (!template) return;
    createWorkspaceFromTemplate(template, currentNetwork);
    setShowTemplates(false);
    toast.success(`Workspace created from template: ${template.name}`);
  };

  const handleSync = async () => {
    const ws = getActiveWorkspace();
    if (!ws) return;

    const contractRefs = contracts
      .filter((c) => ws.contractIds.includes(c.id))
      .map((c) => ({ contractId: c.id, network: c.network }));

    const interactionRefs = savedCalls
      .filter((c) => ws.savedCallIds.includes(c.id))
      .map((c) => ({
        functionName: c.fnName,
        argumentsJson: c.args,
      }));

    const shareId = await syncToCloud({
      name: ws.name,
      contracts: contractRefs,
      interactions: interactionRefs,
    });

    if (shareId) {
      toast.success("Workspace synced to cloud");
    } else {
      toast.error("Sync failed — check API connection");
    }
  };

  const syncIcon =
    syncState === "syncing" ? (
      <Loader2 className="h-4 w-4 animate-spin" />
    ) : cloudId ? (
      <Cloud className="h-4 w-4" />
    ) : (
      <CloudOff className="h-4 w-4" />
    );

  return (
    <div className="flex flex-col gap-2 p-2">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm font-medium">
          <Briefcase className="h-4 w-4" /> Workspaces
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={handleSync} title="Sync to cloud">
            {syncIcon}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowTemplates(!showTemplates)}
            title="Create from template"
          >
            <LayoutTemplate className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsCreating(!isCreating)}
            title="New workspace"
          >
            <PlusCircle className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* FE-032: Template picker */}
      {showTemplates && (
        <div className="rounded-md border bg-muted/40 p-2">
          <p className="mb-1 text-xs font-medium text-muted-foreground">Starter templates</p>
          {WORKSPACE_TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => handleCreateFromTemplate(t.key)}
              className="flex w-full flex-col rounded px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <span className="font-medium">{t.name}</span>
              <span className="text-xs text-muted-foreground">{t.description}</span>
            </button>
          ))}
        </div>
      )}

      {isCreating ? (
        <div className="flex gap-1">
          <Input
            autoFocus
            placeholder="Workspace name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            className="h-8 text-sm"
          />
          <Button size="sm" onClick={handleCreate}>
            Add
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-0.5">
          {/* FE-030: Recent workspaces section */}
          {recentWorkspaces.length > 0 && (
            <>
              <p className="px-1 text-xs text-muted-foreground">Recent</p>
              {recentWorkspaces.map((w) => (
                <button
                  key={`recent-${w.id}`}
                  onClick={() => handleSelectWorkspace(w.id)}
                  className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                    activeWorkspaceId === w.id
                      ? "bg-accent font-medium"
                      : "hover:bg-accent/50"
                  }`}
                >
                  <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="truncate">{w.name}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {w.selectedNetwork}
                  </span>
                </button>
              ))}
              <div className="my-1 border-t" />
            </>
          )}

          {/* All workspaces */}
          {workspaces.map((w) => (
            <button
              key={w.id}
              onClick={() => handleSelectWorkspace(w.id)}
              className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
                activeWorkspaceId === w.id
                  ? "bg-accent font-medium"
                  : "hover:bg-accent/50"
              }`}
            >
              <Briefcase className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{w.name}</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {w.selectedNetwork}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
