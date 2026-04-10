/**
 * Local seed helpers for hydration tests (isolated visible tab row ids).
 */

import { HOME_VISIBLE_ENTRY, type VisibleWorkspaceEntry } from '../categoryTestHarness';
import {
  getDefaultWorkspaceData,
  saveAppState,
  saveWorkspace,
  setWorkspaceIdMapping,
  VISIBLE_WS_PREFIX,
} from '../../src/utils/storage';

/** Home + second visible tab using a caller-supplied workspace row UUID (not random). */
export function seedHomePlusVisibleWorkspaceWithRowId(
  secondTabName: string,
  visibleWorkspaceRowId: string,
): { entry: VisibleWorkspaceEntry; visKey: string } {
  const key = `${VISIBLE_WS_PREFIX}${visibleWorkspaceRowId}`;
  setWorkspaceIdMapping(key, visibleWorkspaceRowId);
  saveWorkspace('workspace_home', getDefaultWorkspaceData());
  saveWorkspace(key, getDefaultWorkspaceData());
  const entry: VisibleWorkspaceEntry = {
    id: visibleWorkspaceRowId,
    name: secondTabName,
    key,
  };
  saveAppState([HOME_VISIBLE_ENTRY, entry], 'workspace_home');
  return { entry, visKey: key };
}
