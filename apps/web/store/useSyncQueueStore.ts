/**
 * FE-038: Offline-first sync queue for workspace mutations and retries.
 *
 * Queues workspace mutations when offline or during transient API failures.
 * Retries preserve ordering and avoid duplicate mutations.
 * Pending sync state is persisted and survives reloads.
 */

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CreateWorkspacePayload, UpdateWorkspacePayload } from "@devconsole/api-contracts";
import { workspacesApi } from "@/lib/api/workspaces";

export type MutationKind = "create" | "update" | "delete";

export interface QueuedMutation {
  id: string;
  kind: MutationKind;
  localId: string;
  cloudId?: string;
  payload?: CreateWorkspacePayload | UpdateWorkspacePayload;
  enqueuedAt: number;
  attempts: number;
  lastError?: string;
}

export type FlushStatus = "idle" | "flushing" | "error";

interface SyncQueueState {
  queue: QueuedMutation[];
  flushStatus: FlushStatus;

  enqueue: (mutation: Omit<QueuedMutation, "id" | "enqueuedAt" | "attempts">) => void;
  /** Remove a mutation by id (e.g. after successful flush) */
  dequeue: (id: string) => void;
  /** Flush all pending mutations in order; stops on first unrecoverable error */
  flush: (onCloudIdResolved?: (localId: string, cloudId: string) => void) => Promise<void>;
  clearQueue: () => void;
  pendingCount: () => number;
}

const MAX_ATTEMPTS = 5;

export const useSyncQueueStore = create<SyncQueueState>()(
  persist(
    (set, get) => ({
      queue: [],
      flushStatus: "idle",

      enqueue: (mutation) => {
        const id = crypto.randomUUID();
        set((state) => ({
          queue: [
            ...state.queue,
            { ...mutation, id, enqueuedAt: Date.now(), attempts: 0 },
          ],
        }));
      },

      dequeue: (id) =>
        set((state) => ({ queue: state.queue.filter((m) => m.id !== id) })),

      flush: async (onCloudIdResolved) => {
        const { queue } = get();
        if (queue.length === 0) return;

        set({ flushStatus: "flushing" });

        for (const mutation of [...queue]) {
          // Skip if already exceeded retry limit
          if (mutation.attempts >= MAX_ATTEMPTS) continue;

          try {
            if (mutation.kind === "create" && mutation.payload) {
              const remote = await workspacesApi.create(
                mutation.payload as CreateWorkspacePayload,
              );
              onCloudIdResolved?.(mutation.localId, remote.id);
              get().dequeue(mutation.id);
            } else if (mutation.kind === "update" && mutation.cloudId && mutation.payload) {
              await workspacesApi.update(
                mutation.cloudId,
                mutation.payload as UpdateWorkspacePayload,
              );
              get().dequeue(mutation.id);
            } else if (mutation.kind === "delete" && mutation.cloudId) {
              await workspacesApi.remove(mutation.cloudId);
              get().dequeue(mutation.id);
            }
          } catch (err) {
            const msg = err instanceof Error ? err.message : "Unknown error";
            set((state) => ({
              queue: state.queue.map((m) =>
                m.id === mutation.id
                  ? { ...m, attempts: m.attempts + 1, lastError: msg }
                  : m,
              ),
            }));
            // Stop flushing on network-level errors to preserve ordering
            set({ flushStatus: "error" });
            return;
          }
        }

        set({ flushStatus: "idle" });
      },

      clearQueue: () => set({ queue: [], flushStatus: "idle" }),

      pendingCount: () => get().queue.length,
    }),
    {
      name: "soroban-sync-queue",
      // Only persist the queue itself, not transient flush status
      partialize: (state) => ({ queue: state.queue }),
    },
  ),
);
