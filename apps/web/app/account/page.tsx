      const horizonUrl = network.horizonUrl ?? "https://horizon-testnet.stellar.org";"use client";

import { useEffect, useState } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import {
  Wallet,
  RefreshCw,
  AlertCircle,
  Coins,
  Hash,
  Users,
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
  thresholds: {
    low_threshold: number;
    med_threshold: number;
    high_threshold: number;
  };
}

export default function AccountDashboard() {
  const { isConnected, address } = useWallet();
  const { getActiveNetworkConfig, currentNetwork } = useNetworkStore();

  const [accountData, setAccountData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const fetchAccountData = async () => {
    if (!address) {
      setError("No wallet connected");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const network = getActiveNetworkConfig();

      const horizonUrl = network.horizonUrl ?? "https://horizon-testnet.stellar.org";
      const server = new Horizon.Server(horizonUrl);

      const account = await server.loadAccount(address);

      setAccountData({
        accountId: account.id,
        sequence: account.sequence,
        balances: account.balances as AssetBalance[],
        numSubentries: account.subentry_count,
        signers: account.signers.map((signer: any) => ({
          key: signer.key,
          weight: signer.weight,
          type: signer.type || "ed25519_public_key",
        })),
        thresholds: {
          low_threshold: account.thresholds.low_threshold,
          med_threshold: account.thresholds.med_threshold,
          high_threshold: account.thresholds.high_threshold,
        },
      });
    } catch (err: any) {
      const is404 =
        err.message?.includes("404") ||
        err.message?.includes("not found") ||
        err.response?.status === 404;

      if (is404) {
        setError(
          "Account not found on the network. This is common on Testnet if the account hasn't been funded yet.",
        );
      } else {
        console.error("Failed to fetch account:", err);
        setError(err.message || "Failed to load account data");
      }
      setAccountData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isConnected && address) {
      fetchAccountData();
    }
  }, [address, currentNetwork]);

  // Get XLM (native) balance
  const xlmBalance = accountData?.balances.find(
    (b) => b.asset_type === "native",
  );

  // Get trustline balances (non-native assets)
  const trustlines =
    accountData?.balances.filter((b) => b.asset_type !== "native") || [];

  if (!isConnected || !address) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <Alert className="max-w-md">
            <Wallet className="h-4 w-4" />
            <AlertTitle>Wallet Not Connected</AlertTitle>
            <AlertDescription>
              Please connect your wallet using the button in the top right
              corner to view your account dashboard.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Wallet className="h-8 w-8" />
            Account Dashboard
          </h1>
          <p className="mt-1 font-mono text-sm text-muted-foreground">
            {address}
          </p>
          <Badge variant="outline" className="mt-2">
            {currentNetwork.toUpperCase()}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <FundAccountButton />
          <Button
            onClick={fetchAccountData}
            disabled={loading}
            variant="outline"
            size="sm"
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error Loading Account</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{error}</p>
            {error.includes("not found") && (
              <div className="mt-3 rounded-md border border-destructive/20 bg-destructive/10 p-3">
                <p className="text-sm font-medium text-foreground">
                  💡 Click the{" "}
                  <strong className="text-blue-500">"Get Testnet XLM"</strong>{" "}
                  button in the top right to instantly fund and create this
                  account!
                </p>
              </div>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* XLM Balance - Prominent Display */}
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
            <div className="space-y-2">
              <p className="text-4xl font-bold">
                {parseFloat(xlmBalance.balance).toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 7,
                })}{" "}
                <span className="text-2xl text-muted-foreground">XLM</span>
              </p>
              {xlmBalance.buying_liabilities &&
                parseFloat(xlmBalance.buying_liabilities) > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Buying Liabilities: {xlmBalance.buying_liabilities} XLM
                  </p>
                )}
              {xlmBalance.selling_liabilities &&
                parseFloat(xlmBalance.selling_liabilities) > 0 && (
                  <p className="text-sm text-muted-foreground">
                    Selling Liabilities: {xlmBalance.selling_liabilities} XLM
                  </p>
                )}
            </div>
          ) : (
            <p className="text-muted-foreground">No balance data available</p>
          )}
        </CardContent>
      </Card>

      {/* Account Info Grid */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Sequence Number */}
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

        {/* Signer Count */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5 text-purple-500" />
              Signer Count
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-full" />
            ) : accountData ? (
              <div className="space-y-2">
                <p className="font-mono text-xl">
                  {accountData.signers.length} Signer
                  {accountData.signers.length !== 1 ? "s" : ""}
                </p>
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>Low Threshold: {accountData.thresholds.low_threshold}</p>
                  <p>
                    Medium Threshold: {accountData.thresholds.med_threshold}
                  </p>
                  <p>High Threshold: {accountData.thresholds.high_threshold}</p>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground">N/A</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Trustlines Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Coins className="h-5 w-5 text-green-500" />
            Assets & Trustlines
            {trustlines.length > 0 && (
              <Badge variant="secondary">{trustlines.length}</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : trustlines.length > 0 ? (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Asset Code</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Limit</TableHead>
                    <TableHead className="hidden md:table-cell">
                      Issuer
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trustlines.map((trustline, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-medium">
                        {trustline.asset_code || "Unknown"}
                      </TableCell>
                      <TableCell className="font-mono">
                        {parseFloat(trustline.balance).toLocaleString(
                          undefined,
                          {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 7,
                          },
                        )}
                      </TableCell>
                      <TableCell className="font-mono">
                        {trustline.limit
                          ? parseFloat(trustline.limit).toLocaleString()
                          : "N/A"}
                      </TableCell>
                      <TableCell className="hidden font-mono text-xs md:table-cell">
                        {trustline.asset_issuer ? (
                          <span title={trustline.asset_issuer}>
                            {trustline.asset_issuer.slice(0, 8)}...
                            {trustline.asset_issuer.slice(-8)}
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
          ) : (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">
                No trustlines found. This account only holds native XLM.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Additional Account Details */}
      {accountData && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Additional Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm font-medium">Subentries</span>
              <span className="font-mono text-sm">
                {accountData.numSubentries}
              </span>
            </div>
            <div className="flex justify-between rounded-lg bg-muted/50 p-3">
              <span className="text-sm font-medium">Total Assets</span>
              <span className="font-mono text-sm">
                {accountData.balances.length}
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
