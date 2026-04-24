/**
 * SC-004: Client utilities for interacting with the on-chain source-registry contract.
 *
 * The source-registry contract maps a deployed contract address to a repository URL.
 * Calling register_source confirms the provenance link; get_source lets the UI
 * display verification status without requiring auth.
 */

import {
  Contract,
  TransactionBuilder,
  TimeoutInfinite,
  Address,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import { Server as SorobanServer } from "@stellar/stellar-sdk/rpc";
import { signTransaction } from "@stellar/freighter-api";

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
}

/**
 * Read the registered source URL for a contract from the source-registry.
 * Returns null if not registered or if the registry contract is unavailable.
 */
export async function getRegisteredSource(
  network: NetworkConfig,
  registryContractId: string,
  targetContractId: string,
): Promise<string | null> {
  try {
    const server = new SorobanServer(network.rpcUrl);
    const contract = new Contract(registryContractId);

    const tx = new TransactionBuilder(
      // Use a dummy account for simulation — no auth needed for get_source
      await server.getAccount("GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN"),
      { fee: "100", networkPassphrase: network.networkPassphrase },
    )
      .addOperation(
        contract.call(
          "get_source",
          new Address(targetContractId).toScVal(),
        ),
      )
      .setTimeout(TimeoutInfinite)
      .build();

    const simResult = await server.simulateTransaction(tx);
    if (!("result" in simResult) || !simResult.result) return null;

    const val = simResult.result.retval;
    // Option<String> — if it's a void/unit ScVal the contract returned None
    if (val.switch() === xdr.ScValType.scvVoid()) return null;

    // Unwrap Some(String)
    const inner = val.switch() === xdr.ScValType.scvLedgerKeyContractInstance()
      ? null
      : scValToNative(val);

    return typeof inner === "string" ? inner : null;
  } catch {
    return null;
  }
}

/**
 * Register a source URL for a deployed contract in the source-registry.
 * The caller must be the contract's controlling account (auth is required).
 */
export async function registerSource(
  network: NetworkConfig,
  registryContractId: string,
  signerAddress: string,
  targetContractId: string,
  repoUrl: string,
): Promise<boolean> {
  try {
    const server = new SorobanServer(network.rpcUrl);
    const contract = new Contract(registryContractId);
    const sourceAccount = await server.getAccount(signerAddress);

    const tx = new TransactionBuilder(sourceAccount, {
      fee: "10000",
      networkPassphrase: network.networkPassphrase,
    })
      .addOperation(
        contract.call(
          "register_source",
          new Address(targetContractId).toScVal(),
          nativeToScVal(repoUrl, { type: "string" }),
        ),
      )
      .setTimeout(TimeoutInfinite)
      .build();

    const preparedTx = await server.prepareTransaction(tx);
    const signedXdr = await signTransaction(preparedTx.toXDR(), {
      networkPassphrase: network.networkPassphrase,
    });

    const res = await server.sendTransaction(
      TransactionBuilder.fromXDR(signedXdr.signedTxXdr, network.networkPassphrase),
    );

    if (res.status !== "PENDING") return false;

    let attempts = 0;
    while (attempts < 10) {
      await new Promise((r) => setTimeout(r, 2000));
      const status = await server.getTransaction(res.hash);
      if (status.status === "SUCCESS") return true;
      if (status.status === "FAILED") return false;
      attempts++;
    }
    return false;
  } catch {
    return false;
  }
}
