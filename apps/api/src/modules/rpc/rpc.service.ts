import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  ServiceUnavailableException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { z } from "zod";

const networkSchema = z.enum(["mainnet", "testnet", "futurenet", "local"]);

const singleRpcRequestSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    method: z.string().trim().min(1),
    params: z.unknown().optional(),
    id: z.union([z.string(), z.number(), z.null()]).optional()
  })
  .passthrough();

const rpcRequestSchema = z.union([
  singleRpcRequestSchema,
  z.array(singleRpcRequestSchema).min(1)
]);

type RpcNetwork = z.infer<typeof networkSchema>;

export type ProxiedRpcResponse = {
  statusCode: number;
  contentType: string;
  body: unknown;
};

@Injectable()
export class RpcService {
  constructor(private readonly configService: ConfigService) {}

  private getRpcUrl(network: RpcNetwork) {
    const urls: Record<RpcNetwork, string | undefined> = {
      mainnet: this.configService.get<string>("SOROBAN_RPC_MAINNET_URL"),
      testnet: this.configService.get<string>("SOROBAN_RPC_TESTNET_URL"),
      futurenet: this.configService.get<string>("SOROBAN_RPC_FUTURENET_URL"),
      local: this.configService.get<string>("SOROBAN_RPC_LOCAL_URL")
    };

    return urls[network];
  }

  async proxy(network: string, payload: unknown): Promise<ProxiedRpcResponse> {
    const parsedNetwork = networkSchema.safeParse(network);
    if (!parsedNetwork.success) {
      throw new BadRequestException("Unsupported network");
    }

    const parsedPayload = rpcRequestSchema.safeParse(payload);
    if (!parsedPayload.success) {
      throw new BadRequestException({
        error: "Invalid JSON-RPC payload",
        details: parsedPayload.error.flatten()
      });
    }

    const rpcUrl = this.getRpcUrl(parsedNetwork.data);
    if (!rpcUrl) {
      throw new ServiceUnavailableException(
        `RPC URL is not configured for network '${parsedNetwork.data}'`
      );
    }

    try {
      const upstreamResponse = await fetch(rpcUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify(parsedPayload.data)
      });

      const rawBody = await upstreamResponse.text();
      const contentType =
        upstreamResponse.headers.get("content-type") ?? "text/plain";

      if (contentType.includes("application/json")) {
        try {
          return {
            statusCode: upstreamResponse.status,
            contentType,
            body: JSON.parse(rawBody)
          };
        } catch {
          return {
            statusCode: upstreamResponse.status,
            contentType: "text/plain",
            body: rawBody
          };
        }
      }

      return {
        statusCode: upstreamResponse.status,
        contentType,
        body: rawBody
      };
    } catch (error) {
      console.error("RPC proxy request failed", error);
      throw new BadGatewayException("Failed to proxy RPC request");
    }
  }
}
