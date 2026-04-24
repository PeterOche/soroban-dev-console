import { xdr, StrKey } from "@stellar/stellar-sdk";
import ScVal from "@stellar/stellar-sdk";
import TransactionEnvelope from "@stellar/stellar-sdk";

export type XdrType = "TransactionEnvelope" | "ScVal" | "LedgerKey";

export function encodeJsonToXdr(jsonString: string, type: XdrType): string {
  try {
    const obj = JSON.parse(jsonString);

    switch (type) {
      case "TransactionEnvelope":
        return TransactionEnvelope.fromJSON(jsonString).toXDR();

      case "ScVal":
        // ScVal.fromJSON expects a very specific structure
        return ScVal.fromJSON(jsonString).toXDR("base64");

      case "LedgerKey":
        return xdr.LedgerKey.fromXDR(obj, "base64").toXDR("base64");

      default:
        throw new Error("Unsupported XDR type for encoding");
    }
  } catch (error: any) {
    throw new Error(`Encoding failed: ${error.message}`);
  }
}

/**
 * FE-049: Extract the real contract ID from a successful deploy transaction's
 * result XDR. The Soroban host returns the new contract address as an ScAddress
 * inside the transaction's return value.
 *
 * @param resultMetaXdr - base64-encoded TransactionMeta XDR from getTransaction
 * @returns Strkey-encoded contract ID (C…) or null if not found
 */
export function extractContractIdFromDeployResult(resultMetaXdr: string): string | null {
  try {
    const meta = xdr.TransactionMeta.fromXDR(resultMetaXdr, "base64");
    // v3 meta carries sorobanMeta with the return value
    const sorobanMeta = meta.v3().sorobanMeta();
    if (!sorobanMeta) return null;

    const returnValue = sorobanMeta.returnValue();
    // The return value of createCustomContract is ScVal::Address
    if (returnValue.switch().name !== "scvAddress") return null;

    const scAddress = returnValue.address();
    if (scAddress.switch().name !== "scAddressTypeContract") return null;

    const contractIdBytes = scAddress.contractId();
    return StrKey.encodeContract(contractIdBytes);
  } catch {
    return null;
  }
}
