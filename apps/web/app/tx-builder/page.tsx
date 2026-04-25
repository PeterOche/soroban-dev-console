"use client";

import {
  Contract,
  TimeoutInfinite,
  TransactionBuilder,
} from "@stellar/stellar-sdk";
import {
  AlertCircle,
  FlaskConical,
  Loader2,
  Send,
  SlidersHorizontal,
  Terminal,
  Eye,
  Download,
} from "lucide-react";
import { Server as SorobanServer } from "@stellar/stellar-sdk/rpc";
import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { orchestrateTx, simulateTx, type TxStatus } from "@/lib/tx-orchestrator";

import { MultiOpCart } from "@/components/multi-op-cart";
import { ActionGuard } from "@/components/action-guard";
import { convertToScVal, type NormalizedSimulationResult } from "@devconsole/soroban-utils";
import { useNetworkStore } from "@/store/useNetworkStore";
import { SavedCall, useSavedCallsStore } from "@/store/useSavedCallsStore";
import { useResultBundlesStore } from "@/store/useResultBundlesStore";
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
import { Input } from "@devconsole/ui";
import { Label } from "@devconsole/ui";
import { exportResultBundle } from "@/lib/result-bundles";

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
  const pathname = usePathname();
  const { savedCalls, cartItems, addToCart, removeFromCart, moveCartItem, clearCart } =
    useSavedCallsStore();
  const { addBundle } = useResultBundlesStore();
  const { getActiveNetworkConfig, currentNetwork } = useNetworkStore();
  const { isConnected, address, isSandboxMode, enterSandbox, exitSandbox } = useWallet();

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [simulation, setSimulation] = useState<SimulationSummary | null>(null);
  const [opErrors, setOpErrors] = useState<OpError[]>([]);

  // FE-044: fee/resource tuning
  const [showFeeControls, setShowFeeControls] = useState(false);
  const [customFee, setCustomFee] = useState("100");
  const feeOverride = (() => {
    const n = Number(customFee);
    return Number.isFinite(n) && n >= 100 ? String(n) : "100";
  })();

  const networkCalls = useMemo(
    () => savedCalls.filter((call) => call.network === currentNetwork),
    [savedCalls, currentNetwork],
  );

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
  };

  const buildOperations = () =>
    cartItems.map((item) => {
      const contract = new Contract(item.contractId);
      const scArgs = item.args.map((arg) => convertToScVal(arg.type, arg.value));
      return contract.call(item.fnName, ...scArgs);
    });

  /** Build a raw transaction XDR from the current cart items. */
  const buildTxXdr = async (source: string, fee: string): Promise<string> => {
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
      { fee, networkPassphrase: network.networkPassphrase },
    );
    operations.forEach((op) => txBuilder.addOperation(op));
    return txBuilder.setTimeout(TimeoutInfinite).build().toXDR();
  };

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
      const source =
        address || "GBZXN7PIRZGNMHGA7MUUUFFAUYVSF74BWXME4R37P2N6F5N4AUM5546F";
      const network = getActiveNetworkConfig();
      const txXdr = await buildTxXdr(source, feeOverride);
      // FE-040: use shared orchestration layer for simulation
      const normalized = await simulateTx(txXdr, network);
      if (!normalized.ok) throw new Error(normalized.error || "Unknown simulation error");

      addBundle({
        kind: "batch",
        title: "Batch simulation",
        networkId: network.id,
        payload: {
          operationCount: cartItems.length,
          cartItems,
          simulation: normalized,
        },
      });

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
      const server = new SorobanServer(network.rpcUrl);
      const sourceAccount = await server.getAccount(address);

      const txBuilder = new TransactionBuilder(sourceAccount, {
        // FE-044: apply fee override
        fee: feeOverride,
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

      addBundle({
        kind: "batch",
        title: "Batch submission",
        networkId: network.id,
        txHash: txResult.hash,
        payload: {
          operationCount: cartItems.length,
          cartItems,
          status: txResult.status,
          simulation: txResult.simulation,
          errorMessage: txResult.errorMessage,
        },
      });

      if (txResult.status === "success") {
        setResult(`Transaction submitted. Hash: ${txResult.hash}`);
        clearCart();
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

  const handleExportBundle = () => {
    const network = getActiveNetworkConfig();
    const bundle = addBundle({
      kind: "batch",
      title: "Batch manual export",
      networkId: network.id,
      payload: {
        operationCount: cartItems.length,
        cartItems,
        simulation,
        result,
        opErrors,
      },
    });
    exportResultBundle(bundle);
    toast.success("Batch result bundle exported");
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
          {/* FE-064: Action context banners */}
          {pathname?.startsWith("/share/") && (
            <div className="flex items-center gap-2 rounded-md border border-blue-500/40 bg-blue-500/10 px-4 py-2 text-sm text-blue-700">
              <Eye className="h-4 w-4" />
              <span>Read-only shared workspace — execution and editing are disabled.</span>
            </div>
          )}
          {isSandboxMode && (
            <div className="flex items-center justify-between rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
              <div className="flex items-center gap-2 text-amber-700">
                <FlaskConical className="h-4 w-4" />
                <span>Sandbox mode — simulation only</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-amber-700 hover:text-amber-900"
                onClick={exitSandbox}
              >
                Exit
              </Button>
            </div>
          )}
          {!isConnected && !isSandboxMode && !pathname?.startsWith("/share/") && (
            <div className="flex items-center justify-between rounded-md border border-dashed px-4 py-2 text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                <span>No wallet connected — connect or enter sandbox to enable interactions</span>
              </div>
              <Button variant="outline" size="sm" onClick={enterSandbox}>
                <FlaskConical className="mr-1 h-3 w-3" />
                Enter Sandbox
              </Button>
            </div>
          )}

          {/* FE-044: fee controls toggle */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 text-xs text-muted-foreground"
              onClick={() => setShowFeeControls((v) => !v)}
            >
              <SlidersHorizontal className="h-3 w-3" />
              {showFeeControls ? "Hide fee controls" : "Fee controls"}
            </Button>
          </div>

          {showFeeControls && (
            <div className="rounded-md border border-dashed p-4 space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Advanced Fee Override
              </p>
              <div className="max-w-xs space-y-1">
                <Label className="text-xs">Base Fee (stroops, min 100)</Label>
                <Input
                  type="number"
                  min={100}
                  value={customFee}
                  onChange={(e) => setCustomFee(e.target.value)}
                  placeholder="100"
                  className="h-8 text-xs font-mono"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                Tuned fee stays consistent between simulation and submission.
              </p>
            </div>
          )}
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
            <ActionGuard action="simulate">
              <Button
                variant="outline"
                onClick={handleSimulate}
                disabled={isLoading || cartItems.length < 2}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Terminal className="mr-2 h-4 w-4" />
                )}
                {isSandboxMode ? "Simulate Batch (Sandbox)" : "Simulate Batch"}
              </Button>
            </ActionGuard>

            <ActionGuard action="submit">
              <Button
                onClick={handleSubmit}
                disabled={isLoading || cartItems.length < 2}
              >
                {isLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Sign &amp; Submit
              </Button>
            </ActionGuard>
            {(simulation || result) && (
              <Button variant="outline" onClick={handleExportBundle}>
                <Download className="mr-2 h-4 w-4" />
                Export Bundle
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
