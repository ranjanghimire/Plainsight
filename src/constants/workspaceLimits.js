/** Max menu visible workspaces (includes Home) for users without cloud sync entitlement. */
export const MAX_FREE_VISIBLE_WORKSPACES = 4;

/** Max legacy hidden workspaces (`workspace_<slug>`, excluding `workspace_home`) without entitlement. */
export const MAX_FREE_HIDDEN_WORKSPACES = 1;

/** Max archived notes per workspace (oldest dropped when exceeded). */
export const MAX_ARCHIVED_ITEMS_PER_WORKSPACE = 100;
