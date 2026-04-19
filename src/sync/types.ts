export type UUID = string;
export type Timestamptz = string; // ISO string

export type WorkspaceKind = 'visible' | 'hidden';

export type Workspace = {
  id: UUID;
  owner_id: UUID;
  name: string;
  kind: WorkspaceKind;
  created_at: Timestamptz;
  updated_at: Timestamptz;
};

export type Category = {
  id: UUID;
  workspace_id: UUID;
  name: string;
  created_at: Timestamptz;
  updated_at: Timestamptz;
};

/** Queued remote deletes for categories (same shape as note tombstones). */
export type CategoryTombstone = {
  id: UUID;
  workspace_id: UUID;
  deleted_at: Timestamptz;
};

export type Note = {
  id: UUID;
  workspace_id: UUID;
  text: string;
  category_id: UUID | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  /** Client display: emphasize first line when true. */
  bold_first_line?: boolean;
};

export type NoteTombstone = {
  id: UUID;
  workspace_id: UUID;
  deleted_at: Timestamptz;
};

export type ArchivedNoteTombstone = {
  id: UUID;
  workspace_id: UUID;
  deleted_at: Timestamptz;
};

export type ArchivedNote = {
  id: UUID;
  workspace_id: UUID;
  text: string;
  category_id: UUID | null;
  last_deleted_at: Timestamptz;
  created_at: Timestamptz;
};

export type WorkspacePin = {
  user_id: UUID;
  workspace_id: UUID;
  position: number;
  created_at: Timestamptz;
};

export type WorkspaceShareStatus = 'pending' | 'accepted' | 'revoked';

export type WorkspaceShare = {
  id: UUID;
  workspace_id: UUID;
  owner_id: UUID;
  recipient_email: string;
  recipient_user_id: UUID | null;
  workspace_name: string;
  owner_email: string | null;
  status: WorkspaceShareStatus;
  created_at: Timestamptz;
  updated_at: Timestamptz;
  accepted_at: Timestamptz | null;
  revoked_at: Timestamptz | null;
};

export type WorkspaceActivityLog = {
  id: UUID;
  workspace_id: UUID;
  actor_user_id: UUID;
  actor_email: string | null;
  action: string;
  summary: string;
  details: Record<string, unknown>;
  created_at: Timestamptz;
};

/** Derived from `notes.text` first line; mirrored on the server in `note_tags`. */
export type NoteTag = {
  note_id: UUID;
  workspace_id: UUID;
  tag: string;
};

/** Derived from `archived_notes.text`; mirrored in `archived_note_tags`. */
export type ArchivedNoteTag = {
  archived_note_id: UUID;
  workspace_id: UUID;
  tag: string;
};

export type SyncError = {
  message: string;
  details?: unknown;
};

