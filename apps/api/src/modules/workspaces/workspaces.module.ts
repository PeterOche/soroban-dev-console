import { Module } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service.js";
import { WorkspacesController } from "./workspaces.controller.js";
import { WorkspacesService } from "./workspaces.service.js";
import { WorkspacesRepository } from "./workspaces.repository.js";

@Module({
  controllers: [WorkspacesController],
  providers: [WorkspacesService, WorkspacesRepository, PrismaService],
  exports: [WorkspacesService, WorkspacesRepository],
})
export class WorkspacesModule {}
