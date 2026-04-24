import { Module } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service.js";
import { DomainEventBus } from "../../lib/domain-event-bus.js";
import { AuditService } from "../../lib/audit.service.js";
import { SharesController } from "./shares.controller.js";
import { SharesService } from "./shares.service.js";
import { SharesRepository } from "./shares.repository.js";
import { WorkspacesRepository } from "../workspaces/workspaces.repository.js";

@Module({
  controllers: [SharesController],
  providers: [SharesService, SharesRepository, WorkspacesRepository, PrismaService, DomainEventBus, AuditService],
  exports: [SharesService, SharesRepository],
})
export class SharesModule {}
