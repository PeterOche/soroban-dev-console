"use client";

import { useState } from "react";
import { useWallet } from "@/store/useWallet";
import { useNetworkStore } from "@/store/useNetworkStore";
import { canFundWithProvider, fundWithProvider } from "@/lib/funding";
import { Button } from "@devconsole/ui";
import { Loader2, Coins } from "lucide-react";
import { toast } from "sonner";

export function FundAccountButton() {
  const { address, isConnected } = useWallet();
  const { getFundingProvider } = useNetworkStore();
  const [isLoading, setIsLoading] = useState(false);

  const provider = getFundingProvider();
  const canFund = canFundWithProvider(provider);

  if (!isConnected || !address || !canFund) {
    return null;
  }

  const handleFund = async () => {
    setIsLoading(true);
    const toastId = toast.loading("Requesting account funding...");

    try {
      const result = await fundWithProvider(address, provider);
      toast.success(result.message, {
        id: toastId,
      });

      setTimeout(() => window.location.reload(), 2000);
    } catch (error: any) {
      toast.error(`Funding failed: ${error.message}`, { id: toastId });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="secondary"
      onClick={handleFund}
      disabled={isLoading}
      className="gap-2 bg-blue-100 text-blue-700 hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/50"
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Coins className="h-4 w-4" />
      )}
      {isLoading ? "Funding..." : provider.label ?? "Fund Account"}
    </Button>
  );
}
