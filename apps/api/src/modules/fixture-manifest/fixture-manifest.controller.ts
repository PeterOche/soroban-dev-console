import { Controller, Get } from "@nestjs/common";
import { FixtureManifestService } from "./fixture-manifest.service.js";

@Controller("fixture-manifest")
export class FixtureManifestController {
  constructor(private readonly service: FixtureManifestService) {}

  @Get()
  get() {
    return this.service.getManifest();
  }
}
