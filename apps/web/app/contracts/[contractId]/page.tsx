"use client";

import { ChangeEvent, useEffect, useState } from "react";
import {
  ArrowLeft,
  Database,
  Clock,
  AlertCircle,
  CheckCircle2,
  FlaskConical,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";

import { ContractCallForm } from "@/components/contract-call-form";
import { ContractEvents } from "@/components/contract-events";
import { ContractStorage } from "@/components/contract-storage";
import { ContractUpgradeModal } from "@/components/contract-upgrade-modal";
import { TokenDashboard } from "@/components/token-dashboard";
import { fetchContractOverview, type ContractOverview } from "@/lib/contract-overview";
import { useAbiStore } from "@/store/useAbiStore";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useWallet } from "@/store/useWallet";
import {
  createNormalizedContractSpecFromFunctionNames,
  normalizeAbiJson,
  parseWasmMetadata,
} from "@devconsole/soroban-utils";
import { Alert, AlertDescription, AlertTitle } from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { Button } from "@devconsole/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import { Label } from "@devconsole/ui";
import { Skeleton } from "@devconsole/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@devconsole/ui";

export default function ContractDetailPage() {
  const params = useParams();
  const contractId = params.contractId as string;
  const { getActiveNetworkConfig } = useNetworkStore();
  const { getSpec, setSpec } = useAbiStore();
  const { activeWorkspaceId, addContractToWorkspace } = useWorkspaceStore();
  const { isConnected, isSandboxMode, enterSandbox } = useWallet();
  const spec = getSpec(contractId);

  const [overview, setOverview] = useState<ContractOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [isUploadingInterface, setIsUploadingInterface] = useState(false);

  const handleInterfaceUpload = async (
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploadingInterface(true);

    try {
      const lowerName = file.name.toLowerCase();

      if (lowerName.endsWith(".json")) {
        const text = await file.text();
        const parsed = normalizeAbiJson(JSON.parse(text));
        if (!parsed.functions.length) {
          toast.error("No functions discovered in ABI JSON.");
          return;
        }

        setSpec(contractId, { ...parsed, contractId });
        toast.success("Local ABI loaded. Interaction UI is ready.");
      } else if (lowerName.endsWith(".wasm")) {
        const arrayBuffer = await file.arrayBuffer();
        const functions = await parseWasmMetadata(arrayBuffer);
        if (!functions.length) {
          toast.error("No functions discovered in WASM metadata.");
          return;
        }

        setSpec(contractId, {
          ...createNormalizedContractSpecFromFunctionNames(
            functions,
            "wasm",
            "local-wasm",
          ),
          contractId,
        });
        toast.success("Local WASM interface loaded. Interaction UI is ready.");
      } else {
        toast.error("Unsupported file type. Please upload .json or .wasm.");
      }
    } catch (error: any) {
      console.error("Interface Upload Error:", error);
      toast.error(error?.message || "Failed to parse contract interface.");
    } finally {
      setIsUploadingInterface(false);
      event.target.value = "";
    }
  };

  useEffect(() => {
    let cancelled = false;

    async function loadOverview() {
      const cleanId = decodeURIComponent(contractId).trim();
      const network = getActiveNetworkConfig();

      try {
        const nextOverview = await fetchContractOverview(
          cleanId,
          network.id,
          network.rpcUrl,
        );

        if (cancelled) return;

        setOverview(nextOverview);
        if (nextOverview.exists) {
          addContractToWorkspace(activeWorkspaceId, cleanId);
        }
      } catch (error: any) {
        if (cancelled) return;

        setOverview({
          contractId: cleanId,
          network: network.id,
          rpcUrl: network.rpcUrl,
          exists: false,
          hasInterface: false,
          error: error?.message || "Failed to fetch contract data",
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    setLoading(true);
    void loadOverview();

    return () => {
      cancelled = true;
    };
  }, [contractId, getActiveNetworkConfig, activeWorkspaceId, addContractToWorkspace]);

  const interfaceStatus = spec?.functions.length
    ? "Loaded locally"
    : overview?.hasInterface
      ? "Detected on ledger"
      : "Not found";

  return (
    <div className="container mx-auto space-y-8 p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/contracts" className="shrink-0">
            <Button variant="outline" size="icon">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight">
              Contract Details
              {loading ? (
                <Skeleton className="h-6 w-20 shrink-0 rounded-full" />
              ) : overview?.exists ? (
                <Badge className="shrink-0 bg-green-600 hover:bg-green-700">
                  Active
                </Badge>
              ) : overview?.error ? (
                <Badge variant="destructive" className="shrink-0">
                  Error
                </Badge>
              ) : (
                <Badge variant="secondary" className="shrink-0">
                  Not Found
                </Badge>
              )}
            </h1>
            <p className="mt-1 truncate font-mono text-sm text-muted-foreground">
              {contractId}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-2">
          <ContractUpgradeModal contractId={contractId} />
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

      {overview?.error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Contract</AlertTitle>
          <AlertDescription>{overview.error}</AlertDescription>
        </Alert>
      )}

      {/* FE-043: sandbox entry prompt for anonymous users */}
      {!isConnected && !isSandboxMode && (
        <Alert>
          <FlaskConical className="h-4 w-4" />
          <AlertTitle>No wallet connected</AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              You can still explore and simulate contract functions without a wallet.
            </span>
            <Button variant="outline" size="sm" onClick={enterSandbox} className="shrink-0">
              <FlaskConical className="mr-1 h-3 w-3" />
              Enter Sandbox
            </Button>
          </AlertDescription>
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
          <TokenDashboard contractId={contractId} />

          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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
                ) : overview?.exists ? (
                  <>
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <span className="text-muted-foreground">Status:</span>
                      <span className="font-medium">Active</span>
                    </div>
                    {overview.lastModifiedLedger && (
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-blue-600" />
                        <span className="text-muted-foreground">Last Modified:</span>
                        <span className="font-mono text-xs">
                          Ledger #{overview.lastModifiedLedger}
                        </span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Network:</span>
                      <span className="font-medium">{overview.network}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Interface:</span>
                      <span className="font-medium">{interfaceStatus}</span>
                    </div>
                    <div className="space-y-2 border-t pt-4">
                      <Label htmlFor="interface-upload">Load local interface</Label>
                      <Input
                        id="interface-upload"
                        type="file"
                        accept=".json,.wasm"
                        disabled={isUploadingInterface}
                        onChange={handleInterfaceUpload}
                      />
                      <p className="text-xs text-muted-foreground">
                        Upload a local ABI JSON or WASM to drive the interaction form.
                      </p>
                    </div>
                  </>
                ) : (
                  <div className="space-y-3">
                    <div className="text-sm text-muted-foreground">
                      Contract not found on the selected network.
                    </div>
                    <div className="space-y-2 border-t pt-4">
                      <Label htmlFor="interface-upload">Load local interface</Label>
                      <Input
                        id="interface-upload"
                        type="file"
                        accept=".json,.wasm"
                        disabled={isUploadingInterface}
                        onChange={handleInterfaceUpload}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

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
