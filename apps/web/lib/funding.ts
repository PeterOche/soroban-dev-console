import type { FundingProviderConfig } from "@/store/useNetworkStore";

export interface FundingResult {
  provider: FundingProviderConfig["type"];
  success: boolean;
  message: string;
  transactionHash?: string;
  raw?: unknown;
}

async function runFriendbot(address: string, endpoint: string): Promise<FundingResult> {
  const response = await fetch(`${endpoint}/?addr=${encodeURIComponent(address)}`);
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      (data && typeof data === "object" && "detail" in data && String((data as any).detail)) ||
      "Funding failed";
    throw new Error(detail);
  }

  return {
    provider: "friendbot",
    success: true,
    message: "Account funded successfully",
    transactionHash:
      data && typeof data === "object" && "hash" in data ? String((data as any).hash) : undefined,
    raw: data,
  };
}

async function runCustomHttp(address: string, endpoint: string): Promise<FundingResult> {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ address }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail =
      (data && typeof data === "object" && "message" in data && String((data as any).message)) ||
      "Funding failed";
    throw new Error(detail);
  }

  return {
    provider: "custom-http",
    success: true,
    message:
      (data && typeof data === "object" && "message" in data && String((data as any).message)) ||
      "Funding requested successfully",
    raw: data,
  };
}

export function canFundWithProvider(provider: FundingProviderConfig): boolean {
  return provider.type !== "none";
}

export async function fundWithProvider(
  address: string,
  provider: FundingProviderConfig,
): Promise<FundingResult> {
  if (provider.type === "none") {
    throw new Error("Funding is not supported on this network");
  }

  if (provider.type === "friendbot") {
    const endpoint = provider.endpoint ?? "https://friendbot.stellar.org";
    return runFriendbot(address, endpoint);
  }

  const endpoint = provider.endpoint;
  if (!endpoint) {
    throw new Error("Funding provider is missing endpoint configuration");
  }
  return runCustomHttp(address, endpoint);
}
