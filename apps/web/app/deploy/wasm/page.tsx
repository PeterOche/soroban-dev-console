"use client";

import { useState } from "react";
import { useWallet } from "@/store/useWallet";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useWasmStore } from "@/store/useWasmStore";
import { useContractStore } from "@/store/useContractStore";
import {
  TransactionBuilder,
  TimeoutInfinite,
  hash,
  Operation,
  Address,
} from "@stellar/stellar-sdk";
import { Server as SorobanServer } from "@stellar/stellar-sdk/rpc";
import { signTransaction } from "@stellar/freighter-api";
import {
  UploadCloud,
  FileCode,
  Loader2,
  Copy,
  Play,
  Trash2,
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
} from "@devconsole/soroban-utils";

export default function WasmRegistryPage() {
  const { isConnected, address } = useWallet();
  const { getActiveNetworkConfig } = useNetworkStore();
  const { wasms, addWasm, removeWasm } = useWasmStore();
  const { addContract } = useContractStore();

  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [wasmName, setWasmName] = useState("");
  const [deployingHash, setDeployingHash] = useState<string | null>(null);

  const [previewFunctions, setPreviewFunctions] = useState<string[]>([]);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selected = e.target.files[0];
      setFile(selected);

      // Local-First Inspection logic
      const arrayBuffer = await selected.arrayBuffer();
      const functions = await parseWasmMetadata(Buffer.from(arrayBuffer));
      const spec = createNormalizedContractSpecFromFunctionNames(
        functions,
        "wasm",
        selected.name,
      );
      setPreviewFunctions(spec.functions.map((entry) => entry.name));

      if (!wasmName) setWasmName(selected.name.replace(".wasm", ""));
    }
  };

  const handleInstall = async () => {
    if (!file || !address || !isConnected) return;
    setIsUploading(true);

    try {
      const network = getActiveNetworkConfig();
      const server = new SorobanServer(network.rpcUrl); // Fixed
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

      const preparedTx = await server.prepareTransaction(tx);
      const signedXdr = await signTransaction(preparedTx.toXDR(), {
        networkPassphrase: network.networkPassphrase,
      });

      // Fixed: Removed 'new' keyword
      const res = await server.sendTransaction(
        TransactionBuilder.fromXDR(
          signedXdr.signedTxXdr,
          network.networkPassphrase,
        ),
      );

      if (res.status !== "PENDING")
        throw new Error(`Upload failed: ${res.status}`);

      const wasmHash = hash(wasmBuffer).toString("hex");

      addWasm({
        hash: wasmHash,
        name: wasmName || file.name,
        network: network.id,
        installedAt: Date.now(),
        functions: previewFunctions,
      });

      toast.success("WASM Uploaded & Saved!");
      setFile(null);
      setWasmName("");
    } catch (e: any) {
      console.error(e);
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
      const server = new SorobanServer(network.rpcUrl); // Fixed
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

      // Fixed: Removed 'new' keyword
      const res = await server.sendTransaction(
        TransactionBuilder.fromXDR(
          signedXdr.signedTxXdr,
          network.networkPassphrase,
        ),
      );

      if (res.status !== "PENDING") throw new Error("Deploy submission failed");

      // Poll for result
      let attempts = 0;
      while (attempts < 10) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await server.getTransaction(res.hash);
        if (status.status === "SUCCESS") {
          // Simplified status check
          toast.success("Contract Instantiated Successfully!");
          break;
        }
        attempts++;
      }
    } catch (e: any) {
      console.error(e);
      toast.error(`Deploy failed: ${e.message}`);
    } finally {
      setDeployingHash(null);
    }
  };

  return (
    <div className="container mx-auto space-y-8 p-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">WASM Registry</h1>
        <p className="text-muted-foreground">
          Upload, manage, and deploy contract code.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <Card className="h-fit lg:col-span-1">
          <CardHeader>
            <CardTitle>Install New Code</CardTitle>
            <CardDescription>
              Upload a .wasm file to the ledger.
            </CardDescription>
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
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wasms.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="h-24 text-center text-muted-foreground"
                    >
                      No WASM code uploaded yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  wasms.map((entry) => (
                    <TableRow key={entry.hash}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <FileCode className="h-4 w-4 text-blue-500" />
                          {entry.name}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {entry.hash.slice(0, 12)}...{entry.hash.slice(-12)}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDeploy(entry.hash)}
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
                            onClick={() =>
                              navigator.clipboard.writeText(entry.hash)
                            }
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="text-red-500 hover:text-red-600"
                            onClick={() => removeWasm(entry.hash)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
            {/* WASM Preview Card */}
            {file && (
              <div className="space-y-2 rounded-md border bg-muted/50 p-3">
                <Label className="text-[10px] font-bold uppercase">
                  WASM Preview
                </Label>
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
