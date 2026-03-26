"use client";

import { useState, useEffect } from "react";
import { useNetworkStore } from "@/store/useNetworkStore";
import {
  buildStorageQuery,
  type StorageKeyType,
} from "@/lib/storage-query";
import {
  Copy,
  ExternalLink,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { Button } from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import { Label } from "@devconsole/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@devconsole/ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@devconsole/ui";
import { Alert, AlertDescription } from "@devconsole/ui";
import { toast } from "sonner";

export default function LedgerKeyCalculatorPage() {
  const { currentNetwork } = useNetworkStore();

  const [contractId, setContractId] = useState("");
  const [keyType, setKeyType] = useState<StorageKeyType>("symbol");
  const [keyValue, setKeyValue] = useState("");

  // Outputs
  const [xdrBase64, setXdrBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function calculateKey() {
    setError(null);
    setXdrBase64(null);

    if (!contractId || !keyValue) return;

    try {
      const query = buildStorageQuery({ contractId, keyType, keyValue });
      setXdrBase64(query.ledgerKeyXdr);
    } catch (e: any) {
      if (contractId && keyValue) {
        setError(e.message);
      }
    }
  }

  // Auto-calculate when inputs change
  useEffect(() => {
    calculateKey();
  }, [contractId, keyType, keyValue]);

  const copyToClipboard = () => {
    if (xdrBase64) {
      navigator.clipboard.writeText(xdrBase64);
      toast.success("XDR Key copied to clipboard");
    }
  };

  return (
    <div className="container max-w-3xl space-y-8 p-6">
      <div>
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          Ledger Key Calculator
        </h1>
        <p className="mt-2 text-muted-foreground">
          Generate the exact <code>LedgerKey</code> XDR needed to query contract
          storage or verifying state proofs.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        {/* Input Column */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Contract ID</Label>
                <Input
                  placeholder="C..."
                  value={contractId}
                  onChange={(e) => setContractId(e.target.value.trim())}
                  className="font-mono text-xs"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-1 space-y-2">
                  <Label>Key Type</Label>
                  <Select
                    value={keyType}
                    onValueChange={(v: any) => setKeyType(v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="symbol">Symbol</SelectItem>
                      <SelectItem value="string">String</SelectItem>
                      <SelectItem value="address">Address</SelectItem>
                      <SelectItem value="i32">i32 (Int)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Key Value</Label>
                  <Input
                    placeholder="e.g. Counter, Admin..."
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Alert className="bg-muted/50">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-xs text-muted-foreground">
              Note: This tool assumes <code>Persistent</code> storage durability
              by default, which is standard for most contract data.
            </AlertDescription>
          </Alert>
        </div>

        {/* Result Column */}
        <div className="space-y-6">
          <Card className="flex h-full flex-col">
            <CardHeader>
              <CardTitle>Calculated Key</CardTitle>
              <CardDescription>Base64 XDR Representation</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col">
              {error ? (
                <div className="flex flex-1 items-center justify-center rounded-md border border-red-200 bg-red-50 p-4 text-center text-sm text-red-500 dark:bg-red-900/10">
                  {error}
                </div>
              ) : !xdrBase64 ? (
                <div className="flex flex-1 items-center justify-center rounded-md border border-dashed bg-muted/20 text-sm text-muted-foreground">
                  Enter details to calculate...
                </div>
              ) : (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                  {/* Result Box */}
                  <div className="relative">
                    <div className="flex min-h-[100px] items-center break-all rounded-md bg-slate-950 p-4 font-mono text-xs text-slate-50">
                      {xdrBase64}
                    </div>
                    <Button
                      size="icon"
                      variant="secondary"
                      className="absolute right-2 top-2 h-6 w-6"
                      onClick={copyToClipboard}
                    >
                      <Copy className="h-3 w-3" />
                    </Button>
                  </div>

                  {/* Actions */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold uppercase text-muted-foreground">
                      External Tools
                    </Label>

                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      asChild
                    >
                      <a
                        href={`https://stellar.expert/explorer/${currentNetwork}/contract/${contractId}/storage`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="flex items-center gap-2">
                          <ExternalLink className="h-4 w-4" />
                          View Storage on Stellar.Expert
                        </span>
                        <ArrowRight className="h-4 w-4 opacity-50" />
                      </a>
                    </Button>

                    <Button
                      variant="outline"
                      className="w-full justify-between"
                      asChild
                    >
                      <a href="/tools/xdr" target="_blank">
                        <span className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4" />
                          Verify in XDR Decoder
                        </span>
                        <ArrowRight className="h-4 w-4 opacity-50" />
                      </a>
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
