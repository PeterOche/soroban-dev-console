"use client";

import { signTransaction } from "@stellar/freighter-api";
import {
  Contract,
  TimeoutInfinite,
  TransactionBuilder,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import { Loader2, Send, Terminal } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { MultiOpCart, MultiOpCartItem } from "@/components/multi-op-cart";
import {
  convertToScVal,
  normalizeSimulationResult,
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

function toCartItem(call: SavedCall): MultiOpCartItem {
  return {
    ...call,
    cartItemId: crypto.randomUUID(),
  };
}

function formatStroops(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat("en-US").format(parsed);
}

function shortKeyBase64(change: NormalizedSimulationResult["stateChanges"][number]) {
  try {
    return change.key.toXDR("base64").slice(0, 24);
  } catch {
    return "unavailable";
  }
}

export default function TxBuilderPage() {
  const { savedCalls } = useSavedCallsStore();
  const { getActiveNetworkConfig, currentNetwork } = useNetworkStore();
  const { isConnected, address } = useWallet();

  const [cartItems, setCartItems] = useState<MultiOpCartItem[]>([]);
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
    setCartItems((prev) => [...prev, toCartItem(call)]);
    resetSimulation();
  };

  const onRemoveItem = (cartItemId: string) => {
    setCartItems((prev) => prev.filter((item) => item.cartItemId !== cartItemId));
    resetSimulation();
  };

  const onMoveItem = (cartItemId: string, direction: "up" | "down") => {
    setCartItems((prev) => {
      const index = prev.findIndex((item) => item.cartItemId === cartItemId);
      if (index === -1) return prev;

      const target = direction === "up" ? index - 1 : index + 1;
      if (target < 0 || target >= prev.length) return prev;

      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    resetSimulation();
  };

  const onClear = () => {
    setCartItems([]);
    resetSimulation();
  };

  const buildOperations = () =>
    cartItems.map((item) => {
      const contract = new Contract(item.contractId);
      const scArgs = item.args.map((arg) => convertToScVal(arg.type, arg.value));
      return contract.call(item.fnName, ...scArgs);
    });

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
      const server = new SorobanRpc.Server(network.rpcUrl);
      const operations = buildOperations();

      const source =
        address || "GBZXN7PIRZGNMHGA7MUUUFFAUYVSF74BWXME4R37P2N6F5N4AUM5546F";
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
      const tx = txBuilder.setTimeout(TimeoutInfinite).build();

      const sim = await server.simulateTransaction(tx);
      const normalized = normalizeSimulationResult(sim);
      if (!normalized.ok) {
        throw new Error(normalized.error || "Unknown simulation error");
      }

      setSimulation({
        operationCount: operations.length,
        details: normalized,
      });

      setResult("Simulation success for batched transaction.");
      toast.success("Simulation success");
    } catch (error: any) {
      console.error(error);
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
      const server = new SorobanRpc.Server(network.rpcUrl);
      const operations = buildOperations();

      const sourceAccount = await server.getAccount(address);
      const txBuilder = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: network.networkPassphrase,
      });
      operations.forEach((op) => txBuilder.addOperation(op));

      const tx = txBuilder.setTimeout(TimeoutInfinite).build();
      const sim = await server.simulateTransaction(tx);
      const normalized = normalizeSimulationResult(sim);
      if (!normalized.ok) {
        throw new Error(
          `Pre-flight simulation failed: ${normalized.error || "Unknown simulation error"}`,
        );
      }

      setSimulation({
        operationCount: operations.length,
        details: normalized,
      });

      const preparedTx = SorobanRpc.assembleTransaction(tx, sim).build();
      const signedResult = await signTransaction(preparedTx.toXDR(), {
        networkPassphrase: network.networkPassphrase,
      });

      const sendResult = await server.sendTransaction(
        TransactionBuilder.fromXDR(
          signedResult.signedTxXdr,
          network.networkPassphrase,
        ),
      );

      if (sendResult.status !== "PENDING") {
        throw new Error(`Submission failed: ${sendResult.status}`);
      }

      setResult(`Transaction submitted. Hash: ${sendResult.hash}`);
      toast.success("Multi-operation transaction submitted.");
    } catch (error: any) {
      console.error(error);
      setResult(`Submission failed: ${error.message}`);
      toast.error(`Submission failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Multi-Operation Builder
        </h1>
        <p className="text-muted-foreground">
          Batch saved contract calls into one atomic transaction.
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
                  {simulation.details.stateChangesCount} combined state changes
                </Badge>
                {simulation.details.cpuInsns !== undefined && (
                  <Badge variant="secondary">
                    CPU: {formatStroops(String(simulation.details.cpuInsns))}
                  </Badge>
                )}
              </div>

              {simulation.details.stateChanges.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No state changes were returned by simulation.
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
                        key:{shortKeyBase64(change)}...
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
