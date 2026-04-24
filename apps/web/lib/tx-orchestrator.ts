/**
 * FE-040: Unified transaction orchestration service.
 *
 * Shared orchestration layer for simulation, signing handoff, submission,
 * polling, and result normalization across call, batch, and deploy flows.
 *
 * Can be tested independently of page components.
 */

import {
  TransactionBuilder,
  TimeoutInfinite,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import { Server as SorobanServer } from "@stellar/stellar-sdk/rpc";
import { signTransaction } from "@stellar/freighter-api";
import {
  normalizeSimulationResult,
  type NormalizedSimulationResult,
} from "@devconsole/soroban-utils";
import type { NetworkConfig } from "@/store/useNetworkStore";

export type TxStatus =
  | "idle"
  | "simulating"
  | "awaiting-signature"
  | "submitting"
  | "polling"
  | "success"
  | "error";

export interface TxResult {
  status: "success" | "error";
  hash?: string;
  simulation?: NormalizedSimulationResult;
  errorMessage?: string;
}

export interface OrchestrationOptions {
  /** Pre-built transaction XDR to sign and submit (skips simulation) */
  builtTxXdr?: string;
  /** If true, only simulate — do not submit */
  simulateOnly?: boolean;
  /** Max polling attempts before giving up (default: 20) */
  maxPollAttempts?: number;
  /** Polling interval in ms (default: 2000) */
  pollIntervalMs?: number;
}

export type StatusCallback = (status: TxStatus) => void;

/**
 * Simulate a prepared transaction and return normalized results.
 */
export async function simulateTx(
  txXdr: string,
  network: NetworkConfig,
): Promise<NormalizedSimulationResult> {
  const server = new SorobanServer(network.rpcUrl);
  const tx = TransactionBuilder.fromXDR(txXdr, network.networkPassphrase);
  const simResult = await server.simulateTransaction(tx);
  return normalizeSimulationResult(simResult);
}

/**
 * Prepare, sign, submit, and poll a transaction to completion.
 * Emits status updates via the optional callback.
 */
export async function orchestrateTx(
  txXdr: string,
  network: NetworkConfig,
  options: OrchestrationOptions = {},
  onStatus?: StatusCallback,
): Promise<TxResult> {
  const {
    simulateOnly = false,
    maxPollAttempts = 20,
    pollIntervalMs = 2000,
  } = options;

  const server = new SorobanServer(network.rpcUrl);

  try {
    // ── Simulate ──────────────────────────────────────────────────────────────
    onStatus?.("simulating");
    const tx = TransactionBuilder.fromXDR(txXdr, network.networkPassphrase);
    const simResult = await server.simulateTransaction(tx);
    const normalized = normalizeSimulationResult(simResult);

    if (simulateOnly) {
      return { status: "success", simulation: normalized };
    }

    if (SorobanRpc.Api.isSimulationError(simResult)) {
      return {
        status: "error",
        simulation: normalized,
        errorMessage: (simResult as SorobanRpc.Api.SimulateTransactionErrorResponse).error,
      };
    }

    // ── Prepare ───────────────────────────────────────────────────────────────
    const preparedTx = await server.prepareTransaction(tx);

    // ── Sign ──────────────────────────────────────────────────────────────────
    onStatus?.("awaiting-signature");
    const { signedTxXdr } = await signTransaction(preparedTx.toXDR(), {
      networkPassphrase: network.networkPassphrase,
    });

    // ── Submit ────────────────────────────────────────────────────────────────
    onStatus?.("submitting");
    const submitResult = await server.sendTransaction(
      TransactionBuilder.fromXDR(signedTxXdr, network.networkPassphrase),
    );

    if (submitResult.status !== "PENDING") {
      return {
        status: "error",
        errorMessage: `Submission failed with status: ${submitResult.status}`,
        simulation: normalized,
      };
    }

    // ── Poll ──────────────────────────────────────────────────────────────────
    onStatus?.("polling");
    for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, pollIntervalMs));
      const txStatus = await server.getTransaction(submitResult.hash);

      if (txStatus.status === "SUCCESS") {
        onStatus?.("success");
        return {
          status: "success",
          hash: submitResult.hash,
          simulation: normalized,
        };
      }

      if (txStatus.status === "FAILED") {
        return {
          status: "error",
          hash: submitResult.hash,
          errorMessage: "Transaction failed on-chain",
          simulation: normalized,
        };
      }
    }

    return {
      status: "error",
      hash: submitResult.hash,
      errorMessage: "Transaction polling timed out",
      simulation: normalized,
    };
  } catch (err) {
    onStatus?.("error");
    return {
      status: "error",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
