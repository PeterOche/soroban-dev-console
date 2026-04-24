"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWallet } from "@/store/useWallet";
import { useNetworkStore } from "@/store/useNetworkStore";
import { fetchRecentTransactions, NormalizedTx } from "@/lib/history-utils";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  Box,
  CheckCircle2,
  Clock,
  ExternalLink,
  Info,
  RefreshCw,
  WifiOff,
  XCircle,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@devconsole/ui";
import { Alert, AlertDescription, AlertTitle } from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { Button } from "@devconsole/ui";
import { ScrollArea } from "@devconsole/ui";

const POLL_INTERVAL_MS = 10_000;
const MAX_ITEMS = 20;

const HORIZON_URL: Record<string, string> = {
  mainnet: "https://horizon.stellar.org",
  testnet: "https://horizon-testnet.stellar.org",
  futurenet: "https://horizon-futurenet.stellar.org",
  local: "http://localhost:8000",
};

type FeedState = "idle" | "loading" | "ok" | "empty" | "account-missing" | "error" | "degraded";

export function TransactionFeed() {
  const { address, isConnected } = useWallet();
  const { currentNetwork } = useNetworkStore();

  const [txs, setTxs] = useState<NormalizedTx[]>([]);
  const [feedState, setFeedState] = useState<FeedState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const seenIds = useRef(new Set<string>());
  const cursorRef = useRef<string | undefined>(undefined);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);

  const horizonUrl = HORIZON_URL[currentNetwork] ?? HORIZON_URL.testnet;

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const reset = useCallback(() => {
    stopPolling();
    setTxs([]);
    setFeedState("idle");
    setErrorMsg(null);
    setLastUpdated(null);
    seenIds.current = new Set();
    cursorRef.current = undefined;
  }, []);

  const mergeTxs = (incoming: NormalizedTx[]) => {
    const fresh = incoming.filter((tx) => !seenIds.current.has(tx.id));
    fresh.forEach((tx) => seenIds.current.add(tx.id));
    if (fresh.length === 0) return;
    setTxs((prev) => [...fresh, ...prev].slice(0, MAX_ITEMS));
    setLastUpdated(new Date());
  };

  const poll = useCallback(
    async (isInitial = false) => {
      if (!mountedRef.current || !address) return;

      if (isInitial) setFeedState("loading");

      try {
        const { records } = await fetchRecentTransactions(
          address,
          horizonUrl,
          cursorRef.current,
        );

        if (!mountedRef.current) return;

        if (records.length > 0) {
          cursorRef.current = records[0].id; // track latest for next poll
          mergeTxs(records);
          setFeedState("ok");
        } else if (isInitial) {
          setFeedState("empty");
        }

        setErrorMsg(null);
      } catch (err: any) {
        if (!mountedRef.current) return;
        const status = err?.response?.status;
        if (status === 404) {
          setFeedState("account-missing");
        } else if (feedState === "ok") {
          // Already had data — mark degraded instead of full error
          setFeedState("degraded");
          setErrorMsg("Network issue — showing last known data.");
        } else {
          setFeedState("error");
          setErrorMsg(err?.message ?? "Failed to load transactions.");
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [address, horizonUrl],
  );

  // Reset on account/network change
  useEffect(() => {
    reset();
  }, [address, currentNetwork, reset]);

  // Start polling when connected
  useEffect(() => {
    if (!isConnected || !address) return;

    poll(true);
    pollRef.current = setInterval(() => poll(false), POLL_INTERVAL_MS);

    return stopPolling;
  }, [isConnected, address, poll]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, []);

  const handleRefresh = () => {
    reset();
    if (isConnected && address) {
      poll(true);
      pollRef.current = setInterval(() => poll(false), POLL_INTERVAL_MS);
    }
  };

  if (!isConnected) {
    return (
      <Card className="h-full border-dashed">
        <CardContent className="flex h-[300px] flex-col items-center justify-center gap-2 text-muted-foreground">
          <Activity className="h-8 w-8 opacity-50" />
          <p>Connect wallet to view transactions</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="flex h-full w-full flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-4 w-4 text-blue-500" />
              Transaction Feed
            </CardTitle>
            <CardDescription className="text-xs">
              Polling Horizon every {POLL_INTERVAL_MS / 1000}s • {currentNetwork}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <Badge variant="outline" className="font-mono text-[10px] opacity-70">
                Updated {lastUpdated.toLocaleTimeString()}
              </Badge>
            )}
            {feedState === "degraded" && (
              <Badge variant="outline" className="border-yellow-400 text-yellow-600 text-[10px]">
                <WifiOff className="mr-1 h-3 w-3" /> Degraded
              </Badge>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              title="Refresh"
              disabled={feedState === "loading"}
            >
              <RefreshCw className={`h-4 w-4 ${feedState === "loading" ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-[400px]">
          <div className="flex flex-col divide-y">
            {feedState === "account-missing" && (
              <div className="flex flex-col items-center justify-center gap-3 p-8 text-center text-sm text-muted-foreground">
                <AlertCircle className="h-8 w-8 text-orange-400 opacity-50" />
                <div>
                  <p className="font-semibold text-foreground">Account Not Found</p>
                  <p className="mt-1">
                    This account has not been funded on {currentNetwork} yet.
                  </p>
                </div>
              </div>
            )}

            {feedState === "error" && (
              <Alert variant="destructive" className="m-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMsg}</AlertDescription>
              </Alert>
            )}

            {feedState === "empty" && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No transactions found for this account on {currentNetwork}.
              </div>
            )}

            {feedState === "loading" && txs.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">
                Loading transactions…
              </div>
            )}

            {feedState === "degraded" && errorMsg && (
              <Alert className="m-4 border-yellow-400/50 bg-yellow-500/10">
                <WifiOff className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-700">{errorMsg}</AlertDescription>
              </Alert>
            )}

            {txs.map((tx) => (
              <div
                key={tx.id}
                className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50"
              >
                <div className="shrink-0">
                  {tx.successful ? (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/15">
                      <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                    </div>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-500/15">
                      <XCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
                    </div>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {tx.operationSummary}
                    </span>
                    <span className="font-mono text-xs text-muted-foreground">
                      {tx.hash.slice(0, 6)}…{tx.hash.slice(-6)}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(tx.createdAt).toLocaleTimeString()}
                    </span>
                    <span className="flex items-center gap-1">
                      <Box className="h-3 w-3" />
                      {tx.operationCount} Op{tx.operationCount !== 1 ? "s" : ""}
                    </span>
                    {tx.sourceAccount && (
                      <span className="font-mono truncate max-w-[120px]">
                        {tx.sourceAccount.slice(0, 6)}…
                      </span>
                    )}
                  </div>
                </div>

                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className="h-8 w-8 text-muted-foreground"
                  title="View details"
                >
                  <Link href={`/tx/${tx.hash}`}>
                    <Info className="h-4 w-4" />
                  </Link>
                </Button>

                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className="h-8 w-8 text-muted-foreground"
                >
                  <a
                    href={`https://stellar.expert/explorer/${currentNetwork}/tx/${tx.hash}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
