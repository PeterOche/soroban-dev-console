"use client";

import { signTransaction } from "@stellar/freighter-api";
import {
  Contract,
  TimeoutInfinite,
  TransactionBuilder,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import { AlertCircle, Loader2, RotateCcw, Send, Terminal, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MultiOpCart } from "@/components/multi-op-cart";
import {
  convertToScVal,
  normalizeSimulationResult,
  type NormalizedSimulationResult,
} from "@devconsole/soroban-utils";
import { useNetworkStore } from "@/store/useNetworkStore";
import { SavedCall, useSavedCallsStore } from "@/store/useSavedCallsStore";
import { useWallet } from "@/store/useWallet";
import { Alert, AlertDescription } from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { Button } from "@devconsole/ui";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@devconsole/ui";

// ── FE-045: Draft persistence key ─────────────────────────────────────────────
const DRAFT_KEY = "soroban-tx-builder-draft";

type SimulationSummary = {
  operationCount: number;
  details: NormalizedSimulationResult;
};

/** FE-045: Per-operation validation error */
interface OpError {
  cartItemId: string;
  message: string;
}

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

/** FE-045: Validate each cart item before simulation/submission */
function validateCartItems(
  items: ReturnType<typeof useSavedCallsStore.getState>["cartItems"],
  currentNetwork: string,
): OpError[] {
  const errors: OpError[] = [];
  for (const item of items) {
    if (!item.contractId) {
      errors.push({ cartItemId: item.cartItemId, message: "Missing contract ID" });
    } else if (!item.fnName) {
      errors.push({ cartItemId: item.cartItemId, message: "Missing function name" });
    } else if (item.network !== currentNetwork) {
      errors.push({
        cartItemId: item.cartItemId,
        message: `Network mismatch: operation is on ${item.network}, current is ${currentNetwork}`,
      });
    }
  }
  return errors;
}

export default function TxBuilderPage() {
  const { savedCalls, cartItems, addToCart, removeFromCart, moveCartItem, clearCart } =
    useSavedCallsStore();
  const { getActiveNetworkConfig, currentNetwork } = useNetworkStore();
  const { isConnected, address } = useWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<SimulationSummary | null>(null);
  const [opErrors, setOpErrors] = useState<OpError[]>([]);

  const networkCalls = useMemo(
    () => savedCalls.filter((call) => call.network === currentNetwork),
    [savedCalls, currentNetwork],
  );

  // FE-045: Persist draft (cart) to localStorage on change
  useEffect(() => {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(cartItems));
    } catch {
      // storage unavailable
    }
  }, [cartItems]);

  const resetSimulation = () => {
    setSimulation(null);
    setResult(null);
    setOpErrors([]);
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
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
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

    // FE-045: Per-op validation
    const errors = validateCartItems(cartItems, currentNetwork);
    if (errors.length > 0) {
      setOpErrors(errors);
      toast.error(`${errors.length} operation(s) have validation errors.`);
      return;
    }

    setIsLoading(true);
    setResult(null);
    setSimulation(null);
    setOpErrors([]);

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
      if (!normalized.ok) throw new Error(normalized.error || "Unknown simulation error");

      setSimulation({ operationCount: operations.length, details: normalized });
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

    // FE-045: Per-op validation before submit
    const errors = validateCartItems(cartItems, currentNetwork);
    if (errors.length > 0) {
      setOpErrors(errors);
      toast.error(`${errors.length} operation(s) have validation errors.`);
      return;
    }

    setIsLoading(true);
    setResult(null);
    setOpErrors([]);

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
        throw new Error(`Pre-flight simulation failed: ${normalized.error || "Unknown"}`);
      }

      setSimulation({ operationCount: operations.length, details: normalized });

      const preparedTx = SorobanRpc.assembleTransaction(tx, sim).build();
      const signedResult = await signTransaction(preparedTx.toXDR(), {
        networkPassphrase: network.networkPassphrase,
      });

      const sendResult = await server.sendTransaction(
        TransactionBuilder.fromXDR(signedResult.signedTxXdr, network.networkPassphrase),
      );

      if (sendResult.status !== "PENDING") {
        throw new Error(`Submission failed: ${sendResult.status}`);
      }

      setResult(`Transaction submitted. Hash: ${sendResult.hash}`);
      toast.success("Multi-operation transaction submitted.");
      // FE-045: Clear draft on successful submit
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    } catch (error: any) {
      setResult(`Submission failed: ${error.message}`);
      toast.error(`Submission failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-bold">Multi-Operation Builder</h1>
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

      {/* FE-045: Per-op error reporting */}
      {opErrors.length > 0 && (
        <div className="space-y-2">
          {opErrors.map((err) => {
            const item = cartItems.find((c) => c.cartItemId === err.cartItemId);
            return (
              <Alert key={err.cartItemId} variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-medium">{item?.name ?? err.cartItemId}:</span>{" "}
                  {err.message}
                </AlertDescription>
              </Alert>
            );
          })}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Simulate, Sign, Submit
          </CardTitle>
          <CardDescription>
            Build one transaction containing all operations in your cart.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {simulation && (
            <div className="rounded-md border bg-muted/30 p-4 text-sm">
              <div className="mb-3 flex flex-wrap gap-2">
                <Badge variant="secondary">{simulation.operationCount} operations</Badge>
                {simulation.details.minResourceFee && (
                  <Badge variant="outline">
                    Min Fee: {formatStroops(simulation.details.minResourceFee)} stroops
                  </Badge>
                )}
                <Badge variant="outline">
                  {simulation.details.stateChangesCount} state changes
                </Badge>
                {simulation.details.cpuInsns !== undefined && (
                  <Badge variant="outline">
                    CPU: {formatStroops(String(simulation.details.cpuInsns))}
                  </Badge>
                )}
              </div>
              {simulation.details.stateChanges.length === 0 ? (
                <p className="text-muted-foreground">No state changes returned by simulation.</p>
              ) : (
                <div className="space-y-1">
                  {simulation.details.stateChanges.map((change, index) => (
                    <div key={index} className="flex gap-2 font-mono text-xs">
                      <Badge variant="outline" className="shrink-0">
                        {change.type}
                      </Badge>
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
            <div
              className={`rounded-md border p-3 font-mono text-xs ${
                result.startsWith("Simulation failed") || result.startsWith("Submission failed")
                  ? "border-destructive/50 bg-destructive/10 text-destructive"
                  : "border-green-500/30 bg-green-500/10 text-green-700"
              }`}
            >
              {result}
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={handleSimulate}
              disabled={isLoading || cartItems.length < 2}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />}
              Simulate Batch
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={isLoading || cartItems.length < 2 || !isConnected}
            >
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Sign & Submit
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
