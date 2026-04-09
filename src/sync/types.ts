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

export type Note = {
  id: UUID;
  workspace_id: UUID;
  text: string;
  category_id: UUID | null;
  created_at: Timestamptz;
  updated_at: Timestamptz;
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

