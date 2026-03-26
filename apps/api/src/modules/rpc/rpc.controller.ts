import { Body, Controller, Param, Post, Res } from "@nestjs/common";
import type { Response } from "express";
import { RpcService } from "./rpc.service.js";

@Controller("rpc")
export class RpcController {
  constructor(private readonly rpcService: RpcService) {}

  @Post(":network")
  async proxyRpc(
    @Param("network") network: string,
    @Body() payload: unknown,
    @Res({ passthrough: true }) response: Response
  ) {
    const proxied = await this.rpcService.proxy(network, payload);

    response.status(proxied.statusCode);

    if (!proxied.contentType.includes("application/json")) {
      response.type(proxied.contentType);
    }

    return proxied.body;
  }
}
