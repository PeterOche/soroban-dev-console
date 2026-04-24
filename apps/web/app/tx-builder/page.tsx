"use client";

import {
  Contract,
  TimeoutInfinite,
  TransactionBuilder,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import { Server as SorobanServer } from "@stellar/stellar-sdk/rpc";
import { Loader2, Send, Terminal } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { orchestrateTx, simulateTx, type TxStatus } from "@/lib/tx-orchestrator";

import { MultiOpCart } from "@/components/multi-op-cart";
import {
  convertToScVal,
  type NormalizedSimulationResult,
} from "@devconsole/soroban-utils";
import { useNetworkStore } from "@/store/useNetworkStore";
import { SavedCall, useSavedCallsStore } from "@/store/useSavedCallsStore";
import { useWallet } from "@/store/useWallet";
import { Badge } from "@devconsole/ui";
import { Button } from "@devconsole/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@devconsole/ui";

type SimulationSummary = {
  operationCount: number;
  details: NormalizedSimulationResult;
};

function formatStroops(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat("en-US").format(parsed) : value;
}

function shortKeyBase64(change: NormalizedSimulationResult["stateChanges"][number]) {
  try {
    return change.key.toXDR("base64").slice(0, 24);
  } catch {
    return "unavailable";
  }
}

export default function TxBuilderPage() {
  const { savedCalls, cartItems, addToCart, removeFromCart, moveCartItem, clearCart } =
    useSavedCallsStore();
  const { getActiveNetworkConfig, currentNetwork } = useNetworkStore();
  const { isConnected, address } = useWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<SimulationSummary | null>(null);

  const networkCalls = useMemo(
    () => savedCalls.filter((call) => call.network === currentNetwork),
    [savedCalls, currentNetwork],
  );

  const resetSimulation = () => {
    setSimulation(null);
    setResult(null);
  };

  const onAddCall = (call: SavedCall) => {
    addToCart(call);
    resetSimulation();
  };

  const onRemoveItem = (cartItemId: string) => {
    removeFromCart(cartItemId);
    resetSimulation();
  };

  const onMoveItem = (cartItemId: string, direction: "up" | "down") => {
    moveCartItem(cartItemId, direction);
    resetSimulation();
  };

  const onClear = () => {
    clearCart();
    resetSimulation();
  };

  const buildOperations = () =>
    cartItems.map((item) => {
      const contract = new Contract(item.contractId);
      const scArgs = item.args.map((arg) => convertToScVal(arg.type, arg.value));
      return contract.call(item.fnName, ...scArgs);
    });

  /** Build a raw transaction XDR from the current cart items. */
  const buildTxXdr = async (source: string): Promise<string> => {
    const network = getActiveNetworkConfig();
    const server = new SorobanServer(network.rpcUrl);
    const operations = buildOperations();

    const account = await server.getAccount(source).catch(() => null);
    const sequence = account ? account.sequenceNumber() : "0";

    const txBuilder = new TransactionBuilder(
      {
        accountId: () => source,
        sequenceNumber: () => sequence,
        incrementSequenceNumber: () => {},
      },
      { fee: "100", networkPassphrase: network.networkPassphrase },
    );
    operations.forEach((op) => txBuilder.addOperation(op));
    return txBuilder.setTimeout(TimeoutInfinite).build().toXDR();
  };

  const handleSimulate = async () => {
    if (cartItems.length < 2) {
      toast.error("Add at least two calls to build a multi-operation transaction.");
      return;
    }
    if (cartItems.some((item) => item.network !== currentNetwork)) {
      toast.error("All operations must match the currently selected network.");
      return;
    }

    setIsLoading(true);
    setResult(null);
    setSimulation(null);

    try {
      const network = getActiveNetworkConfig();
      const source =
        address || "GBZXN7PIRZGNMHGA7MUUUFFAUYVSF74BWXME4R37P2N6F5N4AUM5546F";
      const txXdr = await buildTxXdr(source);
      // FE-040: use shared orchestration layer for simulation
      const normalized = await simulateTx(txXdr, network);
      if (!normalized.ok) throw new Error(normalized.error || "Unknown simulation error");

      setSimulation({ operationCount: cartItems.length, details: normalized });
      setResult("Simulation success for batched transaction.");
      toast.success("Simulation success");
    } catch (error: any) {
      setSimulation(null);
      setResult(`Simulation failed: ${error.message}`);
      toast.error(`Simulation failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!isConnected || !address) {
      toast.error("Connect wallet to sign and submit.");
      return;
    }
    if (cartItems.length < 2) {
      toast.error("Add at least two calls to submit a multi-operation transaction.");
      return;
    }
    if (cartItems.some((item) => item.network !== currentNetwork)) {
      toast.error("All operations must match the currently selected network.");
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const network = getActiveNetworkConfig();
      const server = new SorobanServer(network.rpcUrl);
      const sourceAccount = await server.getAccount(address);
      const txBuilder = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: network.networkPassphrase,
      });
      buildOperations().forEach((op) => txBuilder.addOperation(op));
      const txXdr = txBuilder.setTimeout(TimeoutInfinite).build().toXDR();

      // FE-040: use shared orchestration layer for sign + submit + poll
      const txResult = await orchestrateTx(txXdr, network, {}, (status: TxStatus) => {
        if (status === "awaiting-signature") toast.info("Awaiting wallet signature…");
        if (status === "submitting") toast.info("Submitting transaction…");
        if (status === "polling") toast.info("Waiting for confirmation…");
      });

      if (txResult.simulation) {
        setSimulation({ operationCount: cartItems.length, details: txResult.simulation });
      }

      if (txResult.status === "success") {
        setResult(`Transaction submitted. Hash: ${txResult.hash}`);
        toast.success("Multi-operation transaction submitted.");
      } else {
        throw new Error(txResult.errorMessage ?? "Transaction failed");
      }
    } catch (error: any) {
      setResult(`Submission failed: ${error.message}`);
      toast.error(`Submission failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Multi-Operation Builder</h1>
        <p className="text-muted-foreground">
          Batch saved contract calls into one atomic transaction. Cart is saved locally.
        </p>
      </div>

      <MultiOpCart
        availableCalls={networkCalls}
        cartItems={cartItems}
        currentNetwork={currentNetwork}
        onAddCall={onAddCall}
        onRemoveItem={onRemoveItem}
        onMoveItem={onMoveItem}
        onClear={onClear}
      />

      <Card>
        <CardHeader>
          <CardTitle>Simulate, Sign, Submit</CardTitle>
          <CardDescription>
            Build one transaction containing all operations in your cart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {simulation && (
            <div className="rounded-md border border-blue-500/40 bg-blue-500/10 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge>{simulation.operationCount} operations</Badge>
                {simulation.details.minResourceFee && (
                  <Badge variant="secondary">
                    Min Fee: {formatStroops(simulation.details.minResourceFee)} stroops
                  </Badge>
                )}
                <Badge variant="secondary">
                  {simulation.details.stateChangesCount} state changes
                </Badge>
                {simulation.details.cpuInsns !== undefined && (
                  <Badge variant="secondary">
                    CPU: {formatStroops(String(simulation.details.cpuInsns))}
                  </Badge>
                )}
              </div>

              {simulation.details.stateChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No state changes returned by simulation.
                </p>
              ) : (
                <div className="grid gap-2">
                  {simulation.details.stateChanges.map((change, index) => (
                    <div
                      key={`${change.type}-${index}`}
                      className="rounded border bg-background/60 p-2 font-mono text-xs"
                    >
                      <span className="mr-2 font-semibold">{change.type}</span>
                      <span className="text-muted-foreground">
                        key:{shortKeyBase64(change)}…
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {result && (
            <div className="break-all rounded-md border-l-4 border-blue-500 bg-muted p-4 font-mono text-xs">
              {result}
            </div>
          )}

          <div className="flex gap-3">
            <Button
              variant="secondary"
              className="flex-1"
              onClick={handleSimulate}
              disabled={isLoading || cartItems.length < 2}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Terminal className="mr-2 h-4 w-4" />
              )}
              Simulate Batch
            </Button>

            <Button
              className="flex-1"
              onClick={handleSubmit}
              disabled={isLoading || cartItems.length < 2 || !isConnected}
            >
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-2 h-4 w-4" />
              )}
              Sign & Submit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
