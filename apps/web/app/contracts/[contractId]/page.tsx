"use client";

import { useEffect, useState, ChangeEvent } from "react";
import { rpc as SorobanRpc, Address, xdr, StrKey } from "@stellar/stellar-sdk";
import {
  ArrowLeft,
  Box,
  Database,
  Clock,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import Link from "next/link";

import { ContractStorage } from "@/components/contract-storage";
import { ContractCallForm } from "@/components/contract-call-form";
import { ContractEvents } from "@/components/contract-events";
import { TokenDashboard } from "@/components/token-dashboard";
import { ContractUpgradeModal } from "@/components/contract-upgrade-modal";
import { useNetworkStore } from "@/store/useNetworkStore";

// UI
import { Button } from "@devconsole/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@devconsole/ui";
import { Skeleton } from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { Alert, AlertDescription, AlertTitle } from "@devconsole/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@devconsole/ui";
import { useParams } from "next/navigation";
import { Input } from "@devconsole/ui";
import { Label } from "@devconsole/ui";
import { toast } from "sonner";
import { useAbiStore } from "@/store/useAbiStore";
import {
  createNormalizedContractSpecFromFunctionNames,
  normalizeAbiJson,
  parseWasmMetadata,
} from "@devconsole/soroban-utils";

interface ContractData {
  exists: boolean;
  wasmHash?: string;
  lastModified?: number;
  ledgerSeq?: number;
}

export default function ContractDetailPage() {
  const params = useParams();
  const contractId = params.contractId as string;
  const { getActiveNetworkConfig } = useNetworkStore();
  const { setSpec } = useAbiStore();

  const [data, setData] = useState<ContractData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isUploadingInterface, setIsUploadingInterface] = useState(false);

  const handleInterfaceUpload = async (
    e: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingInterface(true);

    try {
      const name = file.name.toLowerCase();

      if (name.endsWith(".json")) {
        const text = await file.text();
        const json = JSON.parse(text);
        const spec = normalizeAbiJson(json);

        if (!spec.functions.length) {
          toast.error("No functions discovered in ABI JSON.");
          return;
        }

        setSpec(contractId, { ...spec, contractId });

        toast.success("Local ABI loaded. Interaction UI is ready.");
      } else if (name.endsWith(".wasm")) {
        const arrayBuffer = await file.arrayBuffer();
        const functions = await parseWasmMetadata(arrayBuffer);

        if (!functions.length) {
          toast.error("No functions discovered in WASM metadata.");
          return;
        }

        setSpec(
          contractId,
          {
            ...createNormalizedContractSpecFromFunctionNames(
              functions,
              "wasm",
              "local-wasm",
            ),
            contractId,
          },
        );

        toast.success("Local WASM interface loaded. Interaction UI is ready.");
      } else {
        toast.error("Unsupported file type. Please upload .json or .wasm.");
      }
    } catch (err: any) {
      console.error("Interface Upload Error:", err);
      toast.error(err.message || "Failed to parse contract interface.");
    } finally {
      setIsUploadingInterface(false);
      // Reset input so the same file can be chosen again if needed
      e.target.value = "";
    }
  };

  useEffect(() => {
    async function fetchContract() {
      if (!contractId) return;

      try {
        const network = getActiveNetworkConfig();
        const server = new SorobanRpc.Server(network.rpcUrl);
        const cleanId = decodeURIComponent(contractId).trim();
        if (!StrKey.isValidContract(cleanId)) {
          throw new Error(
            "Invalid Contract ID format. Must be a 56-character string starting with C.",
          );
        }

        const ledgerKey = xdr.LedgerKey.contractData(
          new xdr.LedgerKeyContractData({
            contract: new Address(cleanId).toScAddress(),
            key: xdr.ScVal.scvLedgerKeyContractInstance(),
            durability: xdr.ContractDataDurability.persistent(),
          }),
        );

        const response = await server.getLedgerEntries(ledgerKey);

        if (!response.entries || response.entries.length === 0) {
          setData({ exists: false });
        } else {
          const entry = response.entries[0];
          setData({
            exists: true,
            lastModified: entry.lastModifiedLedgerSeq,
            ledgerSeq: entry.lastModifiedLedgerSeq,
          });
        }
      } catch (err: any) {
        console.error("Contract Fetch Error:", err);
        setError(err.message || "Failed to fetch contract data");
      } finally {
        setLoading(false);
      }
    }

    fetchContract();
  }, [contractId, getActiveNetworkConfig]);

  return (
    <div className="container mx-auto space-y-8 p-6">
      {/* Navigation Header */}
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          {/* ADDED shrink-0 HERE */}
          <Link href="/contracts" className="shrink-0">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          {/* ADDED min-w-0 HERE */}
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
              Contract Details
              {loading ? (
                <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
              ) : data?.exists ? (
                <Badge className="shrink-0 bg-green-600 hover:bg-green-700">
                  Active
                </Badge>
              ) : error ? (
                <Badge variant="destructive" className="shrink-0">
                  Error
                </Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0">
                  Not Found
                </Badge>
              )}
            </h1>
            {/* ADDED truncate HERE instead of break-all */}
            <p className="mt-1 truncate font-mono text-sm text-muted-foreground">
              {contractId}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex shrink-0 gap-2">
          <ContractUpgradeModal contractId={contractId as string} />

          <Button variant="outline" asChild>
            <a
              href={`https://stellar.expert/explorer/testnet/contract/${contractId}`}
              target="_blank"
              rel="noreferrer"
            >
              View on Explorer
            </a>
          </Button>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Contract</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview & Interaction</TabsTrigger>
          <TabsTrigger value="storage">Storage</TabsTrigger>
          <TabsTrigger value="events">Events</TabsTrigger>
          <TabsTrigger value="code" disabled>
            Code (Coming Soon)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          {/* Token Dashboard - appears only for SAC contracts */}
          <TokenDashboard contractId={contractId} />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            {/* Contract Overview Card */}
            <Card className="min-w-0 md:col-span-1">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-5 w-5" />
                  Contract Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {loading ? (
                  <>
                    <Skeleton className="h-4 w-full" />
                    <Skeleton className="h-4 w-3/4" />
                  </>
                ) : data?.exists ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-muted-foreground">Status:</span>
                      <span className="font-medium">Active</span>
                    </div>
                    {data.ledgerSeq && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="text-muted-foreground">
                          Last Modified:
                        </span>
                        <span className="font-mono text-xs">
                          Ledger #{data.ledgerSeq}
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground">
                    Contract not found on network
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contract Interaction Form */}
            <div className="min-w-0 md:col-span-2">
              <ContractCallForm contractId={contractId} />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="storage">
          <ContractStorage contractId={contractId} />
        </TabsContent>

        <TabsContent value="events">
          <ContractEvents contractId={contractId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
