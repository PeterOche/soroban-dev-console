"use client";

import { useState, useEffect } from "react";
import {
  Contract,
  rpc as SorobanRpc,
  scValToNative,
  Address,
  xdr,
  TransactionBuilder,
  TimeoutInfinite,
} from "@stellar/stellar-sdk";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useSavedCallsStore } from "@/store/useSavedCallsStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@devconsole/ui";
import { Button } from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import { Label } from "@devconsole/ui";
import {
  Coins,
  Search,
  ArrowRightLeft,
  CreditCard,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { useWallet } from "@/store/useWallet";

interface TokenDashboardProps {
  contractId: string;
}

interface TokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
}

export function TokenDashboard({ contractId }: TokenDashboardProps) {
  const { getActiveNetworkConfig } = useNetworkStore();
  const { address } = useWallet();
  const { activeWorkspaceId } = useWorkspaceStore();
  const {
    savePreset,
    getPresetsForContract,
    applyPresetToCart,
    repairPresetNetwork,
  } = useSavedCallsStore();

  const [metadata, setMetadata] = useState<TokenMetadata | null>(null);
  const [loading, setLoading] = useState(true);
  const [isToken, setIsToken] = useState(false);

  // Balance Checker State
  const [checkAddress, setCheckAddress] = useState("");
  const [balance, setBalance] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const networkId = getActiveNetworkConfig().id;
  const presets = getPresetsForContract(contractId);

  const callView = async (method: string, args: any[] = []) => {
    const network = getActiveNetworkConfig();
    const server = new SorobanRpc.Server(network.rpcUrl);
    const contract = new Contract(contractId);

    // Use the connected wallet address, or fallback to a known funded testnet address
    const source =
      address || "GBZXN7PIRZGNMHGA7MUUUFFAUYVSF74BWXME4R37P2N6F5N4AUM5546F";

    const tx = new TransactionBuilder(
      {
        accountId: () => source,
        sequenceNumber: () => "0",
        incrementSequenceNumber: () => {},
      },
      { fee: "100", networkPassphrase: network.networkPassphrase },
    )
      .addOperation(contract.call(method, ...args))
      .setTimeout(TimeoutInfinite)
      .build();

    const sim = await server.simulateTransaction(tx);

    if (SorobanRpc.Api.isSimulationSuccess(sim) && sim.result?.retval) {
      return scValToNative(sim.result.retval);
    }
    throw new Error(`Failed to fetch ${method}`);
  };

  useEffect(() => {
    let isMounted = true;

    async function detectToken() {
      try {
        // Try to fetch symbol and decimals to verify if it's a token
        // We run these in parallel
        const [sym, dec, name] = await Promise.all([
          callView("symbol"),
          callView("decimals"),
          callView("name"),
        ]);

        if (isMounted) {
          setMetadata({
            symbol: sym?.toString() || "???",
            decimals: Number(dec),
            name: name?.toString() || "Unknown Token",
          });
          setIsToken(true);
        }
      } catch (e) {
        // If these calls fail, it's likely not a standard SAC token.
        // We just stay silent and don't render the component.
        console.log("Not a standard token contract or simulation failed.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    detectToken();

    return () => {
      isMounted = false;
    };
  }, [contractId, getActiveNetworkConfig]);

  const handleCheckBalance = async () => {
    if (!checkAddress) return;
    setChecking(true);
    setBalance(null);

    try {
      // SAC balance function expects an Address ScVal
      const addressArg = new Address(checkAddress).toScVal();

      const rawBalance = await callView("balance", [addressArg]);

      // Format based on decimals
      const divisor = Math.pow(10, metadata?.decimals || 7);
      const fmt = (Number(rawBalance) / divisor).toLocaleString(undefined, {
        maximumFractionDigits: metadata?.decimals,
      });

      setBalance(`${fmt} ${metadata?.symbol}`);
    } catch (e: any) {
      toast.error("Failed to fetch balance. Check the address.");
      console.error(e);
    } finally {
      setChecking(false);
    }
  };

  if (loading)
    return <div className="h-24 w-full animate-pulse rounded-xl bg-muted/20" />;

  if (!isToken || !metadata) return null;

  const createTokenPreset = (
    name: string,
    fnName: string,
    args: Array<{ name: string; type: "address" | "i128" | "symbol" | "string"; value: string }>,
  ) => {
    savePreset({
      name,
      contractId,
      fnName,
      args: args.map((arg) => ({ id: crypto.randomUUID(), ...arg })),
      network: networkId,
      source: "token",
    });
    toast.success("Preset saved");
  };

  return (
    <Card className="mb-6 border-blue-200 bg-blue-50/30 dark:border-blue-900 dark:bg-blue-900/10">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-blue-700 dark:text-blue-400">
              <Coins className="h-5 w-5" />
              Token Detected: {metadata.name}
            </CardTitle>
            <CardDescription>
              This contract implements the Stellar Asset Contract (SAC)
              interface.
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl font-bold">
              {metadata.symbol}
            </div>
            <div className="text-xs text-muted-foreground">
              {metadata.decimals} Decimals
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Quick Balance Checker */}
          <div className="space-y-2">
            <Label className="shrink-0 text-xs font-semibold uppercase text-muted-foreground">
              Quick Balance Check
            </Label>
            <div className="flex gap-2">
              <Input
                placeholder="Paste User Address (G...)"
                value={checkAddress}
                onChange={(e) => setCheckAddress(e.target.value)}
                className="bg-background font-mono text-xs"
              />
              <Button
                size="icon"
                onClick={handleCheckBalance}
                disabled={checking || !checkAddress}
              >
                {checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
              </Button>
            </div>

            {balance && (
              <div className="mt-2 flex items-center gap-3 rounded-md border bg-background p-3 animate-in fade-in slide-in-from-top-1">
                <CreditCard className="h-4 w-4 text-green-600" />
                <span className="font-mono text-sm font-bold">{balance}</span>
              </div>
            )}
          </div>

          {/* Quick Actions / Info */}
          <div className="space-y-2">
            <Label className="shrink-0 text-xs font-semibold uppercase text-muted-foreground">
              Standard Actions
            </Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() =>
                  createTokenPreset("Token transfer", "transfer", [
                    { name: "from", type: "address", value: address ?? "" },
                    { name: "to", type: "address", value: "" },
                    { name: "amount", type: "i128", value: "0" },
                  ])
                }
              >
                <ArrowRightLeft className="h-4 w-4" /> Save Transfer Preset
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={() =>
                  createTokenPreset("Token mint", "mint", [
                    { name: "to", type: "address", value: address ?? "" },
                    { name: "amount", type: "i128", value: "0" },
                  ])
                }
              >
                <Coins className="h-4 w-4" /> Save Mint Preset
              </Button>
            </div>

            {presets.length > 0 && (
              <div className="space-y-2 pt-1">
                {presets.slice(0, 4).map((preset) => {
                  const isStale = preset.network !== networkId;
                  return (
                    <div
                      key={preset.id}
                      className="flex items-center justify-between rounded-md border bg-background px-2 py-1"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium">{preset.name}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {preset.fnName} · {preset.network}
                          {isStale ? " · stale" : ""}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        {isStale && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              repairPresetNetwork(preset.id, networkId);
                              toast.success("Preset repaired for current network");
                            }}
                          >
                            Repair
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const call = applyPresetToCart(preset.id, {
                              workspaceId: activeWorkspaceId,
                            });
                            if (call) {
                              toast.success("Preset added to saved calls and batch cart");
                            }
                          }}
                        >
                          Add
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
