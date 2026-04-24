import { Horizon } from "@stellar/stellar-sdk";

export interface NormalizedTx {
  id: string;
  hash: string;
  successful: boolean;
  createdAt: string;
  operationCount: number;
  operationSummary: string;
  sourceAccount: string;
  feePaid: number;
}

function summarizeOpType(opType: string): string {
  const map: Record<string, string> = {
    payment: "Payment",
    create_account: "Create Account",
    invoke_host_function: "Contract Call",
    change_trust: "Change Trust",
    manage_sell_offer: "Sell Offer",
    manage_buy_offer: "Buy Offer",
    path_payment_strict_send: "Path Payment",
    path_payment_strict_receive: "Path Payment",
    set_options: "Set Options",
    account_merge: "Account Merge",
    manage_data: "Manage Data",
    bump_sequence: "Bump Sequence",
    create_claimable_balance: "Claimable Balance",
    claim_claimable_balance: "Claim Balance",
    begin_sponsoring_future_reserves: "Begin Sponsoring",
    end_sponsoring_future_reserves: "End Sponsoring",
    revoke_sponsorship: "Revoke Sponsorship",
    clawback: "Clawback",
    set_trust_line_flags: "Set Trust Flags",
    liquidity_pool_deposit: "LP Deposit",
    liquidity_pool_withdraw: "LP Withdraw",
    extend_footprint_ttl: "Extend TTL",
    restore_footprint: "Restore Footprint",
  };
  return map[opType] ?? opType;
}

export function normalizeTx(record: any): NormalizedTx {
  const opType = record.type ?? record.operation_type ?? "unknown";
  return {
    id: record.transaction_hash ?? record.id,
    hash: record.transaction_hash ?? record.id,
    successful: record.transaction_successful ?? record.successful ?? true,
    createdAt: record.created_at,
    operationCount: record.operation_count ?? 1,
    operationSummary: summarizeOpType(opType),
    sourceAccount: record.source_account ?? record.from ?? "",
    feePaid: Number(record.fee_charged ?? 0),
  };
}

export async function fetchRecentTransactions(
  address: string,
  horizonUrl: string,
  cursor?: string,
): Promise<{ records: NormalizedTx[]; nextCursor: string | null }> {
  const server = new Horizon.Server(horizonUrl);

  const builder = server.payments().forAccount(address).limit(20).order("desc");
  if (cursor) builder.cursor(cursor);

  const response = await builder.call();
  const records = response.records.map(normalizeTx);

  // Deduplicate by id
  const seen = new Set<string>();
  const unique = records.filter((r) => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });

  const nextCursor =
    unique.length > 0 ? unique[unique.length - 1].id : null;

  return { records: unique, nextCursor };
}

// ── FE-047: Backend-assisted transaction polling ──────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type TxPollStatus = "pending" | "success" | "failed" | "not_found";

export interface TxPollResult {
  hash: string;
  status: TxPollStatus;
  /** Normalized tx if resolved */
  tx?: NormalizedTx;
  error?: string;
}

/**
 * Poll transaction status via the backend RPC proxy.
 * Falls back to direct Horizon lookup if the API is unreachable.
 */
export async function pollTransactionStatus(
  hash: string,
  horizonUrl: string,
  maxAttempts = 12,
  intervalMs = 2500,
): Promise<TxPollResult> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, intervalMs));

    // Try backend proxy first
    try {
      const res = await fetch(`${API_BASE}/rpc/tx/${hash}`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as { status: string; result?: any };
        if (data.status === "SUCCESS" && data.result) {
          return { hash, status: "success", tx: normalizeTx(data.result) };
        }
        if (data.status === "FAILED") {
          return { hash, status: "failed", error: "Transaction failed on-chain" };
        }
        // PENDING — continue polling
        continue;
      }
    } catch {
      // API unreachable — fall through to Horizon fallback
    }

    // Horizon fallback
    try {
      const res = await fetch(`${horizonUrl}/transactions/${hash}`);
      if (res.status === 404) continue;
      if (res.ok) {
        const data = await res.json();
        return {
          hash,
          status: data.successful ? "success" : "failed",
          tx: normalizeTx(data),
        };
      }
    } catch {
      // network error — keep retrying
    }
  }
  return { hash, status: "not_found", error: "Timed out waiting for transaction" };
}

/**
 * Fetch a single transaction by hash, trying backend proxy then Horizon.
 */
export async function fetchTransactionByHash(
  hash: string,
  horizonUrl: string,
): Promise<NormalizedTx | null> {
  try {
    const res = await fetch(`${API_BASE}/rpc/tx/${hash}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) {
      const data = await res.json();
      if (data.result) return normalizeTx(data.result);
    }
  } catch {
    // fall through
  }
  try {
    const res = await fetch(`${horizonUrl}/transactions/${hash}`);
    if (res.ok) return normalizeTx(await res.json());
  } catch {
    // ignore
  }
  return null;
}
