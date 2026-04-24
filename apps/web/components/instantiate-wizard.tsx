"use client";

import { useState } from "react";
import {
  TransactionBuilder,
  TimeoutInfinite,
  Operation,
  Address,
} from "@stellar/stellar-sdk";
import { Server as SorobanServer } from "@stellar/stellar-sdk/rpc";
import { signTransaction } from "@stellar/freighter-api";
import { Wand2, Loader2, ChevronRight, ChevronLeft, CheckCircle2 } from "lucide-react";
import { Button } from "@devconsole/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import { Label } from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { toast } from "sonner";
import { useWallet } from "@/store/useWallet";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useWasmStore, type WasmEntry } from "@/store/useWasmStore";
import { useContractStore } from "@/store/useContractStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { extractContractIdFromDeployResult } from "@devconsole/soroban-utils";

type Step = "select" | "configure" | "confirm" | "done";

interface InstantiateWizardProps {
  /** Pre-select a specific WASM hash */
  preselectedHash?: string;
}

export function InstantiateWizard({ preselectedHash }: InstantiateWizardProps) {
  const { isConnected, address } = useWallet();
  const { getActiveNetworkConfig } = useNetworkStore();
  const { wasms, associateContract, pinArtifact } = useWasmStore();
  const { addContract } = useContractStore();
  const { activeWorkspaceId, attachArtifact } = useWorkspaceStore();

  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("select");
  const [selectedHash, setSelectedHash] = useState(preselectedHash ?? "");
  const [salt, setSalt] = useState("");
  const [busy, setBusy] = useState(false);
  const [resultContractId, setResultContractId] = useState<string | null>(null);

  const selectedEntry: WasmEntry | undefined = wasms.find((w) => w.hash === selectedHash);

  const reset = () => {
    setStep("select");
    setSelectedHash(preselectedHash ?? "");
    setSalt("");
    setResultContractId(null);
  };

  const handleOpen = (v: boolean) => {
    setOpen(v);
    if (!v) reset();
  };

  const handleInstantiate = async () => {
    if (!address || !isConnected || !selectedHash) return;
    setBusy(true);
    try {
      const network = getActiveNetworkConfig();
      const server = new SorobanServer(network.rpcUrl);
      const sourceAccount = await server.getAccount(address);

      const saltBytes = salt
        ? Buffer.from(salt.padEnd(32, "\0").slice(0, 32))
        : Buffer.alloc(32).fill(Math.floor(Math.random() * 255));

      const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000",
        networkPassphrase: network.networkPassphrase,
      })
        .addOperation(
          Operation.createCustomContract({
            wasmHash: Buffer.from(selectedHash, "hex"),
            address: new Address(address),
            salt: saltBytes,
          }),
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

      if (res.status !== "PENDING") throw new Error("Submission failed");

      let contractId: string | null = null;
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await server.getTransaction(res.hash);
        if (status.status === "SUCCESS") {
          contractId = status.resultMetaXdr
            ? extractContractIdFromDeployResult(status.resultMetaXdr)
            : null;
          break;
        }
        if (status.status === "FAILED") throw new Error("Transaction failed");
      }

      const finalId = contractId ?? res.hash;
      const relationship = contractId ? "confirmed" : "inferred";

      associateContract(selectedHash, finalId, relationship);
      pinArtifact(selectedHash, activeWorkspaceId);
      attachArtifact(activeWorkspaceId, { kind: "wasm", id: selectedHash, contractId: finalId, relationship });
      addContract(finalId, network.id);

      setResultContractId(finalId);
      setStep("done");
      toast.success("Contract instantiated!");
    } catch (e: any) {
      toast.error(`Instantiation failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={!isConnected}>
          <Wand2 className="mr-2 h-4 w-4" />
          Instantiate Wizard
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Contract Instantiation Wizard
          </DialogTitle>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          {(["select", "configure", "confirm", "done"] as Step[]).map((s, i) => (
            <span key={s} className="flex items-center gap-1">
              <span className={step === s ? "font-semibold text-foreground" : ""}>{s}</span>
              {i < 3 && <ChevronRight className="h-3 w-3" />}
            </span>
          ))}
        </div>

        {/* Step: select */}
        {step === "select" && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose a stored WASM artifact to instantiate.
            </p>
            {wasms.length === 0 ? (
              <p className="rounded-md border border-dashed p-4 text-center text-sm text-muted-foreground">
                No WASM artifacts found. Upload one first.
              </p>
            ) : (
              <div className="max-h-60 space-y-2 overflow-y-auto">
                {wasms.map((w) => (
                  <button
                    key={w.hash}
                    onClick={() => setSelectedHash(w.hash)}
                    className={`w-full rounded-md border p-3 text-left transition-colors hover:bg-muted/50 ${
                      selectedHash === w.hash ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{w.name}</span>
                      <Badge variant="outline" className="text-[10px]">
                        v{w.version}
                      </Badge>
                    </div>
                    <p className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                      {w.hash.slice(0, 16)}…
                    </p>
                    <div className="mt-1 flex gap-1">
                      <Badge variant="secondary" className="text-[10px]">{w.network}</Badge>
                      {w.deployedContractId && (
                        <Badge className="text-[10px]">deployed</Badge>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                disabled={!selectedHash}
                onClick={() => setStep("configure")}
              >
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: configure */}
        {step === "configure" && selectedEntry && (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">{selectedEntry.name}</p>
              <p className="font-mono text-xs text-muted-foreground">{selectedEntry.hash.slice(0, 20)}…</p>
            </div>

            {selectedEntry.functions && selectedEntry.functions.length > 0 && (
              <div>
                <Label className="text-xs">Exported Functions</Label>
                <div className="mt-1 flex flex-wrap gap-1">
                  {selectedEntry.functions.map((fn) => (
                    <Badge key={fn} variant="secondary" className="text-[10px]">{fn}()</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-1">
              <Label htmlFor="salt">Salt (optional, 32-char max)</Label>
              <Input
                id="salt"
                placeholder="Leave blank for random salt"
                value={salt}
                maxLength={32}
                onChange={(e) => setSalt(e.target.value)}
              />
              <p className="text-[11px] text-muted-foreground">
                Using the same salt + deployer address produces the same contract ID.
              </p>
            </div>

            <div className="flex justify-between">
              <Button size="sm" variant="outline" onClick={() => setStep("select")}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button size="sm" onClick={() => setStep("confirm")}>
                Next <ChevronRight className="ml-1 h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Step: confirm */}
        {step === "confirm" && selectedEntry && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">Review and confirm instantiation.</p>
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Artifact</span>
                <span className="font-medium">{selectedEntry.name} v{selectedEntry.version}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Network</span>
                <Badge variant="outline" className="text-[10px]">{selectedEntry.network}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Salt</span>
                <span className="font-mono text-xs">{salt || "(random)"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Deployer</span>
                <span className="font-mono text-xs">{address?.slice(0, 10)}…</span>
              </div>
            </div>
            <div className="flex justify-between">
              <Button size="sm" variant="outline" onClick={() => setStep("configure")}>
                <ChevronLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              <Button size="sm" onClick={handleInstantiate} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {busy ? "Instantiating…" : "Instantiate"}
              </Button>
            </div>
          </div>
        )}

        {/* Step: done */}
        {step === "done" && (
          <div className="space-y-4 text-center">
            <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
            <p className="font-semibold">Contract Instantiated!</p>
            {resultContractId && (
              <p className="break-all rounded-md border bg-muted/30 p-2 font-mono text-xs">
                {resultContractId}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              The contract has been linked to your workspace.
            </p>
            <Button size="sm" onClick={() => handleOpen(false)}>
              Close
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
