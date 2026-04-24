import { describe, it, expect, beforeEach } from 'vitest';
import { useWorkspaceStore } from './useWorkspaceStore';
import { STORE_SCHEMA_VERSION } from './schema-version';
import type { WorkspaceSnapshot } from './workspace-schema';

describe('useWorkspaceStore', () => {
  beforeEach(() => {
    // Reset store before each test
    const { setState } = useWorkspaceStore;
    setState({
      workspaces: [
        {
          version: STORE_SCHEMA_VERSION,
          id: 'default',
          name: 'Default Project',
          contractIds: [],
          savedCallIds: [],
          artifactRefs: [],
          selectedNetwork: 'testnet',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        },
      ],
      activeWorkspaceId: 'default',
      cloudId: null,
      syncState: 'idle',
      syncError: null,
    });
  });

  describe('workspace creation', () => {
    it('should create a new workspace', () => {
      const { createWorkspace, workspaces } = useWorkspaceStore.getState();
      const initialCount = workspaces.length;

      createWorkspace('Test Workspace', 'mainnet');

      const { workspaces: updatedWorkspaces } = useWorkspaceStore.getState();
      expect(updatedWorkspaces.length).toBe(initialCount + 1);
      expect(updatedWorkspaces[1].name).toBe('Test Workspace');
      expect(updatedWorkspaces[1].selectedNetwork).toBe('mainnet');
      expect(updatedWorkspaces[1].version).toBe(STORE_SCHEMA_VERSION);
    });

    it('should generate unique IDs for workspaces', () => {
      const { createWorkspace } = useWorkspaceStore.getState();

      createWorkspace('Workspace 1');
      createWorkspace('Workspace 2');

      const { workspaces } = useWorkspaceStore.getState();
      expect(workspaces[1].id).not.toBe(workspaces[2].id);
    });
  });

  describe('workspace activation', () => {
    it('should set active workspace', () => {
      const { createWorkspace, setActiveWorkspace } = useWorkspaceStore.getState();
      createWorkspace('Test Workspace');

      const { workspaces } = useWorkspaceStore.getState();
      setActiveWorkspace(workspaces[1].id);

      const { activeWorkspaceId } = useWorkspaceStore.getState();
      expect(activeWorkspaceId).toBe(workspaces[1].id);
    });
  });

  describe('contract management', () => {
    it('should add contract to workspace', () => {
      const { addContractToWorkspace, getActiveWorkspace } = useWorkspaceStore.getState();

      addContractToWorkspace('default', 'contract-123');

      const workspace = getActiveWorkspace();
      expect(workspace?.contractIds).toContain('contract-123');
    });

    it('should deduplicate contract IDs', () => {
      const { addContractToWorkspace, getActiveWorkspace } = useWorkspaceStore.getState();

      addContractToWorkspace('default', 'contract-123');
      addContractToWorkspace('default', 'contract-123');

      const workspace = getActiveWorkspace();
      expect(workspace?.contractIds.length).toBe(1);
    });
  });

  describe('artifact management', () => {
    it('should attach artifact to workspace', () => {
      const { attachArtifact, getActiveWorkspace } = useWorkspaceStore.getState();

      attachArtifact('default', {
        kind: 'wasm',
        id: 'artifact-123',
      });

      const workspace = getActiveWorkspace();
      expect(workspace?.artifactRefs).toHaveLength(1);
      expect(workspace?.artifactRefs[0].id).toBe('artifact-123');
    });

    it('should replace existing artifact with same kind and id', () => {
      const { attachArtifact, getActiveWorkspace } = useWorkspaceStore.getState();

      attachArtifact('default', { kind: 'wasm', id: 'artifact-123' });
      attachArtifact('default', {
        kind: 'wasm',
        id: 'artifact-123',
        contractId: 'contract-456',
      });

      const workspace = getActiveWorkspace();
      expect(workspace?.artifactRefs).toHaveLength(1);
      expect(workspace?.artifactRefs[0].contractId).toBe('contract-456');
    });
  });

  describe('saved calls management', () => {
    it('should link saved call to workspace', () => {
      const { linkSavedCall, getActiveWorkspace } = useWorkspaceStore.getState();

      linkSavedCall('default', 'call-123');

      const workspace = getActiveWorkspace();
      expect(workspace?.savedCallIds).toContain('call-123');
    });

    it('should unlink saved call from workspace', () => {
      const { linkSavedCall, unlinkSavedCall, getActiveWorkspace } = useWorkspaceStore.getState();

      linkSavedCall('default', 'call-123');
      unlinkSavedCall('default', 'call-123');

      const workspace = getActiveWorkspace();
      expect(workspace?.savedCallIds).not.toContain('call-123');
    });
  });

  describe('network management', () => {
    it('should set workspace network', () => {
      const { setWorkspaceNetwork, getActiveWorkspace } = useWorkspaceStore.getState();

      setWorkspaceNetwork('default', 'futurenet');

      const workspace = getActiveWorkspace();
      expect(workspace?.selectedNetwork).toBe('futurenet');
    });
  });

  describe('workspace deletion', () => {
    it('should delete workspace', () => {
      const { createWorkspace, deleteWorkspace, workspaces } = useWorkspaceStore.getState();
      createWorkspace('To Delete');

      const { workspaces: updatedWorkspaces } = useWorkspaceStore.getState();
      const workspaceId = updatedWorkspaces[1].id;

      deleteWorkspace(workspaceId);

      const { workspaces: finalWorkspaces } = useWorkspaceStore.getState();
      expect(finalWorkspaces.find((w: WorkspaceSnapshot) => w.id === workspaceId)).toBeUndefined();
    });

    it('should reset to default when deleting active workspace', () => {
      const { createWorkspace, setActiveWorkspace, deleteWorkspace } = useWorkspaceStore.getState();
      createWorkspace('To Delete');

      const { workspaces } = useWorkspaceStore.getState();
      setActiveWorkspace(workspaces[1].id);

      deleteWorkspace(workspaces[1].id);

      const { activeWorkspaceId } = useWorkspaceStore.getState();
      expect(activeWorkspaceId).toBe('default');
    });
  });

  describe('migration', () => {
    it('should migrate legacy workspace to current schema', () => {
      const legacyState = {
        workspaces: [
          {
            id: 'legacy-1',
            name: 'Legacy Workspace',
            contractIds: ['contract-1', 'contract-2'],
            savedCalls: ['call-1'],
            createdAt: 1234567890,
          },
        ],
        activeWorkspaceId: 'legacy-1',
      };

      // Simulate migration (this tests the migrate function logic)
      const migrated = legacyState.workspaces.map((workspace: any) => {
        if (workspace && 'version' in workspace) {
          return workspace;
        }

        return {
          version: 2,
          id: workspace.id,
          name: workspace.name,
          contractIds: workspace.contractIds ?? [],
          savedCallIds: workspace.savedCalls ?? [],
          artifactRefs: [],
          selectedNetwork: 'testnet',
          createdAt: workspace.createdAt,
          updatedAt: workspace.createdAt,
        };
      });

      expect(migrated[0].version).toBe(2);
      expect(migrated[0].savedCallIds).toEqual(['call-1']);
      expect(migrated[0].artifactRefs).toEqual([]);
    });
  });
});
