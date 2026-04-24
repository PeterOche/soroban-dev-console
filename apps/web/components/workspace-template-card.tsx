"use client";

import { ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useNetworkStore } from "@/store/useNetworkStore";
import type { WorkspaceTemplate } from "@/lib/fixture-manifest";

interface Props {
  template: WorkspaceTemplate;
}

export function WorkspaceTemplateCard({ template }: Props) {
  const { createWorkspaceFromTemplate, setActiveWorkspace, workspaces } = useWorkspaceStore();
  const { currentNetwork } = useNetworkStore();

  const handleCreate = () => {
    createWorkspaceFromTemplate(template, currentNetwork);
    // Switch to the newly created workspace (it's the last one added)
    const updated = useWorkspaceStore.getState().workspaces;
    const newest = updated[updated.length - 1];
    if (newest) {
      setActiveWorkspace(newest.id);
      toast.success(`Workspace "${template.name}" created`);
    }
  };

  return (
    <button
      onClick={handleCreate}
      className="group flex flex-col gap-1 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted/50"
    >
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{template.name}</span>
        <ArrowRight className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100" />
      </div>
      <p className="text-xs text-muted-foreground">{template.description}</p>
      {template.defaultNetwork && (
        <span className="mt-1 w-fit rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
          {template.defaultNetwork}
        </span>
      )}
    </button>
  );
}
