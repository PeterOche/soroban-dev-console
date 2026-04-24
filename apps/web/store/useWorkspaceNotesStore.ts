/**
 * FE-034: Persisted store for workspace notes and annotations.
 * Notes are durable — they are included in serialized workspace payloads
 * so they travel with exports, shares, and forks.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { WorkspaceNote } from "./workspace-schema";

interface WorkspaceNotesState {
  notes: WorkspaceNote[];
  addNote: (workspaceId: string, body: string, resource?: Pick<WorkspaceNote, "resourceType" | "resourceId">) => WorkspaceNote;
  updateNote: (id: string, body: string) => void;
  deleteNote: (id: string) => void;
  getNotesForWorkspace: (workspaceId: string) => WorkspaceNote[];
  getNotesForResource: (workspaceId: string, resourceType: WorkspaceNote["resourceType"], resourceId: string) => WorkspaceNote[];
}

export const useWorkspaceNotesStore = create<WorkspaceNotesState>()(
  persist(
    (set, get) => ({
      notes: [],

      addNote: (workspaceId, body, resource) => {
        const note: WorkspaceNote = {
          id: crypto.randomUUID(),
          workspaceId,
          body,
          resourceType: resource?.resourceType,
          resourceId: resource?.resourceId,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({ notes: [note, ...state.notes] }));
        return note;
      },

      updateNote: (id, body) =>
        set((state) => ({
          notes: state.notes.map((n) =>
            n.id === id ? { ...n, body, updatedAt: Date.now() } : n,
          ),
        })),

      deleteNote: (id) =>
        set((state) => ({ notes: state.notes.filter((n) => n.id !== id) })),

      getNotesForWorkspace: (workspaceId) =>
        get().notes.filter((n) => n.workspaceId === workspaceId),

      getNotesForResource: (workspaceId, resourceType, resourceId) =>
        get().notes.filter(
          (n) =>
            n.workspaceId === workspaceId &&
            n.resourceType === resourceType &&
            n.resourceId === resourceId,
        ),
    }),
    { name: "soroban-workspace-notes" },
  ),
);
