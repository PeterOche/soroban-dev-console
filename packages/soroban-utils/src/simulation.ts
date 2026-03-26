import { Address, rpc as SorobanRpc } from "@stellar/stellar-sdk";

type SimulationSuccess = SorobanRpc.Api.SimulateTransactionSuccessResponse;
type SimulationResponse = SorobanRpc.Api.SimulateTransactionResponse;

export interface NormalizedSimulationAuth {
  address: string;
  kind: "account" | "contract" | "unknown";
}

export interface NormalizedSimulationResult {
  ok: boolean;
  error?: string;
  minResourceFee?: string;
  resultXdr?: string;
  auth: NormalizedSimulationAuth[];
  requiredAuthKeys: string[];
  stateChangesCount: number;
  stateChanges: NonNullable<SimulationSuccess["stateChanges"]>;
  cpuInsns?: number;
  memBytes?: number;
}

function normalizeAuth(
  sim: SimulationSuccess,
): Pick<NormalizedSimulationResult, "auth" | "requiredAuthKeys"> {
  const auth =
    sim.result?.auth?.flatMap((entry) => {
      try {
        const credentials = entry.credentials();
        if (credentials.switch().name !== "sorobanCredentialsAddress") {
          return [];
        }

        const authAddress = credentials.address().address();
        const kind =
          authAddress.switch().name === "scAddressTypeAccount"
            ? "account"
            : authAddress.switch().name === "scAddressTypeContract"
              ? "contract"
              : "unknown";

        return [
          {
            address: Address.fromScAddress(authAddress).toString(),
            kind,
          } satisfies NormalizedSimulationAuth,
        ];
      } catch {
        return [];
      }
    }) ?? [];

  return {
    auth,
    requiredAuthKeys: auth
      .filter((entry) => entry.kind === "account" && entry.address.startsWith("G"))
      .map((entry) => entry.address),
  };
}

function normalizeResourceUsage(
  sim: SimulationSuccess,
): Pick<NormalizedSimulationResult, "cpuInsns" | "memBytes"> {
  const maybePayload = sim as SimulationSuccess & Record<string, unknown>;
  const maybeCost = maybePayload["cost"] as
    | {
        cpuInsns?: string | number;
        cpuInstructions?: string | number;
        cpu_insns?: string | number;
        memBytes?: string | number;
        mem_bytes?: string | number;
      }
    | undefined;

  const cpuInsns = Number(
    maybeCost?.cpuInsns ?? maybeCost?.cpuInstructions ?? maybeCost?.cpu_insns,
  );
  const memBytes = Number(maybeCost?.memBytes ?? maybeCost?.mem_bytes);

  if (Number.isFinite(cpuInsns) && Number.isFinite(memBytes)) {
    return { cpuInsns, memBytes };
  }

  try {
    const resources = sim.transactionData.build().resources();
    const fallbackCpu = Number(resources.instructions());
    const fallbackMem =
      Number(resources.diskReadBytes()) + Number(resources.writeBytes());

    return {
      cpuInsns: Number.isFinite(fallbackCpu) ? fallbackCpu : undefined,
      memBytes: Number.isFinite(fallbackMem) ? fallbackMem : undefined,
    };
  } catch {
    return {};
  }
}

export function normalizeSimulationResult(
  sim: SimulationResponse,
): NormalizedSimulationResult {
  if (!SorobanRpc.Api.isSimulationSuccess(sim)) {
    return {
      ok: false,
      error: sim.error || "Unknown simulation error",
      auth: [],
      requiredAuthKeys: [],
      stateChangesCount: 0,
      stateChanges: [],
    };
  }

  return {
    ok: true,
    minResourceFee: sim.minResourceFee,
    resultXdr: sim.result?.retval?.toXDR("base64"),
    stateChangesCount: sim.stateChanges?.length ?? 0,
    stateChanges: sim.stateChanges ?? [],
    ...normalizeAuth(sim),
    ...normalizeResourceUsage(sim),
  };
}
