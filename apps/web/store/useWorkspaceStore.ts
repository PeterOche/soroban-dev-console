import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useNetworkStore } from "./useNetworkStore";
import type {
  WorkspaceArtifactRef,
  WorkspaceSnapshot,
} from "./workspace-schema";
import { STORE_SCHEMA_VERSION } from "./schema-version";
import { workspacesApi } from "@/lib/api/workspaces";
import type { CreateWorkspacePayload, UpdateWorkspacePayload } from "@devconsole/api-contracts";

type LegacyWorkspace = {
  id: string;
  name: string;
  contractIds: string[];
  savedCalls?: string[];
  createdAt: number;
};

export type SyncState = "idle" | "syncing" | "error" | "conflict";

interface WorkspaceState {
  workspaces: WorkspaceSnapshot[];
  activeWorkspaceId: string;
  /** cloud record id for the active workspace, if synced */
  cloudId: string | null;
  syncState: SyncState;
  syncError: string | null;

  createWorkspace: (name: string, selectedNetwork?: string) => void;
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

export const useWorkspaceStore = create<WorkspaceState>()(
  persist(
    (set, get) => ({
      workspaces: [defaultWorkspace],
      activeWorkspaceId: defaultWorkspace.id,
      cloudId: null,
      syncState: "idle" as const,
      syncError: null,

      createWorkspace: (name, selectedNetwork = useNetworkStore.getState().currentNetwork) =>
        set((state) => ({
          workspaces: [
            ...state.workspaces,
            createWorkspaceSnapshot(name, selectedNetwork),
          ],
        })),

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

      syncToCloud: async (payload) => {
        set({ syncState: "syncing", syncError: null });
        try {
          const remote = await workspacesApi.create(payload);
          set({ cloudId: remote.id, syncState: "idle" });
          return remote.id;
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Sync failed";
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
