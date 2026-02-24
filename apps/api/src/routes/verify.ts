import { Address, rpc as SorobanRpc, xdr } from "@stellar/stellar-sdk";
import { Router } from "express";
import { z } from "zod";
import { buildRepoInDocker } from "../services/docker.service.js";

const verifyRouter = Router();

const networkSchema = z.enum(["mainnet", "testnet", "futurenet", "local"]);

const verifyPayloadSchema = z.object({
  repoUrl: z
    .string()
    .url()
    .refine((value) => {
      try {
        const parsed = new URL(value);
        const pathParts = parsed.pathname.split("/").filter(Boolean);
        const isGithubHost =
          parsed.hostname === "github.com" || parsed.hostname === "www.github.com";
        return isGithubHost && pathParts.length >= 2;
      } catch {
        return false;
      }
    }, "repoUrl must be a valid GitHub repository URL"),
  network: networkSchema,
  contractId: z
    .string()
    .trim()
    .regex(/^C[A-Z2-7]{55}$/, "contractId must be a valid Soroban contract ID")
});

function getRpcUrl(network: z.infer<typeof networkSchema>) {
  const networkRpcUrls = {
    mainnet: process.env.SOROBAN_RPC_MAINNET_URL,
    testnet: process.env.SOROBAN_RPC_TESTNET_URL,
    futurenet: process.env.SOROBAN_RPC_FUTURENET_URL,
    local: process.env.SOROBAN_RPC_LOCAL_URL
  };

  return networkRpcUrls[network];
}

async function getOnChainWasmHash(network: z.infer<typeof networkSchema>, contractId: string) {
  const rpcUrl = getRpcUrl(network);
  if (!rpcUrl) {
    throw new Error(`RPC URL is not configured for network '${network}'.`);
  }

  const server = new SorobanRpc.Server(rpcUrl, {
    allowHttp: rpcUrl.startsWith("http://")
  });

  const key = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: xdr.ScVal.scvLedgerKeyContractInstance(),
      durability: xdr.ContractDataDurability.persistent()
    })
  );

  const instanceEntry = await server.getLedgerEntry(key);
  const wasmHash = instanceEntry.val
    .contractData()
    .val()
    .instance()
    .executable()
    .wasmHash();

  if (!wasmHash) {
    throw new Error("No WASM hash found for this contract.");
  }

  return Buffer.from(wasmHash).toString("hex").toLowerCase();
}

verifyRouter.post("/", async (req, res) => {
  const parsedPayload = verifyPayloadSchema.safeParse(req.body);
  if (!parsedPayload.success) {
    res.status(400).json({
      error: "Invalid payload",
      details: parsedPayload.error.flatten()
    });
    return;
  }

  try {
    const onChainHash = await getOnChainWasmHash(
      parsedPayload.data.network,
      parsedPayload.data.contractId
    );

    const buildResult = await buildRepoInDocker(parsedPayload.data.repoUrl);
    const verified = buildResult.wasmHash.toLowerCase() === onChainHash;

    res.status(200).json({
      verified,
      network: parsedPayload.data.network,
      contract_id: parsedPayload.data.contractId,
      on_chain_wasm_hash: onChainHash,
      built_wasm_hash: buildResult.wasmHash
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Verification failed";

    if (/No WASM hash found|contract ID/i.test(message)) {
      res.status(404).json({
        error: message
      });
      return;
    }

    if (/Build completed but no \.wasm artifact|Docker|stellar contract build/i.test(message)) {
      res.status(422).json({
        error: message
      });
      return;
    }

    console.error("Verification failed", error);
    res.status(500).json({
      error: message
    });
  }
});

export { verifyRouter };
