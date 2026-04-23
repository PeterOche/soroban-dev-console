import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { WorkspacesRepository } from "./workspaces.repository.js";
import { MapDbErrors } from "../../lib/db-error.mapper.js";
import type {
  CreateWorkspaceDto,
  ImportWorkspaceDto,
  UpdateWorkspaceDto,
} from "./workspace.dto.js";

@Injectable()
export class WorkspacesService {
  constructor(private readonly repository: WorkspacesRepository) {}

  @MapDbErrors()
  list(ownerKey: string) {
    return this.repository.findMany({
      where: { ownerKey },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        description: true,
        selectedNetwork: true,
        createdAt: true,
        updatedAt: true,
      },
    });
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
  create(ownerKey: string, dto: CreateWorkspaceDto) {
    const network = dto.selectedNetwork ?? "testnet";
    return this.repository.create({
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
  }

  @MapDbErrors()
  async update(id: string, ownerKey: string, dto: UpdateWorkspaceDto) {
    await this.get(id, ownerKey);

    return this.repository.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description.trim() || null }
          : {}),
        ...(dto.selectedNetwork !== undefined
          ? { selectedNetwork: dto.selectedNetwork }
          : {}),
      },
    });
  }

  @MapDbErrors()
  async remove(id: string, ownerKey: string) {
    await this.get(id, ownerKey);
    await this.repository.delete({ where: { id } });
  }

  @MapDbErrors()
  async import(ownerKey: string, dto: ImportWorkspaceDto) {
    if (dto.version !== 2) {
      throw new BadRequestException(
        `Unsupported workspace version: ${dto.version}. Only version 2 is accepted.`,
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

    return this.repository.create({
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

    return {
      version: 2,
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
  }
}
