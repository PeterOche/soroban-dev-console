"use client";

import { useState } from "react";
import { rpc as SorobanRpc, xdr } from "@stellar/stellar-sdk";
import {
  buildStorageQuery,
  decodeStorageQueryResult,
  type StorageKeyType,
} from "@/lib/storage-query";
import { useNetworkStore } from "@/store/useNetworkStore";
import { Button } from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@devconsole/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@devconsole/ui";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@devconsole/ui";
import { Plus, Trash2, RefreshCw, Database } from "lucide-react";
import { toast } from "sonner";

interface ContractStorageProps {
  contractId: string;
}

interface StorageEntry {
  id: string; // unique internal id
  keyType: StorageKeyType;
  keyValue: string;
  ledgerKeyXdr: string;
  decodedValue?: string;
  lastModified?: number;
  found: boolean;
  error?: string;
}

export function ContractStorage({ contractId }: ContractStorageProps) {
  const { getActiveNetworkConfig } = useNetworkStore();

  // Local state for the "Add Key" form
  const [newKeyType, setNewKeyType] = useState<StorageKeyType>("symbol");
  const [newKeyValue, setNewKeyValue] = useState("");

  // The list of keys we are watching
  const [entries, setEntries] = useState<StorageEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    if (entries.length === 0) return;
    setLoading(true);

    try {
      const network = getActiveNetworkConfig();
      const server = new SorobanRpc.Server(network.rpcUrl);

      const ledgerKeys = entries.map((entry) =>
        xdr.LedgerKey.fromXDR(entry.ledgerKeyXdr, "base64"),
      );

      if (ledgerKeys.length === 0) return;

      // 2. Fetch from RPC
      const response = await server.getLedgerEntries(...ledgerKeys);

      // 3. Map results back to our entries
      const updatedEntries = entries.map((entry) => {
        const match = response.entries.find(
          (r) => r.key.toXDR("base64") === entry.ledgerKeyXdr,
        );

        if (match) {
          return {
            ...entry,
            ...decodeStorageQueryResult(match.val, match.lastModifiedLedgerSeq),
            error: undefined,
          };
        } else {
          return {
            ...entry,
            found: false,
            decodedValue: undefined,
            lastModified: undefined,
            error: undefined,
          };
        }
      });

      setEntries(updatedEntries);
      toast.success("Storage updated");
    } catch (e: any) {
      console.error(e);
      toast.error("Failed to fetch storage");
    } finally {
      setLoading(false);
    }
  };

  const handleAddKey = () => {
    if (!newKeyValue) return;

    try {
      const query = buildStorageQuery({
        contractId,
        keyType: newKeyType,
        keyValue: newKeyValue,
      });

      const newEntry: StorageEntry = {
        id: crypto.randomUUID(),
        keyType: query.keyType,
        keyValue: query.keyValue,
        ledgerKeyXdr: query.ledgerKeyXdr,
        found: false,
      };

      setEntries([...entries, newEntry]);
      setNewKeyValue("");
    } catch (error: any) {
      toast.error(error.message || "Invalid storage query");
    }
  };

  const handleRemove = (id: string) => {
    setEntries(entries.filter((e) => e.id !== id));
  };

  return (
    <div className="space-y-6">
      {/* Add Key Form */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Watch Storage Key</CardTitle>
          <CardDescription>
            Since the RPC cannot list all keys, add specific keys you want to
            inspect (e.g. "Counter", "Admin").
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <div className="w-[140px]">
              <Select
                value={newKeyType}
                onValueChange={(v: any) => setNewKeyType(v)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="symbol">Symbol</SelectItem>
                  <SelectItem value="string">String</SelectItem>
                  <SelectItem value="address">Address</SelectItem>
                  <SelectItem value="i32">i32 (Int)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Input
              placeholder="Key Name (e.g. Admin)"
              value={newKeyValue}
              onChange={(e) => setNewKeyValue(e.target.value)}
            />
            <Button onClick={handleAddKey} disabled={!newKeyValue}>
              <Plus className="mr-2 h-4 w-4" /> Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-blue-500" />
            <span className="font-semibold">Current State</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchData}
            disabled={loading || entries.length === 0}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[150px]">Key Type</TableHead>
                <TableHead className="w-[200px]">Key</TableHead>
                <TableHead>Value (Native)</TableHead>
                <TableHead className="w-[100px] text-right">Modified</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    No keys being watched. Add one above to inspect storage.
                  </TableCell>
                </TableRow>
              ) : (
                entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {entry.keyType}
                    </TableCell>
                    <TableCell className="break-all font-mono text-xs font-medium">
                      {entry.keyValue}
                    </TableCell>
                    <TableCell>
                      {entry.found ? (
                        <code className="block max-w-[300px] overflow-hidden text-ellipsis break-all rounded bg-muted px-2 py-1 font-mono text-xs">
                          {entry.decodedValue}
                        </code>
                      ) : (
                        <span className="text-xs italic text-muted-foreground">
                          Not Found / Null
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs">
                      {entry.lastModified || "-"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-red-500"
                        onClick={() => handleRemove(entry.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
