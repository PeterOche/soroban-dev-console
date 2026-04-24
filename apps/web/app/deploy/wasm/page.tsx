"use client";

import { useState } from "react";
import { useWallet } from "@/store/useWallet";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useWasmStore, type WasmEntry, type ProvenanceNode, type DeployPhase } from "@/store/useWasmStore";
import { useContractStore } from "@/store/useContractStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import {
  TransactionBuilder,
  TimeoutInfinite,
  hash,
  Operation,
  Address,
} from "@stellar/stellar-sdk";
import { Server as SorobanServer } from "@stellar/stellar-sdk/rpc";
import { orchestrateTx } from "@/lib/tx-orchestrator";
import {
  UploadCloud,
  FileCode,
  Loader2,
  Copy,
  Play,
  Trash2,
  GitBranch,
  ShieldCheck,
  ShieldAlert,
  Link,
  CheckCircle2,
  XCircle,
  Circle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@devconsole/ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import { Label } from "@devconsole/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@devconsole/ui";
import { toast } from "sonner";
import { Badge } from "@devconsole/ui";
import {
  createNormalizedContractSpecFromFunctionNames,
  parseWasmMetadata,
  extractContractIdFromDeployResult,
} from "@devconsole/soroban-utils";
import { registerSource } from "@/lib/source-registry";
import { InstantiateWizard } from "@/components/instantiate-wizard";

// ── Provenance panel ──────────────────────────────────────────────────────────

function ProvenancePanel({ nodes }: { nodes: ProvenanceNode[] }) {
  if (nodes.length === 0) return null;
  return (
    <div className="mt-2 space-y-1 rounded-md border bg-muted/40 p-2">
      <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-muted-foreground">
        <GitBranch className="h-3 w-3" /> Provenance
      </p>
      {nodes.map((n) => (
        <div key={n.contractId} className="flex items-center gap-2 text-[11px]">
          <span className="font-mono text-muted-foreground">{n.contractId.slice(0, 10)}…</span>
          <Badge
            variant={n.relationship === "confirmed" ? "default" : "secondary"}
            className="text-[9px]"
          >
            {n.relationship}
          </Badge>
          <span className="text-muted-foreground">{n.network}</span>
        </div>
      ))}
    </div>
  );
}

// ── Verification badge ────────────────────────────────────────────────────────

function VerificationBadge({ entry }: { entry: WasmEntry }) {
  const confirmed = (entry.provenance ?? []).some((p) => p.relationship === "confirmed");
  if (!entry.deployedContractId) return null;
  return confirmed ? (
    <span title="Source verified" className="text-green-500">
      <ShieldCheck className="h-3.5 w-3.5" />
    </span>
  ) : (
    <span title="Verification pending" className="text-yellow-500">
      <ShieldAlert className="h-3.5 w-3.5" />
    </span>
  );
}

// ── Verify source panel ───────────────────────────────────────────────────────

function VerifySourcePanel({
  entry,
  onVerified,
}: {
  entry: WasmEntry;
  onVerified: (contractId: string) => void;
}) {
  const { getActiveNetworkConfig } = useNetworkStore();
  const { address } = useWallet();
  const [repoUrl, setRepoUrl] = useState("");
  const [verifying, setVerifying] = useState(false);

  const registryId = process.env.NEXT_PUBLIC_CONTRACT_SOURCE_REGISTRY ?? null;
  const isConfirmed = (entry.provenance ?? []).some((p) => p.relationship === "confirmed");

  if (!entry.deployedContractId || isConfirmed || !registryId) return null;

  const handleVerify = async () => {
    if (!repoUrl || !address) return;
    setVerifying(true);
    try {
      const network = getActiveNetworkConfig();
      const ok = await registerSource(
        { rpcUrl: network.rpcUrl, networkPassphrase: network.networkPassphrase },
        registryId,
        address,
        entry.deployedContractId!,
        repoUrl,
      );
      if (ok) {
        onVerified(entry.deployedContractId!);
        toast.success("Source registered — provenance confirmed.");
      } else {
        toast.error("Source registration failed.");
      }
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="mt-2 flex items-center gap-2">
      <Input
        className="h-7 text-xs"
        placeholder="https://github.com/org/repo"
        value={repoUrl}
        onChange={(e) => setRepoUrl(e.target.value)}
      />
      <Button size="sm" variant="outline" onClick={handleVerify} disabled={verifying || !repoUrl}>
        {verifying ? <Loader2 className="h-3 w-3 animate-spin" /> : <Link className="h-3 w-3" />}
        <span className="ml-1 text-xs">Verify</span>
      </Button>
    </div>
  );
}

// ── FE-048: Deploy pipeline panel ─────────────────────────────────────────────

const PIPELINE_STEPS: { phase: DeployPhase; label: string }[] = [
  { phase: "install", label: "Install WASM" },
  { phase: "instantiate", label: "Instantiate Contract" },
  { phase: "publish", label: "Publish Artifact" },
];

function DeployPipelinePanel() {
  const { pipeline, resetPipeline } = useWasmStore();
  if (pipeline.phase === "idle") return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-medium">Deploy Pipeline</span>
        {(pipeline.phase === "done" || pipeline.phase === "error") && (
          <Button variant="ghost" size="sm" onClick={resetPipeline}>
            <RotateCcw className="mr-1 h-3 w-3" /> Reset
          </Button>
        )}
      </div>
      <div className="flex items-center gap-2">
        {PIPELINE_STEPS.map((step, i) => {
          const isActive = pipeline.phase === step.phase;
          const isDone =
            pipeline.phase === "done" ||
            PIPELINE_STEPS.findIndex((s) => s.phase === pipeline.phase) > i;
          const isError = pipeline.phase === "error" && isActive;

          return (
            <div key={step.phase} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-6 bg-border" />}
              <div className="flex flex-col items-center gap-1">
                {isDone ? (
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                ) : isError ? (
                  <XCircle className="h-5 w-5 text-destructive" />
                ) : isActive ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                ) : (
                  <Circle className="h-5 w-5 text-muted-foreground/40" />
                )}
                <span className={`text-xs ${isActive ? "font-medium" : "text-muted-foreground"}`}>
                  {step.label}
                </span>
              </div>
            </div>
          );
        })}
        {pipeline.phase === "done" && (
          <div className="flex items-center gap-2">
            <div className="h-px w-6 bg-border" />
            <CheckCircle2 className="h-5 w-5 text-green-500" />
            <span className="text-xs font-medium text-green-600">Done</span>
          </div>
        )}
      </div>
      {pipeline.error && (
        <p className="mt-2 text-xs text-destructive">{pipeline.error}</p>
      )}
      {pipeline.contractId && pipeline.phase === "done" && (
        <p className="mt-2 font-mono text-xs text-muted-foreground">
          Contract: {pipeline.contractId}
        </p>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function WasmRegistryPage() {
  const { isConnected, address } = useWallet();
  const { getActiveNetworkConfig } = useNetworkStore();
  const { wasms, addWasm, removeWasm, associateContract, addProvenanceNode, advancePipeline, resetPipeline } = useWasmStore();
  const { activeWorkspaceId, attachArtifact } = useWorkspaceStore();
  const { addContract } = useContractStore();

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [wasmName, setWasmName] = useState("");
  const [deployingHash, setDeployingHash] = useState<string | null>(null);
  const [expandedHash, setExpandedHash] = useState<string | null>(null);
  const [previewFunctions, setPreviewFunctions] = useState<string[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);

      const arrayBuffer = await selected.arrayBuffer();
      const functions = await parseWasmMetadata(Buffer.from(arrayBuffer));
      const spec = createNormalizedContractSpecFromFunctionNames(functions, "wasm", selected.name);
      setPreviewFunctions(spec.functions.map((entry) => entry.name));

      if (!wasmName) setWasmName(selected.name.replace(".wasm", ""));
    }
  };

  const handleInstall = async () => {
    if (!file || !address || !isConnected) return;
    setIsUploading(true);
    advancePipeline("install"); // FE-048

    try {
      const network = getActiveNetworkConfig();
      const server = new SorobanServer(network.rpcUrl);
      const arrayBuffer = await file.arrayBuffer();
      const wasmBuffer = Buffer.from(arrayBuffer);

      const sourceAccount = await server.getAccount(address);
      const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000",
        networkPassphrase: network.networkPassphrase,
      })
        .addOperation(Operation.uploadContractWasm({ wasm: wasmBuffer }))
        .setTimeout(TimeoutInfinite)
        .build();

      // FE-040: use shared orchestration layer for sign + submit + poll
      const txResult = await orchestrateTx(tx.toXDR(), network);

      if (txResult.status !== "success") {
        throw new Error(txResult.errorMessage ?? "Upload failed");
      }

      const wasmHash = hash(wasmBuffer).toString("hex");

      addWasm({
        hash: wasmHash,
        name: wasmName || file.name,
        network: network.id,
        installedAt: Date.now(),
        functions: previewFunctions.length > 0 ? previewFunctions : undefined,
        parseError: previewFunctions[0] === "Parsing failed",
        workspaceId: activeWorkspaceId,
      });
      attachArtifact(activeWorkspaceId, { kind: "wasm", id: wasmHash });

      // FE-048: advance to instantiate phase
      advancePipeline("instantiate", { wasmHash, txHash: res.hash });

      toast.success("WASM Uploaded & Saved!");
      setFile(null);
      setWasmName("");
    } catch (e: any) {
      console.error(e);
      advancePipeline("error", { error: e.message }); // FE-048
      toast.error(`Install failed: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeploy = async (wasmHash: string) => {
    if (!address || !isConnected) return;
    setDeployingHash(wasmHash);

    try {
      const network = getActiveNetworkConfig();
      const server = new SorobanServer(network.rpcUrl);
      const sourceAccount = await server.getAccount(address);

      const tx = new TransactionBuilder(sourceAccount, {
        fee: "10000",
        networkPassphrase: network.networkPassphrase,
      })
        .addOperation(
          Operation.createCustomContract({
            wasmHash: Buffer.from(wasmHash, "hex"),
            address: new Address(address),
            salt: Buffer.alloc(32).fill(Math.floor(Math.random() * 255)),
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

      if (res.status !== "PENDING") throw new Error("Deploy submission failed");

      let attempts = 0;
      while (attempts < 10) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await server.getTransaction(res.hash);
        if (status.status === "SUCCESS") {
          // FE-049: decode the real contract ID from the transaction result XDR
          const realContractId =
            status.resultMetaXdr
              ? extractContractIdFromDeployResult(status.resultMetaXdr)
              : null;
          const contractId = realContractId ?? res.hash;
          const relationship = realContractId ? "confirmed" : "inferred";

          associateContract(wasmHash, contractId, relationship);
          attachArtifact(activeWorkspaceId, {
            kind: "wasm",
            id: wasmHash,
            contractId,
            relationship,
          });
          addContract(contractId, network.id);
          toast.success(`Contract deployed! ID: ${contractId.slice(0, 10)}…`);
          // FE-048: advance to publish phase then done
          advancePipeline("publish", { contractId: res.hash, txHash: res.hash });
          setTimeout(() => advancePipeline("done", { contractId: res.hash }), 800);
          toast.success("Contract Instantiated Successfully!");
          break;
        }
        if (status.status === "FAILED") {
          // FE-049: preserve failure context for debugging
          const errorDetail = (status as any).resultXdr ?? "unknown";
          throw new Error(`Transaction failed. Result XDR: ${errorDetail}`);
        }
        attempts++;
      // FE-040: use shared orchestration layer for sign + submit + poll
      const txResult = await orchestrateTx(tx.toXDR(), network);

      if (txResult.status === "success" && txResult.hash) {
        // SC-003/SC-004: record as inferred until source-registry confirms
        associateContract(wasmHash, txResult.hash, "inferred");
        attachArtifact(activeWorkspaceId, {
          kind: "wasm",
          id: wasmHash,
          contractId: txResult.hash,
          relationship: "inferred",
        });
        toast.success("Contract Instantiated Successfully!");
      } else {
        throw new Error(txResult.errorMessage ?? "Deploy failed");
      }
    } catch (e: any) {
      console.error(e);
      advancePipeline("error", { error: e.message }); // FE-048
      toast.error(`Deploy failed: ${e.message}`);
    } finally {
      setDeployingHash(null);
    }
  };

  // SC-004: called after successful source-registry registration
  const handleSourceVerified = (wasmHash: string, contractId: string) => {
    const network = getActiveNetworkConfig();
    addProvenanceNode({
      wasmHash,
      contractId,
      relationship: "confirmed",
      network: network.id,
      deployedAt: Date.now(),
    });
    attachArtifact(activeWorkspaceId, {
      kind: "wasm",
      id: wasmHash,
      contractId,
      relationship: "confirmed",
    });
  };

  return (
    <div className="container mx-auto space-y-8 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">WASM Registry</h1>
          <p className="text-muted-foreground">Upload, manage, and deploy contract code.</p>
        </div>
        <InstantiateWizard />
      </div>

      {/* FE-048: Guided deploy pipeline status */}
      <DeployPipelinePanel />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader>
            <CardTitle>Install New Code</CardTitle>
            <CardDescription>Upload a .wasm file to the ledger.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid w-full items-center gap-1.5">
              <Label>WASM File</Label>
              <Input type="file" accept=".wasm" onChange={handleFileChange} />
            </div>

            <div className="grid w-full items-center gap-1.5">
              <Label>Name (Optional)</Label>
              <Input
                placeholder="e.g. Token v2"
                value={wasmName}
                onChange={(e) => setWasmName(e.target.value)}
              />
            </div>

            <Button
              className="w-full"
              onClick={handleInstall}
              disabled={!file || !isConnected || isUploading}
            >
              {isUploading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="mr-2 h-4 w-4" />
              )}
              Install WASM
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>My WASM Library</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Hash</TableHead>
                  <TableHead>Network</TableHead>
                  <TableHead>Deployed</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wasms.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                      No WASM code uploaded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  wasms.map((entry) => (
                    <>
                      <TableRow
                        key={entry.hash}
                        className="cursor-pointer"
                        onClick={() =>
                          setExpandedHash(expandedHash === entry.hash ? null : entry.hash)
                        }
                      >
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <FileCode className="h-4 w-4 text-blue-500" />
                            {entry.name}
                            {entry.parseError && (
                              <Badge variant="destructive" className="text-[10px]">
                                parse error
                              </Badge>
                            )}
                            <VerificationBadge entry={entry} />
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {entry.hash.slice(0, 12)}...{entry.hash.slice(-12)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[10px]">
                            {entry.network}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {entry.deployedContractId ? (
                            <span className="font-mono">
                              {entry.deployedContractId.slice(0, 10)}…
                            </span>
                          ) : (
                            <span className="italic">—</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeploy(entry.hash);
                              }}
                              disabled={!!deployingHash}
                            >
                              {deployingHash === entry.hash ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Play className="mr-1 h-3 w-3" />
                              )}
                              Deploy
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigator.clipboard.writeText(entry.hash);
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-red-500 hover:text-red-600"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeWasm(entry.hash);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                      {expandedHash === entry.hash && (
                        <TableRow key={`${entry.hash}-detail`}>
                          <TableCell colSpan={5} className="bg-muted/20 pb-3 pt-0">
                            <ProvenancePanel nodes={entry.provenance ?? []} />
                            <VerifySourcePanel
                              entry={entry}
                              onVerified={(contractId) =>
                                handleSourceVerified(entry.hash, contractId)
                              }
                            />
                          </TableCell>
                        </TableRow>
                      )}
                    </>
                  ))
                )}
              </TableBody>
            </Table>
            {file && (
              <div className="space-y-2 rounded-md border bg-muted/50 p-3">
                <Label className="text-[10px] font-bold uppercase">WASM Preview</Label>
                <div className="flex flex-wrap gap-1">
                  {previewFunctions.map((fn) => (
                    <Badge key={fn} variant="secondary" className="text-[10px]">
                      {fn}()
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
