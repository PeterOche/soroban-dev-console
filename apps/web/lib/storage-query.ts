import { Address, StrKey, scValToNative, xdr } from "@stellar/stellar-sdk";

export type StorageKeyType = "symbol" | "string" | "address" | "i32";

export interface StorageQueryInput {
  contractId: string;
  keyType: StorageKeyType;
  keyValue: string;
}

export interface StorageQuery {
  contractId: string;
  keyType: StorageKeyType;
  keyValue: string;
  ledgerKeyXdr: string;
}

export interface StorageQueryResult {
  found: boolean;
  decodedValue?: string;
  lastModified?: number;
}

function toStorageScVal(type: StorageKeyType, value: string): xdr.ScVal {
  switch (type) {
    case "symbol":
      return xdr.ScVal.scvSymbol(value);
    case "string":
      return xdr.ScVal.scvString(value);
    case "i32": {
      const parsed = Number(value);
      if (!Number.isInteger(parsed)) {
        throw new Error("Value must be a valid i32 integer");
      }
      return xdr.ScVal.scvI32(parsed);
    }
    case "address":
      return new Address(value).toScVal();
  }
}

export function buildStorageQuery(input: StorageQueryInput): StorageQuery {
  const contractId = input.contractId.trim();
  const keyValue = input.keyValue.trim();

  if (!contractId) {
    throw new Error("Contract ID is required");
  }

  if (!StrKey.isValidContract(contractId)) {
    throw new Error("Invalid Contract ID format");
  }

  if (!keyValue) {
    throw new Error("Key value is required");
  }

  const ledgerKey = xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(contractId).toScAddress(),
      key: toStorageScVal(input.keyType, keyValue),
      durability: xdr.ContractDataDurability.persistent(),
    }),
  );

  return {
    contractId,
    keyType: input.keyType,
    keyValue,
    ledgerKeyXdr: ledgerKey.toXDR("base64"),
  };
}

export function decodeStorageQueryResult(
  entry: xdr.LedgerEntryData,
  lastModified?: number,
): StorageQueryResult {
  const contractData = entry.contractData();
  const rawVal = contractData.val();

  return {
    found: true,
    decodedValue: JSON.stringify(scValToNative(rawVal), null, 2),
    lastModified,
  };
}
