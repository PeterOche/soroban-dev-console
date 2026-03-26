"use client";

import { Briefcase, PlusCircle } from "lucide-react";
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

export function WorkspaceSwitcher() {
  const { workspaces, activeWorkspaceId, setActiveWorkspace, createWorkspace } =
    useWorkspaceStore();
  const { currentNetwork } = useNetworkStore();
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const handleCreate = () => {
    if (newName.trim()) {
      createWorkspace(newName, currentNetwork);
      setNewName("");
      setIsCreating(false);
    }
  };

  return (
    <div className="space-y-2 px-3 py-2">
      <div className="flex items-center justify-between px-1 text-[10px] font-bold uppercase text-muted-foreground">
        <span>Workspaces</span>
        <button onClick={() => setIsCreating(!isCreating)}>
          <PlusCircle className="h-3 w-3 transition-colors hover:text-primary" />
        </button>
      </div>

      {isCreating ? (
        <div className="flex gap-1">
          <Input
            size={1}
            className="h-7 text-xs"
            placeholder="Project name..."
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
        </div>
      ) : (
        <Select value={activeWorkspaceId} onValueChange={setActiveWorkspace}>
          <SelectTrigger className="h-8 border-none bg-muted/50 text-xs font-medium hover:bg-muted">
            <Briefcase className="mr-2 h-3 w-3" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {workspaces.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
