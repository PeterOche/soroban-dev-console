import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useNetworkStore } from "./useNetworkStore";
import type {
  WorkspaceArtifactRef,
  WorkspaceCheckpoint,
  WorkspaceSnapshot,
} from "./workspace-schema";
import { STORE_SCHEMA_VERSION } from "./schema-version";
import { workspacesApi } from "@/lib/api/workspaces";
import { useSyncQueueStore } from "./useSyncQueueStore";
import type { CreateWorkspacePayload, UpdateWorkspacePayload } from "@devconsole/api-contracts";
import type { WorkspaceTemplate } from "@/lib/fixture-manifest";

type LegacyWorkspace = {
  id: string;
  name: string;
  contractIds: string[];
  savedCalls?: string[];
  createdAt: number;
};

export type SyncState = "idle" | "syncing" | "error" | "conflict";

/** FE-029: Describes a single field-level difference between local and remote workspace. */
export interface WorkspaceDiff {
  field: keyof WorkspaceSnapshot;
  local: unknown;
  remote: unknown;
}

/** FE-029: Result of a conflict check between local and remote workspace state. */
export interface ConflictResult {
  hasConflict: boolean;
  diffs: WorkspaceDiff[];
  localRevision: number;
  remoteRevision: number;
}

/** FE-029: Strategy for resolving a detected conflict. */
export type MergeStrategy = "keep-local" | "keep-remote" | "merge-additive";

interface WorkspaceState {
  workspaces: WorkspaceSnapshot[];
  activeWorkspaceId: string;
  /** cloud record id for the active workspace, if synced */
  cloudId: string | null;
  syncState: SyncState;
  syncError: string | null;
  /** FE-031: Named checkpoints keyed by workspaceId */
  checkpoints: Record<string, WorkspaceCheckpoint[]>;
  /** FE-029: Pending conflict data awaiting user resolution */
  pendingConflict: (ConflictResult & { remoteSnapshot: WorkspaceSnapshot }) | null;

  createWorkspace: (name: string, selectedNetwork?: string) => void;
  /** FE-032: Create a workspace pre-populated from a template */
  createWorkspaceFromTemplate: (template: WorkspaceTemplate, selectedNetwork?: string) => void;
  setActiveWorkspace: (id: string) => void;
  addContractToWorkspace: (workspaceId: string, contractId: string) => void;
  attachArtifact: (workspaceId: string, artifact: WorkspaceArtifactRef) => void;
  linkSavedCall: (workspaceId: string, savedCallId: string) => void;
  unlinkSavedCall: (workspaceId: string, savedCallId: string) => void;
  setWorkspaceNetwork: (workspaceId: string, networkId: string) => void;
  getActiveWorkspace: () => WorkspaceSnapshot | undefined;
  deleteWorkspace: (id: string) => void;
  /** Push the active workspace to the cloud API */
  syncToCloud: (payload: CreateWorkspacePayload) => Promise<string | null>;
  /** Load a workspace from the cloud by its cloud ID */
  loadFromCloud: (cloudId: string) => Promise<boolean>;
  /** Push local changes for an already-synced workspace */
  pushToCloud: (localId: string, cloudId: string, payload: UpdateWorkspacePayload) => Promise<boolean>;
  /** Delete a workspace from the cloud */
  removeFromCloud: (cloudId: string) => Promise<boolean>;
  /** Clear any sync error */
  clearSyncError: () => void;
  /** FE-031: Save a named checkpoint for a workspace */
  saveCheckpoint: (workspaceId: string, label: string) => WorkspaceCheckpoint | null;
  /** FE-031: Restore a workspace to a previously saved checkpoint */
  restoreCheckpoint: (checkpointId: string, workspaceId: string) => boolean;
  /** FE-031: Delete a checkpoint */
  deleteCheckpoint: (checkpointId: string, workspaceId: string) => void;
  /** FE-031: Get all checkpoints for a workspace */
  getCheckpoints: (workspaceId: string) => WorkspaceCheckpoint[];
  /** FE-029: Detect conflicts between local workspace and a remote snapshot */
  detectConflict: (localId: string, remote: WorkspaceSnapshot, remoteRevision: number, localRevision: number) => ConflictResult;
  /** FE-029: Resolve a pending conflict using the chosen strategy */
  resolveConflict: (strategy: MergeStrategy) => void;
  /** FE-029: Dismiss the pending conflict without resolving */
  dismissConflict: () => void;
}

function createWorkspaceSnapshot(
  name: string,
  selectedNetwork = "testnet",
): WorkspaceSnapshot {
  const now = Date.now();
  return {
    version: STORE_SCHEMA_VERSION,
    id: crypto.randomUUID(),
    name,
    contractIds: [],
    savedCallIds: [],
    artifactRefs: [],
    selectedNetwork,
    createdAt: now,
    updatedAt: now,
  };
}

const defaultWorkspace: WorkspaceSnapshot = {
  version: STORE_SCHEMA_VERSION,
  id: "default",
  name: "Default Project",
  contractIds: [],
  savedCallIds: [],
  artifactRefs: [],
  selectedNetwork: "testnet",
  createdAt: Date.now(),
  updatedAt: Date.now(),
};

/** FE-029: Compare two workspace snapshots and return field-level diffs. */
function diffWorkspaces(local: WorkspaceSnapshot, remote: WorkspaceSnapshot): WorkspaceDiff[] {
  const fields: (keyof WorkspaceSnapshot)[] = [
    "name",
    "selectedNetwork",
    "contractIds",
    "savedCallIds",
    "artifactRefs",
  ];
  const diffs: WorkspaceDiff[] = [];
  for (const field of fields) {
    const localVal = local[field];
    const remoteVal = remote[field];
    if (JSON.stringify(localVal) !== JSON.stringify(remoteVal)) {
      diffs.push({ field, local: localVal, remote: remoteVal });
    }
  }
  return diffs;
}

/** FE-029: Merge two snapshots additively (union of arrays, remote wins on scalars). */
function mergeAdditive(local: WorkspaceSnapshot, remote: WorkspaceSnapshot): WorkspaceSnapshot {
  return {
    ...remote,
    contractIds: [...new Set([...local.contractIds, ...remote.contractIds])],
    savedCallIds: [...new Set([...local.savedCallIds, ...remote.savedCallIds])],
    artifactRefs: [
      ...remote.artifactRefs,
      ...local.artifactRefs.filter(
        (la) => !remote.artifactRefs.some((ra) => ra.kind === la.kind && ra.id === la.id),
      ),
    ],
    updatedAt: Date.now(),
  };
}

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [defaultWorkspace],
      activeWorkspaceId: defaultWorkspace.id,
      cloudId: null,
      syncState: "idle" as const,
      syncError: null,
      checkpoints: {},
      pendingConflict: null,

      createWorkspace: (name, selectedNetwork = useNetworkStore.getState().currentNetwork) =>
        set((state) => ({
          workspaces: [
            ...state.workspaces,
            createWorkspaceSnapshot(name, selectedNetwork),
          ],
        })),

      // FE-032: Create workspace from a template
      createWorkspaceFromTemplate: (template, selectedNetwork = useNetworkStore.getState().currentNetwork) => {
        const now = Date.now();
        const snapshot: WorkspaceSnapshot = {
          version: STORE_SCHEMA_VERSION,
          id: crypto.randomUUID(),
          name: template.name,
          contractIds: template.contractIds ?? [],
          savedCallIds: template.savedCallIds ?? [],
          artifactRefs: template.artifactRefs ?? [],
          selectedNetwork: template.defaultNetwork ?? selectedNetwork,
          createdAt: now,
          updatedAt: now,
        };
        set((state) => ({ workspaces: [...state.workspaces, snapshot] }));
      },

      setActiveWorkspace: (id) => {
        const target = get().workspaces.find((workspace) => workspace.id === id);
        if (target) {
          useNetworkStore.getState().setNetwork(target.selectedNetwork);
        }
        set({ activeWorkspaceId: id });
      },

      addContractToWorkspace: (workspaceId, contractId) =>
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? {
                  ...w,
                  contractIds: [...new Set([...w.contractIds, contractId])],
                  updatedAt: Date.now(),
                }
              : w,
          ),
        })),

      attachArtifact: (workspaceId, artifact) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  artifactRefs: [
                    ...workspace.artifactRefs.filter(
                      (entry) =>
                        !(entry.kind === artifact.kind && entry.id === artifact.id),
                    ),
                    artifact,
                  ],
                  updatedAt: Date.now(),
                }
              : workspace,
          ),
        })),

      linkSavedCall: (workspaceId, savedCallId) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  savedCallIds: [
                    ...new Set([...workspace.savedCallIds, savedCallId]),
                  ],
                  updatedAt: Date.now(),
                }
              : workspace,
          ),
        })),

      unlinkSavedCall: (workspaceId, savedCallId) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  savedCallIds: workspace.savedCallIds.filter(
                    (id) => id !== savedCallId,
                  ),
                  updatedAt: Date.now(),
                }
              : workspace,
          ),
        })),

      setWorkspaceNetwork: (workspaceId, networkId) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  selectedNetwork: networkId,
                  updatedAt: Date.now(),
                }
              : workspace,
          ),
        })),

      getActiveWorkspace: () =>
        get().workspaces.find(
          (workspace) => workspace.id === get().activeWorkspaceId,
        ),

      deleteWorkspace: (id) =>
        set((state) => ({
          workspaces: state.workspaces.filter((w) => w.id !== id),
          activeWorkspaceId:
            state.activeWorkspaceId === id
              ? "default"
              : state.activeWorkspaceId,
        })),

      // ── FE-031: Checkpoints ──────────────────────────────────────────────────

      saveCheckpoint: (workspaceId, label) => {
        const workspace = get().workspaces.find((w) => w.id === workspaceId);
        if (!workspace) return null;
        const checkpoint: WorkspaceCheckpoint = {
          id: crypto.randomUUID(),
          workspaceId,
          label,
          snapshot: { ...workspace },
          createdAt: Date.now(),
        };
        set((state) => ({
          checkpoints: {
            ...state.checkpoints,
            [workspaceId]: [...(state.checkpoints[workspaceId] ?? []), checkpoint],
          },
        }));
        return checkpoint;
      },

      restoreCheckpoint: (checkpointId, workspaceId) => {
        const checkpoints = get().checkpoints[workspaceId] ?? [];
        const cp = checkpoints.find((c) => c.id === checkpointId);
        if (!cp) return false;
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === workspaceId
              ? { ...cp.snapshot, updatedAt: Date.now() }
              : w,
          ),
        }));
        return true;
      },

      deleteCheckpoint: (checkpointId, workspaceId) =>
        set((state) => ({
          checkpoints: {
            ...state.checkpoints,
            [workspaceId]: (state.checkpoints[workspaceId] ?? []).filter(
              (c) => c.id !== checkpointId,
            ),
          },
        })),

      getCheckpoints: (workspaceId) =>
        get().checkpoints[workspaceId] ?? [],

      // ── FE-029: Conflict detection & merge ──────────────────────────────────

      detectConflict: (localId, remote, remoteRevision, localRevision) => {
        const local = get().workspaces.find((w) => w.id === localId);
        if (!local) {
          return { hasConflict: false, diffs: [], localRevision, remoteRevision };
        }
        const diffs = diffWorkspaces(local, remote);
        const hasConflict = diffs.length > 0 && remoteRevision !== localRevision;
        if (hasConflict) {
          set({ pendingConflict: { hasConflict, diffs, localRevision, remoteRevision, remoteSnapshot: remote } });
        }
        return { hasConflict, diffs, localRevision, remoteRevision };
      },

      resolveConflict: (strategy) => {
        const { pendingConflict, activeWorkspaceId } = get();
        if (!pendingConflict) return;
        const local = get().workspaces.find((w) => w.id === activeWorkspaceId);
        if (!local) {
          set({ pendingConflict: null, syncState: "idle" });
          return;
        }
        let resolved: WorkspaceSnapshot;
        switch (strategy) {
          case "keep-local":
            resolved = { ...local, updatedAt: Date.now() };
            break;
          case "keep-remote":
            resolved = { ...pendingConflict.remoteSnapshot, updatedAt: Date.now() };
            break;
          case "merge-additive":
            resolved = mergeAdditive(local, pendingConflict.remoteSnapshot);
            break;
        }
        set((state) => ({
          workspaces: state.workspaces.map((w) =>
            w.id === activeWorkspaceId ? resolved : w,
          ),
          pendingConflict: null,
          syncState: "idle",
          syncError: null,
        }));
      },

      dismissConflict: () => set({ pendingConflict: null, syncState: "idle" }),

      // ── Cloud sync ──────────────────────────────────────────────────────────

      syncToCloud: async (payload) => {
        set({ syncState: "syncing", syncError: null });
        try {
          const remote = await workspacesApi.create(payload);
          set({ cloudId: remote.id, syncState: "idle" });
          return remote.id;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Sync failed";
          // FE-038: queue the mutation for retry when offline/transient failure
          const activeId = get().activeWorkspaceId;
          useSyncQueueStore.getState().enqueue({
            kind: "create",
            localId: activeId,
            payload,
          });
          set({ syncState: "error", syncError: msg });
          return null;
        }
      },

      loadFromCloud: async (cloudId) => {
        set({ syncState: "syncing", syncError: null });
        try {
          const remote = await workspacesApi.get(cloudId);
          const snapshot: WorkspaceSnapshot = {
            version: STORE_SCHEMA_VERSION,
            id: remote.id,
            name: remote.name,
            contractIds: (remote as any).savedContracts?.map((c: any) => c.contractId) ?? [],
            savedCallIds: (remote as any).savedInteractions?.map((i: any) => i.id) ?? [],
            artifactRefs: (remote as any).artifacts?.map((a: any) => ({ kind: a.kind, id: a.hash ?? a.name })) ?? [],
            selectedNetwork: remote.selectedNetwork ?? "testnet",
            createdAt: new Date(remote.createdAt).getTime(),
            updatedAt: new Date(remote.updatedAt).getTime(),
          };
          set((state) => {
            const exists = state.workspaces.some((w) => w.id === snapshot.id);
            return {
              workspaces: exists
                ? state.workspaces.map((w) => (w.id === snapshot.id ? snapshot : w))
                : [...state.workspaces, snapshot],
              cloudId,
              syncState: "idle",
            };
          });
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Load failed";
          set({ syncState: "error", syncError: msg });
          return false;
        }
      },

      pushToCloud: async (localId, cloudId, payload) => {
        set({ syncState: "syncing", syncError: null });
        try {
          await workspacesApi.update(cloudId, payload);
          set((state) => ({
            workspaces: state.workspaces.map((w) =>
              w.id === localId ? { ...w, updatedAt: Date.now() } : w,
            ),
            syncState: "idle",
          }));
          return true;
        } catch (err) {
          const isConflict = err instanceof Error && err.message.includes("revision");
          const msg = err instanceof Error ? err.message : "Push failed";
          // FE-038: queue the update mutation for retry
          if (!isConflict) {
            useSyncQueueStore.getState().enqueue({
              kind: "update",
              localId,
              cloudId,
              payload,
            });
          }
          set({ syncState: isConflict ? "conflict" : "error", syncError: msg });
          return false;
        }
      },

      removeFromCloud: async (cloudId) => {
        set({ syncState: "syncing", syncError: null });
        try {
          await workspacesApi.remove(cloudId);
          set({ cloudId: null, syncState: "idle" });
          return true;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Remove failed";
          set({ syncState: "error", syncError: msg });
          return false;
        }
      },

      clearSyncError: () => set({ syncError: null, syncState: "idle" }),
    }),
    {
      name: "soroban-workspaces",
      version: STORE_SCHEMA_VERSION,
      migrate: (persistedState) => {
        const state = persistedState as
          | {
              workspaces?: Array<LegacyWorkspace | WorkspaceSnapshot>;
              activeWorkspaceId?: string;
            }
          | undefined;

        const workspaces =
          state?.workspaces?.map((workspace) => {
            if (workspace && "version" in workspace) {
              return workspace as WorkspaceSnapshot;
            }
            const legacy = workspace as LegacyWorkspace;
            return {
              version: 2,
              id: legacy.id,
              name: legacy.name,
              contractIds: legacy.contractIds ?? [],
              savedCallIds: legacy.savedCalls ?? [],
              artifactRefs: [],
              selectedNetwork: "testnet",
              createdAt: legacy.createdAt,
              updatedAt: legacy.createdAt,
            } satisfies WorkspaceSnapshot;
          }) ?? [defaultWorkspace];

        return {
          workspaces,
          activeWorkspaceId:
            state?.activeWorkspaceId &&
            workspaces.some((workspace) => workspace.id === state.activeWorkspaceId)
              ? state.activeWorkspaceId
              : workspaces[0]?.id ?? defaultWorkspace.id,
        };
      },
    },
  ),
);
