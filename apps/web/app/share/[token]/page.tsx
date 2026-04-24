"use client";

/**
 * FE-026: Complete read-only share resolution experience.
 * - Differentiated UX for revoked (403), expired (410), and malformed links
 * - Read-only banner with clear affordances
 * - Mutating actions disabled / rerouted
 * - Fork CTA wired to FE-027 flow
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { sharesApi } from "@/lib/api/workspaces";
import { ShareDetail } from "@devconsole/api-contracts";
import { importWorkspace, type SerializedWorkspace } from "@/lib/workspace-serializer";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@devconsole/ui";
import { Badge } from "@devconsole/ui";
import { Button } from "@devconsole/ui";
import {
  AlertTriangle,
  Ban,
  Clock,
  Eye,
  FileCode,
  GitFork,
  Loader2,
  ShieldOff,
} from "lucide-react";

type ErrorKind = "revoked" | "expired" | "not-found" | "malformed";

type PageState =
  | { status: "loading" }
  | { status: "error"; kind: ErrorKind; message: string }
  | { status: "ready"; link: ShareDetail; payload: SerializedWorkspace };

function errorIcon(kind: ErrorKind) {
  switch (kind) {
    case "revoked": return <ShieldOff className="h-5 w-5" />;
    case "expired": return <Clock className="h-5 w-5" />;
    case "malformed": return <Ban className="h-5 w-5" />;
    default: return <AlertTriangle className="h-5 w-5" />;
  }
}

function errorTitle(kind: ErrorKind) {
  switch (kind) {
    case "revoked": return "Link Revoked";
    case "expired": return "Link Expired";
    case "malformed": return "Invalid Link";
    default: return "Link Unavailable";
  }
}

export default function SharedWorkspacePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [state, setState] = useState<PageState>({ status: "loading" });

  useEffect(() => {
    if (!token) return;

    sharesApi
      .get(token)
      .then((link) => {
        const { payload } = importWorkspace(link.snapshotJson);
        setState({ status: "ready", link, payload });
      })
      .catch((err: unknown) => {
        let kind: ErrorKind = "not-found";
        let msg = "Share link not found.";

        if (err instanceof Error) {
          msg = err.message;
          if (msg.toLowerCase().includes("revoked")) kind = "revoked";
          else if (msg.toLowerCase().includes("expired")) kind = "expired";
          else if (msg.toLowerCase().includes("malformed") || msg.toLowerCase().includes("version")) kind = "malformed";
        } else if (typeof err === "object" && err !== null && "status" in err) {
          const status = (err as { status: number }).status;
          if (status === 403) { kind = "revoked"; msg = "This share link has been revoked."; }
          else if (status === 410) { kind = "expired"; msg = "This share link has expired."; }
          else if (status === 400) { kind = "malformed"; msg = "This share link is malformed or invalid."; }
        }

        setState({ status: "error", kind, message: msg });
      });
  }, [token]);

  if (state.status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center gap-2 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading shared workspace…
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="container mx-auto max-w-lg p-8">
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              {errorIcon(state.kind)}
              {errorTitle(state.kind)}
            </CardTitle>
            <CardDescription>{state.message}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => router.push("/")}>
              Go to Dashboard
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { payload, link } = state;
  const isExpired = link.expiresAt && new Date(link.expiresAt) < new Date();

  return (
    <div className="container mx-auto max-w-3xl space-y-6 p-6">
      {/* Read-only banner */}
      <div className="flex items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950/30 dark:text-blue-300">
        <span className="flex items-center gap-2">
          <Eye className="h-4 w-4 shrink-0" />
          <span>
            <strong>Read-only</strong> shared workspace — editing is disabled.
          </span>
        </span>
        {isExpired && (
          <Badge variant="destructive" className="shrink-0">Expired</Badge>
        )}
      </div>

      {/* Workspace header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{payload.workspace.name}</h1>
          <p className="text-sm text-muted-foreground">
            Network:{" "}
            <Badge variant="secondary">{payload.workspace.selectedNetwork}</Badge>
            &nbsp;·&nbsp;Exported{" "}
            {new Date(payload.exportedAt).toLocaleDateString()}
            {link.label && <>&nbsp;·&nbsp;{link.label}</>}
          </p>
        </div>
        {/* FE-027: Fork CTA */}
        <Button
          variant="default"
          className="shrink-0 gap-2"
          onClick={() => router.push(`/share/${token}/fork`)}
          disabled={!!isExpired}
        >
          <GitFork className="h-4 w-4" />
          Fork Workspace
        </Button>
      </div>

      {/* Contracts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Contracts
            <Badge variant="outline" className="ml-2">{payload.contracts.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payload.contracts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No contracts in this workspace.</p>
          ) : (
            <ul className="space-y-2">
              {payload.contracts.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-sm"
                >
                  <FileCode className="h-4 w-4 shrink-0 text-blue-500" />
                  <span className="flex-1 truncate">{c.id}</span>
                  <Badge variant="outline">{c.network}</Badge>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Saved calls */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Saved Calls
            <Badge variant="outline" className="ml-2">{payload.savedCalls.length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payload.savedCalls.length === 0 ? (
            <p className="text-sm text-muted-foreground">No saved calls in this workspace.</p>
          ) : (
            <ul className="space-y-2">
              {payload.savedCalls.map((c) => (
                <li key={c.id} className="rounded-md border px-3 py-2 text-sm">
                  <div className="font-medium">{c.name || c.fnName}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.contractId} · {c.fnName}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
