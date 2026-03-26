"use client";

import { useState, useEffect } from "react";
import { useWallet } from "@/store/useWallet";
import { walletProviderList, type WalletProviderId } from "@/lib/wallet/provider";
import { Button } from "@devconsole/ui";
import { Skeleton } from "@devconsole/ui";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@devconsole/ui";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@devconsole/ui";
import { Wallet, LogOut, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

export function ConnectWalletButton() {
  const { isConnected, address, walletType, connect, disconnect } = useWallet();

  const [isOpen, setIsOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const shortAddress = address
    ? `${address.slice(0, 4)}...${address.slice(-4)}`
    : "";

  const handleConnect = async (provider: WalletProviderId) => {
    try {
      await connect(provider);

      setIsOpen(false);
      toast.success("Wallet connected!");
    } catch (error: any) {
      console.error(error);
      toast.error(error.message || "Failed to connect wallet.");
    }
  };

  const handleCopy = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success("Address copied to clipboard!");
    }
  };

  if (!isMounted) {
    return <Skeleton className="h-9 w-[140px] rounded-md" />;
  }

  if (isConnected && address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2 font-mono">
            <div
              className={`h-2 w-2 rounded-full ${walletType === "freighter" ? "bg-purple-500" : "bg-orange-500"}`}
            />
            {shortAddress}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCopy} className="cursor-pointer">
            <Copy className="mr-2 h-4 w-4" />
            Copy Address
          </DropdownMenuItem>
          <DropdownMenuItem className="cursor-pointer" asChild>
            <a
              href={`https://stellar.expert/explorer/testnet/account/${address}`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              View on Explorer
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={disconnect}
            className="cursor-pointer text-red-600"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Disconnect
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button>Connect Wallet</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Connect your wallet</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          {walletProviderList.map((provider) => (
            <Button
              key={provider.id}
              variant="outline"
              className="h-16 justify-start gap-4 border-2 px-6 hover:border-primary/50"
              onClick={() => handleConnect(provider.id)}
            >
              <Wallet className={`h-6 w-6 ${provider.accentClassName}`} />
              <div className="flex flex-col items-start">
                <span className="font-semibold">{provider.label}</span>
                <span className="text-xs text-muted-foreground">
                  {provider.description}
                </span>
              </div>
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
