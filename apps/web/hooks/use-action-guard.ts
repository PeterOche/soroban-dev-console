import { useWallet } from "@/store/useWallet";
import { usePathname } from "next/navigation";

export type ActionGuardStatus = {
  canSimulate: boolean;
  canSubmit: boolean;
  blockedReason: string | null;
  mode: "connected" | "sandbox" | "disconnected" | "read-only";
};

/**
 * FE-064: Unified action guard hook.
 * Detects session state (disconnected, sandbox, read-only) and returns 
 * blocking rationale for transaction-producing entry points.
 */
export function useActionGuard(): ActionGuardStatus {
  const { isConnected, isSandboxMode } = useWallet();
  const pathname = usePathname();

  const isReadOnly = pathname?.startsWith("/share/");

  if (isReadOnly) {
    return {
      canSimulate: false,
      canSubmit: false,
      blockedReason: "This workspace is in read-only mode. Fork it to enable interactions.",
      mode: "read-only",
    };
  }

  if (isSandboxMode) {
    return {
      canSimulate: true,
      canSubmit: false,
      blockedReason: "Transactions are disabled in sandbox mode. Connect a wallet to submit to the network.",
      mode: "sandbox",
    };
  }

  if (!isConnected) {
    return {
      canSimulate: false, // In disconnected mode, we encourage entering sandbox for simulation
      canSubmit: false,
      blockedReason: "Connect a wallet or enter sandbox mode to enable interactions.",
      mode: "disconnected",
    };
  }

  return {
    canSimulate: true,
    canSubmit: true,
    blockedReason: null,
    mode: "connected",
  };
}
