"use client";

import { useEffect, useState } from "react";
import {
  Contract,
  TransactionBuilder,
  TimeoutInfinite,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import {
  Play,
  Send,
  Plus,
  Trash2,
  Loader2,
  Terminal,
  Save,
  Bookmark,
} from "lucide-react";
import { useWallet } from "@/store/useWallet";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useSavedCallsStore, SavedCall } from "@/store/useSavedCallsStore";
import {
  ArgType,
  ContractArg,
  convertToScVal,
  normalizeSimulationResult,
  type NormalizedSimulationResult,
  type NormalizedContractSpec,
} from "@devconsole/soroban-utils";
import { signTransaction } from "@stellar/freighter-api";
import { SavedCallsSheet } from "./saved-calls-sheet";
import { AbiInputField } from "./abi-input-field";
import { useAbiStore } from "@/store/useAbiStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { Badge } from "@devconsole/ui";
import { Button } from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@devconsole/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@devconsole/ui";
import { Label } from "@devconsole/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@devconsole/ui";
import { toast } from "sonner";

interface ContractCallFormProps {
  contractId: string;
}

const DEFAULT_TOKEN_SPEC: NormalizedContractSpec = {
  contractId: "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC",
  source: "workspace",
  rawSpec: "",
  ingestedAt: Date.now(),
  functions: [
    {
      name: "balance",
      inputs: [{ name: "id", type: "address", required: true }],
      outputs: [{ name: "balance", type: "i128", required: true }],
    },
    {
      name: "decimals",
      inputs: [],
      outputs: [{ name: "decimals", type: "u32", required: true }],
    },
    {
      name: "name",
      inputs: [],
      outputs: [{ name: "name", type: "string", required: true }],
    },
    {
      name: "symbol",
      inputs: [],
      outputs: [{ name: "symbol", type: "symbol", required: true }],
    },
    {
      name: "transfer",
      inputs: [
        { name: "from", type: "address", required: true },
        { name: "to", type: "address", required: true },
        { name: "amount", type: "i128", required: true },
      ],
      outputs: [],
    },
    {
      name: "mint",
      inputs: [
        { name: "to", type: "address", required: true },
        { name: "amount", type: "i128", required: true },
      ],
      outputs: [],
    },
    {
      name: "burn",
      inputs: [
        { name: "from", type: "address", required: true },
        { name: "amount", type: "i128", required: true },
      ],
      outputs: [],
    },
  ],
};

function toContractArg(field: NonNullable<NormalizedContractSpec["functions"][number]>["inputs"][number]): ContractArg {
  return {
    id: crypto.randomUUID(),
    name: field.name,
    type:
      field.type === "unknown" || field.type === "bytes"
        ? "string"
        : field.type,
    value: "",
  };
}

export function ContractCallForm({ contractId }: ContractCallFormProps) {
  const genId = () => Math.random().toString(36).substring(2, 9);
  const { isConnected, address } = useWallet();
  const { getActiveNetworkConfig } = useNetworkStore();

  const [fnName, setFnName] = useState("");
  const [args, setArgs] = useState<ContractArg[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [simulation, setSimulation] =
    useState<NormalizedSimulationResult | null>(null);
  const { saveCall } = useSavedCallsStore();
  const { activeWorkspaceId, linkSavedCall } = useWorkspaceStore();
  const [isSaveOpen, setIsSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState("");
  const { getSpec, setSpec } = useAbiStore();
  const spec = getSpec(contractId);
  const selectedFunction = spec?.functions.find((entry) => entry.name === fnName);
  const usesAbiInputs = Boolean(selectedFunction && selectedFunction.inputs.length > 0);

  const formatInt = (value: number) =>
    new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(value);

  const formatBytes = (bytes: number) => {
    if (!Number.isFinite(bytes) || bytes < 0) return "N/A";
    if (bytes < 1024) return `${formatInt(bytes)} B`;

    const units = ["KB", "MB", "GB", "TB"];
    let value = bytes / 1024;
    let unitIndex = 0;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }

    return `${new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 2,
    }).format(value)} ${units[unitIndex]}`;
  };

  const normalizedConnectedAddress = address?.trim().toUpperCase() ?? null;
  const isConnectedWalletAuthorized =
    normalizedConnectedAddress !== null &&
    (simulation?.requiredAuthKeys ?? []).some(
      (key) => key.toUpperCase() === normalizedConnectedAddress,
    );

  useEffect(() => {
    if (
      contractId ===
        "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC" &&
      !spec
    ) {
      setSpec(contractId, DEFAULT_TOKEN_SPEC);
    }
  }, [contractId, spec, setSpec]);

  const handleFnChange = (name: string) => {
    setFnName(name);
    setSimulation(null);
    const nextFunction = spec?.functions.find((entry) => entry.name === name);

    setArgs(nextFunction?.inputs.map(toContractArg) ?? []);
  };

  const addArg = () => {
    setSimulation(null);
    setArgs([...args, { id: genId(), type: "symbol", value: "" }]);
  };

  const removeArg = (id: string) => {
    setSimulation(null);
    setArgs(args.filter((a) => a.id !== id));
  };

  const updateArg = (id: string, field: keyof ContractArg, val: string) => {
    setSimulation(null);
    setArgs(args.map((a) => (a.id === id ? { ...a, [field]: val } : a)));
  };

  const handleSimulate = async () => {
    setIsLoading(true);
    setResult(null);
    setSimulation(null);
    try {
      const network = getActiveNetworkConfig();
      const server = new SorobanRpc.Server(network.rpcUrl);

      const contract = new Contract(contractId);
      const scArgs = args.map((a) => convertToScVal(a.type, a.value));

      const operation = contract.call(fnName, ...scArgs);

      const source =
        address || "GBZXN7PIRZGNMHGA7MUUUFFAUYVSF74BWXME4R37P2N6F5N4AUM5546F";

      const account = await server.getAccount(source).catch(() => null);

      const sequence = account ? account.sequenceNumber() : "0";

      const tx = new TransactionBuilder(
        {
          accountId: () => source,
          sequenceNumber: () => sequence,
          incrementSequenceNumber: () => {},
        },
        { fee: "100", networkPassphrase: network.networkPassphrase },
      )
        .addOperation(operation)
        .setTimeout(TimeoutInfinite)
        .build();

      const sim = await server.simulateTransaction(tx);
      const normalized = normalizeSimulationResult(sim);
      setSimulation(normalized);

      if (normalized.ok) {
        setResult("Simulation succeeded.");
        toast.success(`Simulation Success!`);
      } else {
        setResult(`Simulation failed: ${normalized.error || "Unknown error"}`);
        toast.error(`Simulation Failed: ${normalized.error || "Unknown error"}`);
      }
    } catch (e: any) {
      console.error(e);
      setSimulation({
        ok: false,
        error: e.message,
        auth: [],
        requiredAuthKeys: [],
        stateChangesCount: 0,
        stateChanges: [],
      });
      setResult(`Error: ${e.message}`);
      toast.error(`Simulation Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    if (!isConnected || !address) {
      toast.error("Connect wallet to send transactions");
      return;
    }

    setIsLoading(true);
    setResult(null);

    try {
      const network = getActiveNetworkConfig();
      const server = new SorobanRpc.Server(network.rpcUrl);

      const contract = new Contract(contractId);
      const scArgs = args.map((a) => convertToScVal(a.type, a.value));

      const sourceAccount = await server.getAccount(address);

      const tx = new TransactionBuilder(sourceAccount, {
        fee: "100",
        networkPassphrase: network.networkPassphrase,
      })
        .addOperation(contract.call(fnName, ...scArgs))
        .setTimeout(TimeoutInfinite)
        .build();

      const sim = await server.simulateTransaction(tx);
      if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
        throw new Error(`Pre-flight simulation failed: ${sim.error}`);
      }

      const preparedTx = SorobanRpc.assembleTransaction(tx, sim).build();

      const signedResult = await signTransaction(preparedTx.toXDR(), {
        networkPassphrase: network.networkPassphrase,
      });

      const sendRes = await server.sendTransaction(
        TransactionBuilder.fromXDR(
          signedResult.signedTxXdr,
          network.networkPassphrase,
        ),
      );

      if (sendRes.status !== "PENDING") {
        throw new Error(`Submission failed: ${sendRes.status}`);
      }

      setResult(`Transaction Submitted! Hash: ${sendRes.hash}`);
      toast.success("Transaction sent to network");
    } catch (e: any) {
      console.error(e);
      setResult(`Submission Error: ${e.message}`);
      toast.error(`Submission Error: ${e.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = () => {
    if (!saveName.trim()) return;

    const savedCall = saveCall({
      name: saveName,
      contractId,
      fnName,
      args,
      network: getActiveNetworkConfig().id,
    });
    linkSavedCall(activeWorkspaceId, savedCall.id);

    setIsSaveOpen(false);
    setSaveName("");
    toast.success("Interaction saved!");
  };

  const handleLoad = (call: SavedCall) => {
    setFnName(call.fnName);
    setSimulation(null);

    const newArgs = call.args.map((a) => ({ ...a, id: crypto.randomUUID() }));
    setArgs(newArgs);
    toast.info(`Loaded: ${call.name}`);
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Interact</CardTitle>
        <CardDescription>Call functions on this contract.</CardDescription>
        <SavedCallsSheet contractId={contractId} onSelect={handleLoad} />
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <Label>Function Name</Label>
          {spec ? (
            <Select value={fnName} onValueChange={handleFnChange}>
              <SelectTrigger>
                <SelectValue placeholder="Select a function..." />
              </SelectTrigger>
              <SelectContent>
                {spec.functions.map((f) => (
                  <SelectItem key={f.name} value={f.name}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <Input
              placeholder="e.g. initialize, increment, transfer"
              value={fnName}
              onChange={(e) => setFnName(e.target.value)}
            />
          )}
        </div>

        <Dialog open={isSaveOpen} onOpenChange={setIsSaveOpen}>
          <DialogTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              title="Save Interaction"
              disabled={!fnName}
            >
              <Save className="h-4 w-4" />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Save Interaction</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <Label>Name this bookmark</Label>
              <Input
                placeholder="e.g. Mint Test Tokens"
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                className="mt-2"
              />
            </div>
            <DialogFooter>
              <Button onClick={handleSave}>Save Bookmark</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Arguments ({args.length})</Label>
            {!usesAbiInputs && (
              <Button size="sm" variant="outline" onClick={addArg}>
                <Plus className="mr-1 h-3 w-3" /> Add Arg
              </Button>
            )}
          </div>

          {selectedFunction?.doc && (
            <p className="text-sm text-muted-foreground">{selectedFunction.doc}</p>
          )}

          {args.length === 0 && selectedFunction && (
            <div className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">
              {usesAbiInputs
                ? "This function does not require any arguments."
                : "No ABI-defined inputs were found for this function. Add manual arguments only if the contract expects them."}
            </div>
          )}

          {args.map((arg) => (
            <div key={arg.id} className="flex items-start gap-2">
              {!usesAbiInputs && (
                <div className="w-[120px]">
                  <Select
                    value={arg.type}
                    onValueChange={(v: ArgType) => updateArg(arg.id, "type", v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="symbol">Symbol</SelectItem>
                      <SelectItem value="address">Address</SelectItem>
                      <SelectItem value="i32">i32 (Int)</SelectItem>
                      <SelectItem value="string">String</SelectItem>
                      <SelectItem value="bool">Bool</SelectItem>
                      <SelectItem value="vec">Vec (JSON)</SelectItem>
                      <SelectItem value="map">Map (JSON)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <AbiInputField
                arg={arg}
                onChange={(id, val) => updateArg(id, "value", val)}
              />
              {!usesAbiInputs && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => removeArg(arg.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        {result && (
          <div className="break-all rounded-md border-l-4 border-blue-500 bg-muted p-4 font-mono text-xs">
            {result}
          </div>
        )}

        {simulation && (
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={simulation.ok ? "default" : "destructive"}>
                {simulation.ok ? "Simulation Succeeded" : "Simulation Failed"}
              </Badge>
              {simulation.minResourceFee && (
                <Badge variant="secondary">
                  Min Fee: {formatInt(Number(simulation.minResourceFee))} stroops
                </Badge>
              )}
              <Badge variant="secondary">
                {simulation.stateChangesCount} state change
                {simulation.stateChangesCount === 1 ? "" : "s"}
              </Badge>
              <Badge variant="secondary">
                {simulation.auth.length} auth entr
                {simulation.auth.length === 1 ? "y" : "ies"}
              </Badge>
            </div>

            {!simulation.ok && simulation.error && (
              <div className="mt-3 rounded-md border border-destructive/30 bg-background/70 p-3 text-sm">
                <p className="font-semibold text-destructive">Simulation Error</p>
                <p className="mt-1 font-mono text-xs">{simulation.error}</p>
              </div>
            )}

            {simulation.ok && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-md border bg-background/70 p-3">
                  <p className="text-muted-foreground text-xs">CPU Instructions</p>
                  <p className="font-mono text-sm font-semibold">
                    {simulation.cpuInsns !== undefined
                      ? formatInt(simulation.cpuInsns)
                      : "N/A"}
                  </p>
                </div>
                <div className="rounded-md border bg-background/70 p-3">
                  <p className="text-muted-foreground text-xs">Memory Bytes</p>
                  <p className="font-mono text-sm font-semibold">
                    {simulation.memBytes !== undefined
                      ? `${formatInt(simulation.memBytes)} B (${formatBytes(simulation.memBytes)})`
                      : "N/A"}
                  </p>
                </div>
                <div className="rounded-md border bg-background/70 p-3 sm:col-span-2">
                  <p className="text-muted-foreground text-xs">Return Value XDR</p>
                  <p className="mt-1 break-all font-mono text-xs">
                    {simulation.resultXdr ?? "No return value provided by simulation."}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {simulation && simulation.auth.length > 0 && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                Required Authorization Keys
              </p>
              <Badge className="border-amber-300 bg-amber-200/40 text-amber-800">
                {simulation.requiredAuthKeys.length} key
                {simulation.requiredAuthKeys.length === 1 ? "" : "s"}
              </Badge>
            </div>
            <div className="mt-3 space-y-2">
              {simulation.auth.map((entry) => {
                const isConnectedWallet =
                  normalizedConnectedAddress === entry.address.toUpperCase();
                const isSigningKey = entry.kind === "account";

                return (
                  <div
                    key={`${entry.kind}-${entry.address}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-background/70 p-3"
                  >
                    <div className="min-w-0">
                      <p className="break-all font-mono text-xs font-medium">
                        {entry.address}
                      </p>
                      <p className="text-muted-foreground text-[11px]">
                        {entry.kind === "account"
                          ? isConnectedWallet
                            ? "Matches connected wallet"
                            : "Required signer"
                          : "Contract authorization entry"}
                      </p>
                    </div>
                    {isConnectedWallet ? (
                      <Badge className="bg-green-600 hover:bg-green-700">
                        Connected
                      </Badge>
                    ) : isSigningKey ? (
                      <Badge variant="secondary">Missing</Badge>
                    ) : (
                      <Badge variant="secondary">Contract</Badge>
                    )}
                  </div>
                );
              })}
            </div>
            {simulation.requiredAuthKeys.length > 0 &&
              isConnected &&
              address &&
              !isConnectedWalletAuthorized && (
              <p className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 p-2 text-xs text-red-700">
                Connected wallet is not authorized for this invocation.
              </p>
            )}
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button
            variant="secondary"
            className="flex-1"
            onClick={handleSimulate}
            disabled={isLoading || !fnName}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Terminal className="mr-2 h-4 w-4" />
            )}
            Simulate
          </Button>

          <Button
            className="flex-1"
            onClick={handleSend}
            disabled={isLoading || !fnName || !isConnected}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Send Transaction
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
