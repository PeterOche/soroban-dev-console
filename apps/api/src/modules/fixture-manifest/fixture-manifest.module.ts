import { Module } from "@nestjs/common";
import { FixtureManifestController } from "./fixture-manifest.controller.js";
import { FixtureManifestService } from "./fixture-manifest.service.js";

@Module({
  controllers: [FixtureManifestController],
  providers: [FixtureManifestService],
  exports: [FixtureManifestService],
})
export class FixtureManifestModule {}
