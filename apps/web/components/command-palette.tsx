"use client";

import { Command } from "cmdk";
import {
  Briefcase,
  FileCode,
  Globe,
  Search,
  Terminal,
  Zap,
  Clock,
  Box,
  BookOpen,
} from "lucide-react";
import { useRouter } from "next/navigation";
import React, { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useNetworkStore } from "@/store/useNetworkStore";
import { useWorkspaceStore } from "@/store/useWorkspaceStore";
import { useContractStore } from "@/store/useContractStore";
import { useSavedCallsStore } from "@/store/useSavedCallsStore";

// ── FE-030: Global search index types ────────────────────────────────────────

type SearchItemKind = "workspace" | "contract" | "saved-call" | "artifact" | "nav";

interface SearchItem {
  id: string;
  kind: SearchItemKind;
  label: string;
  sublabel?: string;
  onSelect: () => void;
}

// ── Recent items tracking (FE-030) ───────────────────────────────────────────

const MAX_RECENT = 5;
const RECENT_KEY = "soroban-recent-items";

function loadRecentIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function pushRecentId(id: string): void {
  if (typeof window === "undefined") return;
  const ids = loadRecentIds().filter((x) => x !== id);
  ids.unshift(id);
  localStorage.setItem(RECENT_KEY, JSON.stringify(ids.slice(0, MAX_RECENT)));
}

// ── Component ─────────────────────────────────────────────────────────────────

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [recentIds, setRecentIds] = useState<string[]>([]);

  const router = useRouter();
  const { workspaces, setActiveWorkspace } = useWorkspaceStore();
  const { currentNetwork, setNetwork } = useNetworkStore();
  const { contracts } = useContractStore();
  const { savedCalls } = useSavedCallsStore();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  useEffect(() => {
    if (open) setRecentIds(loadRecentIds());
  }, [open]);

  const runCommand = (id: string, command: () => void) => {
    setOpen(false);
    setSearch("");
    pushRecentId(id);
    command();
  };

  // ── FE-030: Build the global search index ──────────────────────────────────

  const allItems = useMemo<SearchItem[]>(() => {
    const items: SearchItem[] = [];

    // Workspaces
    for (const w of workspaces) {
      items.push({
        id: `ws:${w.id}`,
        kind: "workspace",
        label: w.name,
        sublabel: w.selectedNetwork,
        onSelect: () => {
          setActiveWorkspace(w.id);
          toast.success(`Workspace switched to: ${w.name}`);
        },
      });
    }

    // Contracts
    for (const c of contracts) {
      items.push({
        id: `contract:${c.id}`,
        kind: "contract",
        label: c.name,
        sublabel: `${c.network} · ${c.id.slice(0, 8)}…`,
        onSelect: () => router.push(`/contract/${c.id}`),
      });
    }

    // Saved calls
    for (const sc of savedCalls) {
      items.push({
        id: `call:${sc.id}`,
        kind: "saved-call",
        label: sc.name || sc.fnName,
        sublabel: `${sc.fnName} · ${sc.network}`,
        onSelect: () => router.push(`/contract/${sc.contractId}`),
      });
    }

    // Artifacts from active workspace
    for (const w of workspaces) {
      for (const ref of w.artifactRefs) {
        items.push({
          id: `artifact:${ref.kind}:${ref.id}`,
          kind: "artifact",
          label: `${ref.kind} / ${ref.id.slice(0, 12)}…`,
          sublabel: w.name,
          onSelect: () => router.push("/deploy/wasm"),
        });
      }
    }

    // Static nav items
    items.push(
      {
        id: "nav:wasm",
        kind: "nav",
        label: "WASM Registry",
        sublabel: "Deploy & manage WASM artifacts",
        onSelect: () => router.push("/deploy/wasm"),
      },
      {
        id: "nav:xdr",
        kind: "nav",
        label: "XDR Transformer",
        sublabel: "Encode and decode XDR",
        onSelect: () => router.push("/tools/xdr"),
      },
    );

    return items;
  }, [workspaces, contracts, savedCalls, router, setActiveWorkspace]);

  // Filter by search query
  const filtered = useMemo(() => {
    if (!search.trim()) return allItems;
    const q = search.toLowerCase();
    return allItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.sublabel?.toLowerCase().includes(q),
    );
  }, [allItems, search]);

  // Recent items (shown when search is empty)
  const recentItems = useMemo(
    () => recentIds.flatMap((rid) => allItems.filter((i) => i.id === rid)),
    [recentIds, allItems],
  );

  const kindIcon: Record<SearchItemKind, React.ReactNode> = {
    workspace: <Briefcase className="mr-2 h-4 w-4 text-muted-foreground" />,
    contract: <FileCode className="mr-2 h-4 w-4 text-muted-foreground" />,
    "saved-call": <Terminal className="mr-2 h-4 w-4 text-muted-foreground" />,
    artifact: <Box className="mr-2 h-4 w-4 text-muted-foreground" />,
    nav: <Zap className="mr-2 h-4 w-4 text-muted-foreground" />,
  };

  const kindLabel: Record<SearchItemKind, string> = {
    workspace: "Workspaces",
    contract: "Contracts",
    "saved-call": "Saved Calls",
    artifact: "Artifacts",
    nav: "Navigation",
  };

  // Group filtered items by kind
  const grouped = useMemo(() => {
    const map = new Map<SearchItemKind, SearchItem[]>();
    for (const item of filtered) {
      const list = map.get(item.kind) ?? [];
      list.push(item);
      map.set(item.kind, list);
    }
    return map;
  }, [filtered]);

  // Network switcher items
  const networks = ["testnet", "mainnet", "futurenet"];

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div className="fixed left-1/2 top-1/4 z-50 w-full max-w-lg -translate-x-1/2 rounded-xl border bg-background shadow-2xl">
          <Command className="rounded-xl" shouldFilter={false}>
            <div className="flex items-center border-b px-3">
              <Search className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
              <Command.Input
                value={search}
                onValueChange={setSearch}
                placeholder="Search workspaces, contracts, calls, artifacts…"
                className="flex h-11 w-full bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
            <Command.List className="max-h-96 overflow-y-auto p-2">
              <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
                No results found.
              </Command.Empty>

              {/* Recent items (shown when no search query) */}
              {!search.trim() && recentItems.length > 0 && (
                <Command.Group
                  heading={
                    <span className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-muted-foreground">
                      <Clock className="h-3 w-3" /> Recent
                    </span>
                  }
                >
                  {recentItems.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.id}
                      onSelect={() => runCommand(item.id, item.onSelect)}
                      className="flex cursor-pointer items-center rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                    >
                      {kindIcon[item.kind]}
                      <span className="flex-1">{item.label}</span>
                      {item.sublabel && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.sublabel}
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}

              {/* Grouped search results */}
              {Array.from(grouped.entries()).map(([kind, items]) => (
                <Command.Group
                  key={kind}
                  heading={
                    <span className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      {kindLabel[kind]}
                    </span>
                  }
                >
                  {items.map((item) => (
                    <Command.Item
                      key={item.id}
                      value={item.id}
                      onSelect={() => runCommand(item.id, item.onSelect)}
                      className="flex cursor-pointer items-center rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                    >
                      {kindIcon[item.kind]}
                      <span className="flex-1">{item.label}</span>
                      {item.sublabel && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          {item.sublabel}
                        </span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              ))}

              {/* Network switcher */}
              {(!search.trim() || "network switch".includes(search.toLowerCase())) && (
                <Command.Group
                  heading={
                    <span className="px-2 py-1 text-xs font-medium text-muted-foreground">
                      Networks
                    </span>
                  }
                >
                  {networks.map((net) => (
                    <Command.Item
                      key={net}
                      value={`network:${net}`}
                      onSelect={() =>
                        runCommand(`network:${net}`, () => {
                          setNetwork(net);
                          toast.success(`Network switched to ${net.toUpperCase()}`);
                        })
                      }
                      className="flex cursor-pointer items-center rounded-md px-2 py-2 text-sm aria-selected:bg-accent"
                    >
                      <Globe className="mr-2 h-4 w-4 text-muted-foreground" />
                      Switch to {net}
                      {currentNetwork === net && (
                        <span className="ml-auto text-xs text-muted-foreground">active</span>
                      )}
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="border-t px-3 py-2 text-xs text-muted-foreground">
              <span className="mr-3">↑↓ navigate</span>
              <span className="mr-3">↵ select</span>
              <span>esc close</span>
            </div>
          </Command>
        </div>
      )}
    </>
  );
}
