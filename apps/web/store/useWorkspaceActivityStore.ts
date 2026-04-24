/**
 * FE-035: Workspace activity timeline store.
 * Records local domain events (create, sync, share, fork, import, checkpoint)
 * and surfaces them in chronological order alongside remote audit entries.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type ActivityEventKind =
  | "workspace_created"
  | "workspace_synced"
  | "workspace_imported"
  | "share_created"
  | "share_revoked"
  | "workspace_forked"
  | "checkpoint_created"
  | "note_added"
  | "contract_added"
  | "remote_audit"; // entries fetched from the backend audit trail

export interface ActivityEvent {
  id: string;
  workspaceId: string;
  kind: ActivityEventKind;
  label: string;
  /** Optional link to a related resource (share token, contract id, etc.) */
  resourceRef?: string;
  /** "local" = recorded in-browser; "remote" = from backend audit trail */
  source: "local" | "remote";
  timestamp: number;
}

interface WorkspaceActivityState {
  events: ActivityEvent[];
  record: (workspaceId: string, kind: ActivityEventKind, label: string, resourceRef?: string) => void;
  /** Merge remote audit entries (deduplicates by id) */
  mergeRemote: (entries: ActivityEvent[]) => void;
  getTimeline: (workspaceId: string) => ActivityEvent[];
  clearForWorkspace: (workspaceId: string) => void;
}

export const useWorkspaceActivityStore = create<WorkspaceActivityState>()(
  persist(
    (set, get) => ({
      events: [],

      record: (workspaceId, kind, label, resourceRef) =>
        set((state) => ({
          events: [
            {
              id: crypto.randomUUID(),
              workspaceId,
              kind,
              label,
              resourceRef,
              source: "local",
              timestamp: Date.now(),
            },
            ...state.events,
          ],
        })),

      mergeRemote: (entries) =>
        set((state) => {
          const existingIds = new Set(state.events.map((e) => e.id));
          const newEntries = entries.filter((e) => !existingIds.has(e.id));
          if (newEntries.length === 0) return state;
          return {
            events: [...state.events, ...newEntries].sort((a, b) => b.timestamp - a.timestamp),
          };
        }),

      getTimeline: (workspaceId) =>
        get()
          .events.filter((e) => e.workspaceId === workspaceId)
          .sort((a, b) => b.timestamp - a.timestamp),

      clearForWorkspace: (workspaceId) =>
        set((state) => ({
          events: state.events.filter((e) => e.workspaceId !== workspaceId),
        })),
    }),
    {
      name: "soroban-workspace-activity",
      // Keep at most 500 events to avoid unbounded localStorage growth
      partialize: (state) => ({ events: state.events.slice(0, 500) }),
    },
  ),
);
