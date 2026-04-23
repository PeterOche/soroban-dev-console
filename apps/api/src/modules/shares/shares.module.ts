import { Module } from "@nestjs/common";
import { PrismaService } from "../../lib/prisma.service.js";
import { SharesController } from "./shares.controller.js";
import { SharesService } from "./shares.service.js";
import { SharesRepository } from "./shares.repository.js";

@Module({
  controllers: [SharesController],
  providers: [SharesService, SharesRepository, PrismaService],
  exports: [SharesService, SharesRepository],
})
export class SharesModule {}
