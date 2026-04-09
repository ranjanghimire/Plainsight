import { v5 as uuidv5 } from 'uuid';

/** Fixed namespace for deterministic archived row ids (v5); must match sync/workspaceStorageBridge. */
const ARCHIVE_ID_NAMESPACE = '018d0e28-8f3a-7000-8000-000000000001';

export function archivedRowIdForText(workspaceId, text) {
  return uuidv5(`${workspaceId}\0${text}`, ARCHIVE_ID_NAMESPACE);
}
