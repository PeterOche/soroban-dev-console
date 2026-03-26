import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useNetworkStore } from "./useNetworkStore";
import type {
  WorkspaceArtifactRef,
  WorkspaceSnapshot,
} from "./workspace-schema";

type LegacyWorkspace = {
  id: string;
  name: string;
  contractIds: string[];
  savedCalls?: string[];
  createdAt: number;
};

interface WorkspaceState {
  workspaces: WorkspaceSnapshot[];
  activeWorkspaceId: string;

  createWorkspace: (name: string, selectedNetwork?: string) => void;
  setActiveWorkspace: (id: string) => void;
  addContractToWorkspace: (workspaceId: string, contractId: string) => void;
  attachArtifact: (workspaceId: string, artifact: WorkspaceArtifactRef) => void;
  linkSavedCall: (workspaceId: string, savedCallId: string) => void;
  setWorkspaceNetwork: (workspaceId: string, networkId: string) => void;
  getActiveWorkspace: () => WorkspaceSnapshot | undefined;
  deleteWorkspace: (id: string) => void;
}

function createWorkspaceSnapshot(
  name: string,
  selectedNetwork = "testnet",
): WorkspaceSnapshot {
  const now = Date.now();

  return {
    version: 2,
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
  version: 2,
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
    }),
    {
      name: "soroban-workspaces",
      version: 2,
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
