import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WorkspacesRepository } from "./workspaces.repository.js";
import { MapDbErrors } from "../../lib/db-error.mapper.js";
import { assertSupportedImportVersion, API_SNAPSHOT_VERSION } from "../../lib/schema-version.js";
import { DomainEventBus } from "../../lib/domain-event-bus.js";
import {
  WORKSPACE_CREATED,
  WORKSPACE_UPDATED,
  WORKSPACE_DELETED,
  WORKSPACE_IMPORTED,
  WORKSPACE_EXPORTED,
} from "../../lib/domain-events.js";
import { AuditService } from "../../lib/audit.service.js";
import type {
  CreateWorkspaceDto,
  ImportWorkspaceDto,
  ListWorkspacesDto,
  PaginatedResponse,
  UpdateWorkspaceDto,
} from "./workspace.dto.js";

@Injectable()
export class WorkspacesService {
  constructor(
    private readonly repository: WorkspacesRepository,
    private readonly events: DomainEventBus,
    private readonly audit: AuditService,
  ) {}

  @MapDbErrors()
  async list(ownerKey: string, query: ListWorkspacesDto = {}): Promise<PaginatedResponse<any>> {
    const skip = query.skip ?? 0;
    const take = query.take ?? 20;
    const sortBy = query.sortBy ?? "updatedAt";
    const sortOrder = query.sortOrder ?? "desc";

    const where = {
      ownerKey,
      ...(query.network ? { selectedNetwork: query.network } : {}),
    };

    const select = {
      id: true,
      name: true,
      description: true,
      selectedNetwork: true,
      createdAt: true,
      updatedAt: true,
    };

    const [data, total] = await Promise.all([
      this.repository.findMany({
        where,
        orderBy: { [sortBy]: sortOrder },
        select,
        skip,
        take,
      }),
      this.repository.count({ where }),
    ]);

    return { data, pagination: { total, skip, take } };
  }

  @MapDbErrors()
  async get(id: string, ownerKey: string) {
    const workspace = await this.repository.findFirst({
      where: { id, ownerKey },
      include: {
        savedContracts: true,
        savedInteractions: true,
        artifacts: true,
        shares: {
          select: {
            id: true,
            token: true,
            label: true,
            expiresAt: true,
            revokedAt: true,
            createdAt: true,
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    return workspace;
  }

  @MapDbErrors()
  async create(ownerKey: string, dto: CreateWorkspaceDto) {
    const network = dto.selectedNetwork ?? "testnet";
    const workspace = await this.repository.create({
      data: {
        ownerKey,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        selectedNetwork: network,
        savedContracts: dto.contracts
          ? {
              create: dto.contracts.map((c) => ({
                contractId: c.contractId,
                network: c.network || network,
              })),
            }
          : undefined,
        savedInteractions: dto.interactions
          ? {
              create: dto.interactions.map((i) => ({
                functionName: i.functionName,
                argumentsJson: i.argumentsJson || {},
                network: network,
              })),
            }
          : undefined,
      },
    });
    this.events.emit(WORKSPACE_CREATED, {
      workspaceId: workspace.id,
      ownerKey,
      name: workspace.name,
      selectedNetwork: workspace.selectedNetwork,
    });
    void this.audit.log({
      actor: ownerKey,
      action: "workspace.created",
      resourceType: "workspace",
      resourceId: workspace.id,
      summary: `Created workspace "${workspace.name}"`,
    });
    return workspace;
  }

  @MapDbErrors()
  async update(id: string, ownerKey: string, dto: UpdateWorkspaceDto) {
    const current = await this.get(id, ownerKey);

    // BE-006: Reject stale updates when the caller supplies a revision.
    if (dto.revision !== undefined && dto.revision !== (current as any).revision) {
      throw new ConflictException(
        `Workspace has been modified (expected revision ${dto.revision}, got ${(current as any).revision}). Reload and retry.`,
      );
    }

    const workspace = await this.repository.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.selectedNetwork !== undefined
          ? { selectedNetwork: dto.selectedNetwork }
          : {}),
        revision: { increment: 1 },
      },
    });
    this.events.emit(WORKSPACE_UPDATED, {
      workspaceId: id,
      ownerKey,
      changes: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.selectedNetwork !== undefined ? { selectedNetwork: dto.selectedNetwork } : {}),
      },
    });
    void this.audit.log({
      actor: ownerKey,
      action: "workspace.updated",
      resourceType: "workspace",
      resourceId: id,
      summary: `Updated workspace`,
      metadata: { changes: dto },
    });
    return workspace;
  }

  @MapDbErrors()
  async remove(id: string, ownerKey: string) {
    await this.get(id, ownerKey);
    await this.repository.delete({ where: { id } });
    this.events.emit(WORKSPACE_DELETED, { workspaceId: id, ownerKey });
    void this.audit.log({
      actor: ownerKey,
      action: "workspace.deleted",
      resourceType: "workspace",
      resourceId: id,
    });
  }

  @MapDbErrors()
  async import(ownerKey: string, dto: ImportWorkspaceDto) {
    try {
      assertSupportedImportVersion(dto.version);
    } catch (err: unknown) {
      throw new BadRequestException(
        err instanceof Error ? err.message : "Unsupported workspace version",
      );
    }

    const existing = await this.repository.findUnique({
      where: { id: dto.id },
    });
    if (existing) {
      throw new ConflictException(
        `A workspace with id "${dto.id}" already exists.`,
      );
    }

    const workspace = await this.repository.create({
      data: {
        id: dto.id,
        ownerKey,
        name: dto.name.trim(),
        description: null,
        selectedNetwork: dto.selectedNetwork,
        savedContracts: {
          create: dto.contractIds.map((contractId) => ({
            contractId,
            network: dto.selectedNetwork,
          })),
        },
        artifacts: {
          create: dto.artifactRefs.map((artifact) => ({
            kind: artifact.kind,
            name: artifact.id,
            network: dto.selectedNetwork,
            hash: artifact.kind === "wasm" ? artifact.id : null,
            metadata: { sourceId: artifact.id },
          })),
        },
      },
    });
    this.events.emit(WORKSPACE_IMPORTED, {
      workspaceId: workspace.id,
      ownerKey,
      version: dto.version,
    });
    void this.audit.log({
      actor: ownerKey,
      action: "workspace.imported",
      resourceType: "workspace",
      resourceId: workspace.id,
      summary: `Imported workspace "${workspace.name}"`,
      metadata: { version: dto.version },
    });
    return workspace;
  }

  @MapDbErrors()
  async export(id: string, ownerKey: string) {
    const workspace = await this.repository.findFirst({
      where: { id, ownerKey },
      include: {
        savedContracts: true,
        savedInteractions: true,
        artifacts: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException("Workspace not found");
    }

    const snapshot = {
      version: API_SNAPSHOT_VERSION,
      id: workspace.id,
      name: workspace.name,
      selectedNetwork: workspace.selectedNetwork,
      contractIds: workspace.savedContracts.map((contract) => contract.contractId),
      savedCallIds: workspace.savedInteractions.map((interaction) => interaction.id),
      artifactRefs: workspace.artifacts.map((artifact) => ({
        kind: artifact.kind,
        id: artifact.hash || artifact.name,
      })),
      createdAt: workspace.createdAt.getTime(),
      updatedAt: workspace.updatedAt.getTime(),
    };
    this.events.emit(WORKSPACE_EXPORTED, { workspaceId: id, ownerKey });
    void this.audit.log({
      actor: ownerKey,
      action: "workspace.exported",
      resourceType: "workspace",
      resourceId: id,
    });
    return snapshot;
  }
}
