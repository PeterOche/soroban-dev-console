"use client";

/**
 * FE-035: Workspace activity timeline component.
 * Renders local and remote events in chronological order.
 * Local events are labeled clearly; remote audit entries are distinguished.
 */

import { useWorkspaceActivityStore, type ActivityEvent, type ActivityEventKind } from "@/store/useWorkspaceActivityStore";
import { Badge } from "@devconsole/ui";
import {
  Cloud,
  FileCode,
  GitFork,
  History,
  Link,
  MessageSquare,
  Package,
  Share2,
  ShieldOff,
  Upload,
} from "lucide-react";

function kindIcon(kind: ActivityEventKind) {
  switch (kind) {
    case "workspace_created": return <Package className="h-3.5 w-3.5" />;
    case "workspace_synced": return <Cloud className="h-3.5 w-3.5" />;
    case "workspace_imported": return <Upload className="h-3.5 w-3.5" />;
    case "share_created": return <Share2 className="h-3.5 w-3.5" />;
    case "share_revoked": return <ShieldOff className="h-3.5 w-3.5" />;
    case "workspace_forked": return <GitFork className="h-3.5 w-3.5" />;
    case "checkpoint_created": return <History className="h-3.5 w-3.5" />;
    case "note_added": return <MessageSquare className="h-3.5 w-3.5" />;
    case "contract_added": return <FileCode className="h-3.5 w-3.5" />;
    case "remote_audit": return <Link className="h-3.5 w-3.5" />;
    default: return <Package className="h-3.5 w-3.5" />;
  }
}

function EventRow({ event }: { event: ActivityEvent }) {
  return (
    <li className="flex items-start gap-3 py-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
        {kindIcon(event.kind)}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm leading-snug">{event.label}</p>
        {event.resourceRef && (
          <p className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
            {event.resourceRef}
          </p>
        )}
        <p className="mt-0.5 text-xs text-muted-foreground">
          {new Date(event.timestamp).toLocaleString()}
        </p>
      </div>
      <Badge
        variant={event.source === "remote" ? "secondary" : "outline"}
        className="shrink-0 text-[10px]"
      >
        {event.source}
      </Badge>
    </li>
  );
}

interface WorkspaceTimelineProps {
  workspaceId: string;
  maxItems?: number;
}

export function WorkspaceTimeline({ workspaceId, maxItems = 50 }: WorkspaceTimelineProps) {
  const { getTimeline } = useWorkspaceActivityStore();
  const events = getTimeline(workspaceId).slice(0, maxItems);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-sm font-medium">
        <History className="h-4 w-4" />
        Activity
        {events.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {events.length}
          </span>
        )}
      </div>

      {events.length === 0 ? (
        <p className="text-xs text-muted-foreground">No activity recorded yet.</p>
      ) : (
        <ul className="divide-y">
          {events.map((e) => (
            <EventRow key={e.id} event={e} />
          ))}
        </ul>
      )}
    </div>
  );
}
