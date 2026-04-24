"use client";

/**
 * FE-034: Collaborative notes and annotations for workspaces and sub-resources.
 * Works in both editable and read-only (shared session) contexts.
 */

import { useState } from "react";
import { useWorkspaceNotesStore } from "@/store/useWorkspaceNotesStore";
import type { WorkspaceNote } from "@/store/workspace-schema";
import { Button } from "@devconsole/ui";
import { Textarea } from "@devconsole/ui";
import { MessageSquare, Pencil, Trash2, Check, X } from "lucide-react";

interface WorkspaceNotesProps {
  workspaceId: string;
  /** If provided, shows only notes pinned to this resource */
  resourceType?: WorkspaceNote["resourceType"];
  resourceId?: string;
  /** Disable add/edit/delete in read-only shared sessions */
  readOnly?: boolean;
  /** Optionally render a static list of notes (e.g. from a shared payload) */
  staticNotes?: WorkspaceNote[];
}

function NoteItem({
  note,
  readOnly,
  onUpdate,
  onDelete,
}: {
  note: WorkspaceNote;
  readOnly: boolean;
  onUpdate: (id: string, body: string) => void;
  onDelete: (id: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);

  const save = () => {
    if (draft.trim()) onUpdate(note.id, draft.trim());
    setEditing(false);
  };

  return (
    <div className="group rounded-md border bg-muted/30 px-3 py-2 text-sm">
      {editing ? (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[60px] text-sm"
            autoFocus
          />
          <div className="flex gap-1">
            <Button size="sm" onClick={save} className="h-7 gap-1">
              <Check className="h-3 w-3" /> Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(note.body); setEditing(false); }} className="h-7">
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-2">
          <p className="flex-1 whitespace-pre-wrap">{note.body}</p>
          {!readOnly && (
            <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
              <button onClick={() => setEditing(true)} aria-label="Edit note">
                <Pencil className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
              </button>
              <button onClick={() => onDelete(note.id)} aria-label="Delete note">
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
              </button>
            </div>
          )}
        </div>
      )}
      <p className="mt-1 text-xs text-muted-foreground">
        {new Date(note.updatedAt).toLocaleString()}
        {note.resourceType && (
          <span className="ml-2 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
            {note.resourceType}:{note.resourceId?.slice(0, 8)}
          </span>
        )}
      </p>
    </div>
  );
}

export function WorkspaceNotes({
  workspaceId,
  resourceType,
  resourceId,
  readOnly = false,
  staticNotes,
}: WorkspaceNotesProps) {
  const { addNote, updateNote, deleteNote, getNotesForWorkspace, getNotesForResource } =
    useWorkspaceNotesStore();
  const [draft, setDraft] = useState("");

  const liveNotes = staticNotes
    ? staticNotes
    : resourceType && resourceId
    ? getNotesForResource(workspaceId, resourceType, resourceId)
    : getNotesForWorkspace(workspaceId);

  const handleAdd = () => {
    const body = draft.trim();
    if (!body) return;
    addNote(workspaceId, body, resourceType ? { resourceType, resourceId } : undefined);
    setDraft("");
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <MessageSquare className="h-4 w-4" />
        Notes
        {liveNotes.length > 0 && (
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
            {liveNotes.length}
          </span>
        )}
      </div>

      {liveNotes.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {readOnly ? "No notes in this workspace." : "No notes yet — add one below."}
        </p>
      )}

      <div className="space-y-2">
        {liveNotes.map((note) => (
          <NoteItem
            key={note.id}
            note={note}
            readOnly={readOnly}
            onUpdate={updateNote}
            onDelete={deleteNote}
          />
        ))}
      </div>

      {!readOnly && (
        <div className="space-y-2">
          <Textarea
            placeholder="Add a note…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="min-h-[60px] text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleAdd();
            }}
          />
          <Button size="sm" onClick={handleAdd} disabled={!draft.trim()} className="h-7">
            Add Note
          </Button>
        </div>
      )}
    </div>
  );
}
