import { Prisma } from "@prisma/client";
import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  GoneException,
} from "@nestjs/common";
import { SharesRepository } from "./shares.repository.js";
import { WorkspacesRepository } from "../workspaces/workspaces.repository.js";
import { MapDbErrors } from "../../lib/db-error.mapper.js";
import { DomainEventBus } from "../../lib/domain-event-bus.js";
import {
  SHARE_CREATED,
  SHARE_RESOLVED,
  SHARE_REVOKED,
} from "../../lib/domain-events.js";
import { AuditService } from "../../lib/audit.service.js";
import { randomBytes } from "crypto";

import { IsString, IsOptional, IsObject, IsInt, Min, IsIn } from "class-validator";
import { Type } from "class-transformer";

export class CreateShareDto {
  @IsString()
  workspaceId!: string;

  @IsOptional()
  @IsString()
  label?: string;

  @IsObject()
  snapshotJson!: Prisma.InputJsonValue;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}

/** BE-005: Pagination and filtering for share list */
export class ListSharesDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  skip?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  take?: number;

  @IsOptional()
  @IsIn(["createdAt", "expiresAt"])
  sortBy?: "createdAt" | "expiresAt";

  @IsOptional()
  @IsIn(["asc", "desc"])
  sortOrder?: "asc" | "desc";
}

/** BE-005: Pagination response envelope */
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    total: number;
    skip: number;
    take: number;
  };
}

/** Fields exposed by the public resolve endpoint — no internal IDs or ownerKey. */
interface PublicShareView {
  token: string;
  label: string | null;
  snapshotJson: Prisma.JsonValue;
  expiresAt: Date | null;
  createdAt: Date;
}

@Injectable()
export class SharesService {
  constructor(
    private readonly repository: SharesRepository,
    private readonly workspacesRepository: WorkspacesRepository,
    private readonly events: DomainEventBus,
    private readonly audit: AuditService,
  ) {}

  /** BE-003: create requires the caller to own the target workspace. */
  @MapDbErrors()
  async create(ownerKey: string, dto: CreateShareDto) {
    const workspace = await this.workspacesRepository.findUnique({
      where: { id: dto.workspaceId },
    });
    if (!workspace) throw new NotFoundException("Workspace not found");
    if (workspace.ownerKey !== ownerKey) {
      throw new ForbiddenException("You do not own this workspace");
    }

    const token = randomBytes(24).toString("base64url");

    const share = await this.repository.create({
      data: {
        workspaceId: dto.workspaceId,
        token,
        label: dto.label,
        snapshotJson: dto.snapshotJson,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
    this.events.emit(SHARE_CREATED, {
      shareId: share.id,
      workspaceId: dto.workspaceId,
      tokenHint: token.slice(0, 6) + "…",
    });
    void this.audit.log({
      actor: ownerKey,
      action: "share.created",
      resourceType: "share",
      resourceId: share.id,
      summary: `Created share for workspace ${dto.workspaceId}`,
      metadata: { workspaceId: dto.workspaceId, label: dto.label },
    });
    return share;
  }

  /**
   * BE-003: Public resolve — returns only snapshot data.
   * Internal fields (id, workspaceId) are not exposed.
   */
  @MapDbErrors()
  async resolve(token: string): Promise<PublicShareView> {
    const share = await this.repository.findUnique({ where: { token } });
    if (!share) throw new NotFoundException("Share link not found");

    if (share.revokedAt) {
      throw new ForbiddenException("Share link has been revoked");
    }
    if (share.expiresAt && share.expiresAt < new Date()) {
      throw new GoneException("Share link has expired");
    }

    this.events.emit(SHARE_RESOLVED, {
      shareId: share.id,
      workspaceId: share.workspaceId,
    });

    // BE-003: Return only the fields a public consumer needs.
    return {
      token: share.token,
      label: share.label,
      snapshotJson: share.snapshotJson,
      expiresAt: share.expiresAt,
      createdAt: share.createdAt,
    };
  }

  /** BE-003: revoke requires the caller to own the workspace the share belongs to. */
  @MapDbErrors()
  async revoke(token: string, ownerKey: string) {
    const share = await this.repository.findUnique({ where: { token } });
    if (!share) throw new NotFoundException("Share link not found");

    const workspace = await this.workspacesRepository.findUnique({
      where: { id: share.workspaceId },
    });
    if (!workspace || workspace.ownerKey !== ownerKey) {
      throw new ForbiddenException("You do not own this workspace");
    }

    // Idempotent — already revoked is fine.
    if (share.revokedAt) return share;

    const updated = await this.repository.update({
      where: { token },
      data: { revokedAt: new Date() },
    });
    this.events.emit(SHARE_REVOKED, {
      shareId: share.id,
      workspaceId: share.workspaceId,
    });
    void this.audit.log({
      actor: ownerKey,
      action: "share.revoked",
      resourceType: "share",
      resourceId: share.id,
      summary: `Revoked share for workspace ${share.workspaceId}`,
    });
    return updated;
  }

  @MapDbErrors()
  async listForWorkspace(
    workspaceId: string,
    ownerKey: string,
    query: ListSharesDto = {},
  ): Promise<PaginatedResponse<any>> {
    const workspace = await this.workspacesRepository.findUnique({
      where: { id: workspaceId },
    });
    if (!workspace) throw new NotFoundException("Workspace not found");
    if (workspace.ownerKey !== ownerKey) {
      throw new ForbiddenException("You do not own this workspace");
    }

    const skip = query.skip ?? 0;
    const take = query.take ?? 20;
    const sortBy = query.sortBy ?? "createdAt";
    const sortOrder = query.sortOrder ?? "desc";

    const where = { workspaceId };
    const select = {
      id: true,
      token: true,
      label: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
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
  async cleanup(): Promise<{ deleted: number }> {
    const deleted = await this.repository.deleteExpiredAndRevoked();
    return { deleted };
  }
}
