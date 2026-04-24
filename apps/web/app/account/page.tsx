"use client";

import { useEffect, useState, useCallback } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import {
  Wallet,
  RefreshCw,
  AlertCircle,
  Coins,
  Hash,
  Users,
  Activity,
  ArrowUpRight,
  Zap,
  WifiOff,
} from "lucide-react";

import { Button } from "@devconsole/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@devconsole/ui";
import { Skeleton } from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { Alert, AlertDescription, AlertTitle } from "@devconsole/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@devconsole/ui";
import { useWallet } from "@/store/useWallet";
import { useNetworkStore } from "@/store/useNetworkStore";
import { FundAccountButton } from "@/components/fund-account-button";

interface AssetBalance {
  asset_type: string;
  asset_code?: string;
  asset_issuer?: string;
  balance: string;
  limit?: string;
  buying_liabilities?: string;
  selling_liabilities?: string;
}

interface AccountData {
  accountId: string;
  sequence: string;
  balances: AssetBalance[];
  numSubentries: number;
  signers: Array<{ key: string; weight: number; type: string }>;
  thresholds: { low_threshold: number; med_threshold: number; high_threshold: number };
}

interface RecentOp {
  id: string;
  type: string;
  createdAt: string;
  /** human-readable summary */
  summary: string;
  txHash: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function opSummary(op: any, address: string): string {
  switch (op.type) {
    case "payment":
      return op.from === address
        ? `Sent ${op.amount} ${op.asset_code ?? "XLM"}`
        : `Received ${op.amount} ${op.asset_code ?? "XLM"}`;
    case "create_account":
      return `Created account ${op.account?.slice(0, 8)}…`;
    case "invoke_host_function":
      return "Invoked contract function";
    case "upload_contract_wasm":
      return "Uploaded WASM";
    case "create_contract":
      return "Deployed contract";
    case "change_trust":
      return `Changed trust for ${op.asset_code ?? "asset"}`;
    default:
      return op.type.replace(/_/g, " ");
  }
}

function opIcon(type: string) {
  if (type === "payment") return <ArrowUpRight className="h-4 w-4 text-blue-500" />;
  if (type === "create_account") return <Zap className="h-4 w-4 text-yellow-500" />;
  if (["invoke_host_function", "upload_contract_wasm", "create_contract"].includes(type))
    return <Zap className="h-4 w-4 text-purple-500" />;
  return <Activity className="h-4 w-4 text-muted-foreground" />;
}

// ── Disconnected state ────────────────────────────────────────────────────────

function DisconnectedState() {
  return (
    <div className="container mx-auto p-6">
      <div className="flex min-h-[400px] flex-col items-center justify-center gap-6">
        <WifiOff className="h-16 w-16 text-muted-foreground/40" />
        <div className="text-center">
          <h2 className="text-xl font-semibold">No Wallet Connected</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Connect your wallet to view balances, recent activity, and developer tools.
          </p>
        </div>
        <Alert className="max-w-md">
          <Wallet className="h-4 w-4" />
          <AlertTitle>Getting Started</AlertTitle>
          <AlertDescription>
            Use the wallet button in the top-right corner to connect Freighter or another
            Stellar wallet.
          </AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AccountDashboard() {
  const { isConnected, address } = useWallet();
  const { getActiveNetworkConfig, currentNetwork } = useNetworkStore();

  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [recentOps, setRecentOps] = useState<RecentOp[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAccountData = useCallback(async () => {
    if (!address) return;
    setLoading(true);
    setError("");

    try {
      const network = getActiveNetworkConfig();
      const horizonUrl = network.horizonUrl ?? "https://horizon-testnet.stellar.org";
      const server = new Horizon.Server(horizonUrl);

      const [account, opsPage] = await Promise.all([
        server.loadAccount(address),
        server.operations().forAccount(address).order("desc").limit(10).call(),
      ]);

      setAccountData({
        accountId: account.id,
        sequence: account.sequence,
        balances: account.balances as AssetBalance[],
        numSubentries: account.subentry_count,
        signers: account.signers.map((s: any) => ({
          key: s.key,
          weight: s.weight,
          type: s.type || "ed25519_public_key",
        })),
        thresholds: {
          low_threshold: account.thresholds.low_threshold,
          med_threshold: account.thresholds.med_threshold,
          high_threshold: account.thresholds.high_threshold,
        },
      });

      setRecentOps(
        (opsPage.records as any[]).map((op) => ({
          id: op.id,
          type: op.type,
          createdAt: op.created_at,
          summary: opSummary(op, address),
          txHash: op.transaction_hash,
        })),
      );
    } catch (err: any) {
      const is404 =
        err.message?.includes("404") ||
        err.message?.includes("not found") ||
        err.response?.status === 404;
      setError(
        is404
          ? "Account not found on the network. Fund it to get started."
          : err.message || "Failed to load account data",
      );
      setAccountData(null);
      setRecentOps([]);
    } finally {
      setLoading(false);
    }
  }, [address, getActiveNetworkConfig]);

  useEffect(() => {
    if (isConnected && address) fetchAccountData();
  }, [address, currentNetwork, fetchAccountData]);

  if (!isConnected || !address) return <DisconnectedState />;

  const xlmBalance = accountData?.balances.find((b) => b.asset_type === "native");
  const trustlines = accountData?.balances.filter((b) => b.asset_type !== "native") ?? [];

  // FE-052: network-aware capabilities
  const isTestnetLike = currentNetwork === "testnet" || currentNetwork === "futurenet";
  const explorerBase =
    currentNetwork === "mainnet"
      ? "https://stellar.expert/explorer/public/tx"
      : "https://stellar.expert/explorer/testnet/tx";

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Wallet className="h-8 w-8" />
            Account Dashboard
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{address}</p>
          <Badge variant="outline" className="mt-2">
            {currentNetwork.toUpperCase()}
          </Badge>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* FE-052: only show fund button on test networks */}
          {isTestnetLike && <FundAccountButton />}
          <Button onClick={fetchAccountData} disabled={loading} variant="outline" size="sm">
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Account</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{error}</p>
            {error.includes("not found") && isTestnetLike && (
              <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-foreground">
                  💡 Click <strong className="text-blue-500">"Get Testnet XLM"</strong> to fund
                  and create this account instantly.
                </p>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* XLM Balance */}
      <Card className="border-2 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            XLM Balance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-16 w-48" />
          ) : xlmBalance ? (
            <div className="space-y-1">
              <p className="text-4xl font-bold">
                {parseFloat(xlmBalance.balance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 7,
                })}{" "}
                <span className="text-2xl text-muted-foreground">XLM</span>
              </p>
              {parseFloat(xlmBalance.selling_liabilities ?? "0") > 0 && (
                <p className="text-sm text-muted-foreground">
                  Selling liabilities: {xlmBalance.selling_liabilities} XLM
                </p>
              )}
            </div>
          ) : (
            <p className="text-muted-foreground">No balance data available</p>
          )}
        </CardContent>
      </Card>

      {/* Info grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Hash className="h-5 w-5 text-blue-500" />
              Sequence Number
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-full" />
            ) : accountData ? (
              <p className="font-mono text-xl">{accountData.sequence}</p>
            ) : (
              <p className="text-muted-foreground">N/A</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-purple-500" />
              Signers
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-full" />
            ) : accountData ? (
              <div className="space-y-1">
                <p className="font-mono text-xl">
                  {accountData.signers.length} Signer
                  {accountData.signers.length !== 1 ? "s" : ""}
                </p>
                <p className="text-xs text-muted-foreground">
                  Thresholds — Low: {accountData.thresholds.low_threshold} / Med:{" "}
                  {accountData.thresholds.med_threshold} / High:{" "}
                  {accountData.thresholds.high_threshold}
                </p>
              </div>
            ) : (
              <p className="text-muted-foreground">N/A</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* FE-052: Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-orange-500" />
            Recent Activity
            {recentOps.length > 0 && (
              <Badge variant="secondary">{recentOps.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : recentOps.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Type</TableHead>
                    <TableHead>Summary</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Tx</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentOps.map((op) => (
                    <TableRow key={op.id}>
                      <TableCell>
                        <div className="flex items-center gap-1.5">
                          {opIcon(op.type)}
                          <span className="text-xs">{op.type.replace(/_/g, " ")}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{op.summary}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(op.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <a
                          href={`${explorerBase}/${op.txHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 font-mono text-xs text-blue-500 hover:underline"
                        >
                          {op.txHash.slice(0, 8)}…
                          <ArrowUpRight className="h-3 w-3" />
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                {accountData ? "No recent activity found." : "Connect and refresh to load activity."}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Trustlines */}
      {trustlines.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-green-500" />
              Assets & Trustlines
              <Badge variant="secondary">{trustlines.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Limit</TableHead>
                    <TableHead className="hidden md:table-cell">Issuer</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trustlines.map((t, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{t.asset_code ?? "Unknown"}</TableCell>
                      <TableCell className="font-mono">
                        {parseFloat(t.balance).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 7,
                        })}
                      </TableCell>
                      <TableCell className="font-mono">
                        {t.limit ? parseFloat(t.limit).toLocaleString() : "N/A"}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">
                        {t.asset_issuer ? (
                          <span title={t.asset_issuer}>
                            {t.asset_issuer.slice(0, 8)}…{t.asset_issuer.slice(-8)}
                          </span>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Additional details */}
      {accountData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm font-medium">Subentries</span>
              <span className="font-mono text-sm">{accountData.numSubentries}</span>
            </div>
            <div className="flex justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm font-medium">Total Assets</span>
              <span className="font-mono text-sm">{accountData.balances.length}</span>
            </div>
            {/* FE-052: network-aware developer tools */}
            {isTestnetLike && (
              <div className="flex justify-between rounded-lg bg-blue-500/10 p-3">
                <span className="text-sm font-medium text-blue-700">Developer Tools</span>
                <div className="flex gap-2">
                  <a
                    href={`https://stellar.expert/explorer/testnet/account/${address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
                  >
                    Explorer <ArrowUpRight className="h-3 w-3" />
                  </a>
                  <a
                    href={`https://laboratory.stellar.org/#account-creator?network=test`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-blue-500 hover:underline"
                  >
                    Laboratory <ArrowUpRight className="h-3 w-3" />
                  </a>
                </div>
              </div>
            )}
            {currentNetwork === "mainnet" && (
              <div className="flex justify-between rounded-lg bg-amber-500/10 p-3">
                <span className="text-sm font-medium text-amber-700">Mainnet</span>
                <a
                  href={`https://stellar.expert/explorer/public/account/${address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-xs text-amber-600 hover:underline"
                >
                  View on Explorer <ArrowUpRight className="h-3 w-3" />
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
