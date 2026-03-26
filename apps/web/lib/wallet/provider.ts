import * as freighter from "@stellar/freighter-api";
import albedo from "@albedo-link/intent";

export type WalletProviderId = "freighter" | "albedo";

export interface WalletSession {
  provider: WalletProviderId;
  address: string;
}

export interface WalletProviderDefinition {
  id: WalletProviderId;
  label: string;
  description: string;
  accentClassName: string;
  connect: () => Promise<WalletSession>;
}

async function connectFreighter(): Promise<WalletSession> {
  if (freighter.isConnected) {
    const installed = await freighter.isConnected();
    if (!installed) {
      throw new Error(
        "Freighter is not installed. Please install the browser extension.",
      );
    }
  }

  if (freighter.isAllowed) {
    const allowedRes = await freighter.isAllowed();
    const hasAccess =
      typeof allowedRes === "object"
        ? Boolean((allowedRes as { isAllowed?: boolean }).isAllowed)
        : Boolean(allowedRes);

    if (!hasAccess && freighter.setAllowed) {
      await freighter.setAllowed();
    }
  }

  let finalAddress = "";

  if (freighter.getAddress) {
    const addrRes = await freighter.getAddress();
    finalAddress =
      typeof addrRes === "object"
        ? ((addrRes as { address?: string }).address ?? "")
        : addrRes;
  }

  if (!finalAddress && "getPublicKey" in freighter) {
    const publicKeyGetter = (freighter as typeof freighter & {
      getPublicKey?: () => Promise<string | { publicKey?: string }>;
    }).getPublicKey;

    if (publicKeyGetter) {
      const pubKeyRes = await publicKeyGetter();
      finalAddress =
        typeof pubKeyRes === "object"
          ? ((pubKeyRes as { publicKey?: string }).publicKey ?? "")
          : pubKeyRes;
    }
  }

  if (!finalAddress) {
    throw new Error(
      "Could not retrieve address. Make sure your Freighter wallet is unlocked.",
    );
  }

  return {
    provider: "freighter",
    address: finalAddress,
  };
}

async function connectAlbedo(): Promise<WalletSession> {
  const result = await albedo.publicKey({});
  return {
    provider: "albedo",
    address: result.pubkey,
  };
}

export const walletProviders: Record<WalletProviderId, WalletProviderDefinition> =
  {
    freighter: {
      id: "freighter",
      label: "Freighter",
      description: "Stellar's primary extension wallet",
      accentClassName: "text-purple-600",
      connect: connectFreighter,
    },
    albedo: {
      id: "albedo",
      label: "Albedo",
      description: "Web-based wallet, no extension required",
      accentClassName: "text-orange-600",
      connect: connectAlbedo,
    },
  };

export const walletProviderList = Object.values(walletProviders);
