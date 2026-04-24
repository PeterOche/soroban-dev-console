"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useSavedCallsStore } from "@/store/useSavedCallsStore";
import { fetchTransactionByHash, type NormalizedTx } from "@/lib/history-utils";
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Copy,
  RotateCcw,
  Loader2,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { Button } from "@devconsole/ui";
import { toast } from "sonner";

const HORIZON_URL: Record<string, string> = {
  mainnet: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
  local: "http://localhost:8000",
};

export default function TxDetailPage() {
  const { hash } = useParams<{ hash: string }>();
  const router = useRouter();
  const { currentNetwork } = useNetworkStore();
  const { savedCalls, addToCart } = useSavedCallsStore();

  const [tx, setTx] = useState<NormalizedTx | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const horizonUrl = HORIZON_URL[currentNetwork] ?? HORIZON_URL.testnet;

  useEffect(() => {
    if (!hash) return;
    setLoading(true);
    setError(null);
    fetchTransactionByHash(hash, horizonUrl)
      .then((result) => {
        if (result) {
          setTx(result);
        } else {
          setError("Transaction not found.");
        }
      })
      .catch((e) => setError(e.message ?? "Failed to load transaction."))
      .finally(() => setLoading(false));
  }, [hash, horizonUrl]);

  // FE-046: Find saved calls that match this tx's source account for replay
  const replayableCalls = savedCalls.filter(
    (c) => c.network === currentNetwork,
  );

  const handleReplay = (callId: string) => {
    const call = savedCalls.find((c) => c.id === callId);
    if (!call) return;
    addToCart(call);
    toast.success(`"${call.name}" added to tx-builder cart`);
    router.push("/tx-builder");
  };

  const copyHash = () => {
    navigator.clipboard.writeText(hash);
    toast.success("Hash copied");
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !tx) {
    return (
      <div className="container mx-auto p-6">
        <Button variant="ghost" size="sm" asChild className="mb-4">
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Link>
        </Button>
        <p className="text-sm text-destructive">{error ?? "Transaction not found."}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/">
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Link>
        </Button>
        <h1 className="text-xl font-semibold">Transaction Detail</h1>
        {tx.successful ? (
          <Badge className="bg-green-500/15 text-green-700">
            <CheckCircle2 className="mr-1 h-3 w-3" /> Success
          </Badge>
        ) : (
          <Badge variant="destructive">
            <XCircle className="mr-1 h-3 w-3" /> Failed
          </Badge>
        )}
      </div>

      {/* Core fields */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Summary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="Hash">
            <span className="font-mono break-all">{tx.hash}</span>
            <Button variant="ghost" size="icon" className="ml-2 h-6 w-6" onClick={copyHash}>
              <Copy className="h-3 w-3" />
            </Button>
          </Row>
          <Row label="Operation">{tx.operationSummary}</Row>
          <Row label="Operations">{tx.operationCount}</Row>
          <Row label="Source">
            <span className="font-mono">{tx.sourceAccount || "—"}</span>
          </Row>
          <Row label="Fee">{tx.feePaid} stroops</Row>
          <Row label="Time">{new Date(tx.createdAt).toLocaleString()}</Row>
          <Row label="Network">{currentNetwork}</Row>
          <Row label="Explorer">
            <a
              href={`https://stellar.expert/explorer/${currentNetwork}/tx/${tx.hash}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 text-primary underline-offset-2 hover:underline"
            >
              stellar.expert <ExternalLink className="h-3 w-3" />
            </a>
          </Row>
        </CardContent>
      </Card>

      {/* FE-046: Replay surface */}
      {replayableCalls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Replay</CardTitle>
            <CardDescription>
              Add a saved call to the tx-builder to replay or rehydrate this flow.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {replayableCalls.map((call) => (
              <div
                key={call.id}
                className="flex items-center justify-between rounded-md border px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium">{call.name || call.fnName}</span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {call.fnName}({call.args.length} args)
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReplay(call.id)}
                >
                  <RotateCcw className="mr-1 h-3 w-3" /> Replay
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span className="w-28 shrink-0 text-muted-foreground">{label}</span>
      <span className="flex items-center">{children}</span>
    </div>
  );
}
