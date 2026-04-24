import { Module } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service.js";
import { DomainEventBus } from "../../lib/domain-event-bus.js";
import { AuditService } from "../../lib/audit.service.js";
import { WorkspacesController } from "./workspaces.controller.js";
import { WorkspacesService } from "./workspaces.service.js";
import { WorkspacesRepository } from "./workspaces.repository.js";

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository, PrismaService, DomainEventBus, AuditService],
  exports: [WorkspacesService, WorkspacesRepository, DomainEventBus, AuditService],
})
export class WorkspacesModule {}
