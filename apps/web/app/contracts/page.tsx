"use client";

import { useEffect, useState } from "react";
import { useContractStore } from "@/store/useContractStore";
import {
  Trash2,
  Plus,
  Search,
  FileCode,
  FlaskConical,
  BookmarkPlus,
  Star,
  Wrench,
} from "lucide-react";
import { Button } from "@devconsole/ui";
import { Input } from "@devconsole/ui";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@devconsole/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@devconsole/ui";
import { toast } from "sonner";
import { getDeployedFixtures } from "@/lib/fixture-manifest";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useNetworkStore } from "@/store/useNetworkStore";

export default function ContractsPage() {
  const { contracts, addContract, removeContract } = useContractStore();
  const { currentNetwork } = useNetworkStore();
  const {
    activeWorkspaceId,
    bookmarkContract,
    getContractBookmarks,
    toggleBookmarkFavorite,
    removeContractBookmark,
    repairBookmarkNetwork,
  } = useWorkspaceStore();
  const [inputVal, setInputVal] = useState("");
  const [error, setError] = useState("");
  const [isMounted, setIsMounted] = useState(false);
  const fixtures = getDeployedFixtures();
  const bookmarks = getContractBookmarks(activeWorkspaceId);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleAdd = () => {
    const id = inputVal.trim();

    if (!id.startsWith("C") || id.length !== 56) {
      toast.error(
        'Invalid Contract ID. Must start with "C" and be 56 characters.',
      );
      setError(
        'Invalid Contract ID. Must start with "C" and be 56 characters.',
      );
      return;
    }

    addContract(id, currentNetwork);
    bookmarkContract(activeWorkspaceId, id, currentNetwork, "manual");
    setInputVal("");
    setError("");
    toast.success("Contract added and bookmarked.");
  };

  if (!isMounted) return null;

  return (
    <div className="container mx-auto space-y-8 p-6">
      {/* Header Section */}
      <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Contract Explorer
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage and interact with your Soroban smart contracts.
          </p>
        </div>
      </div>

      {/* Add Contract Card */}
      <Card>
        <CardHeader>
          <CardTitle>Track New Contract</CardTitle>
          <CardDescription>
            Paste a Contract ID to add it to your watchlist.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1">
              <Input
                placeholder="C..."
                value={inputVal}
                onChange={(e) => {
                  setInputVal(e.target.value);
                  setError("");
                }}
                className={error ? "border-red-500" : ""}
              />
              {error && <p className="mt-1 text-sm text-red-500">{error}</p>}
            </div>
            <Button onClick={handleAdd} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Contract
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Contracts Table */}
      <div className="rounded-md border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[400px]">Contract ID</TableHead>
              <TableHead>Network</TableHead>
              <TableHead>Date Added</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {contracts.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={4}
                  className="h-24 text-center text-muted-foreground"
                >
                  No contracts added yet. Add one above to get started.
                </TableCell>
              </TableRow>
            ) : (
              contracts.map((contract) => (
                <TableRow key={contract.id}>
                  <TableCell className="flex items-center gap-2 font-mono text-sm font-medium">
                    <Link
                      href={`/contracts/${contract.id}`}
                      className="flex items-center gap-2 transition-colors hover:text-blue-500 hover:underline"
                    >
                      <FileCode className="h-4 w-4 text-blue-500" />
                      {contract.id}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full border border-transparent bg-secondary px-2.5 py-0.5 text-xs font-semibold text-secondary-foreground transition-colors hover:bg-secondary/80 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2">
                      {contract.network}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(contract.addedAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          bookmarkContract(
                            activeWorkspaceId,
                            contract.id,
                            contract.network,
                            "contracts-page",
                          );
                          toast.success("Contract bookmarked");
                        }}
                        className="text-muted-foreground hover:text-blue-500"
                      >
                        <BookmarkPlus className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          removeContract(contract.id);
                          toast.success("Contract removed");
                        }}
                        className="text-muted-foreground hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* FE-015: Fixture contracts from manifest */}
      {fixtures.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FlaskConical className="h-4 w-4" />
              Demo Fixture Contracts
            </CardTitle>
            <CardDescription>
              Pre-deployed contracts for testing and demos. Add one to your
              watchlist with a single click.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              {fixtures.map((f) => (
                <div
                  key={f.key}
                  className="flex items-start justify-between gap-3 rounded-md border p-3"
                >
                  <div className="min-w-0">
                    <div className="font-medium">{f.label}</div>
                    <div className="text-xs text-muted-foreground">
                      {f.description}
                    </div>
                    <div className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {f.contractId}
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => {
                      addContract(f.contractId!, f.network);
                      bookmarkContract(
                        activeWorkspaceId,
                        f.contractId!,
                        f.network,
                        "fixture",
                      );
                      toast.success(`${f.label} added`);
                    }}
                    disabled={contracts.some((c) => c.id === f.contractId)}
                  >
                    <Plus className="mr-1 h-3 w-3" />
                    Add
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Bookmarked Contracts</CardTitle>
          <CardDescription>
            Favorites stay pinned at the top. Stale bookmarks can be repaired.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {bookmarks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No bookmarks yet. Bookmark a contract from this page.
            </p>
          ) : (
            <div className="space-y-2">
              {bookmarks.map((bookmark) => {
                const isStale = !contracts.some(
                  (contract) =>
                    contract.id === bookmark.contractId &&
                    contract.network === bookmark.networkId,
                );

                return (
                  <div
                    key={bookmark.id}
                    className="flex items-center justify-between rounded-md border p-3"
                  >
                    <div className="min-w-0">
                      <Link
                        href={`/contracts/${bookmark.contractId}`}
                        className="truncate font-mono text-xs hover:text-blue-500 hover:underline"
                      >
                        {bookmark.contractId}
                      </Link>
                      <div className="text-xs text-muted-foreground">
                        {bookmark.networkId} · source: {bookmark.source}
                        {isStale ? " · stale" : ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          toggleBookmarkFavorite(activeWorkspaceId, bookmark.id)
                        }
                        className={
                          bookmark.favorite
                            ? "text-amber-500"
                            : "text-muted-foreground"
                        }
                      >
                        <Star className="h-4 w-4" />
                      </Button>
                      {isStale && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            addContract(bookmark.contractId, bookmark.networkId);
                            repairBookmarkNetwork(
                              activeWorkspaceId,
                              bookmark.id,
                              bookmark.networkId,
                            );
                            toast.success("Bookmark repaired");
                          }}
                          className="text-blue-600"
                        >
                          <Wrench className="h-4 w-4" />
                        </Button>
                      )}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() =>
                          removeContractBookmark(activeWorkspaceId, bookmark.id)
                        }
                        className="text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
