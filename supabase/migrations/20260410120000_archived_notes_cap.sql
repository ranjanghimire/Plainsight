-- Keep at most 100 archived_notes per workspace (newest by last_deleted_at, tie-break id).

CREATE OR REPLACE FUNCTION public.plainsight_trim_archived_notes_workspace(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_workspace_id IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.archived_notes a
  USING (
    SELECT x.id
    FROM public.archived_notes x
    WHERE x.workspace_id = p_workspace_id
    ORDER BY x.last_deleted_at DESC, x.id DESC
    OFFSET 100
  ) doomed
  WHERE a.id = doomed.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.plainsight_trim_archived_notes_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  wid uuid;
BEGIN
  wid := COALESCE(NEW.workspace_id, OLD.workspace_id);
  PERFORM public.plainsight_trim_archived_notes_workspace(wid);
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_archived_notes_cap ON public.archived_notes;
CREATE TRIGGER trg_archived_notes_cap
  AFTER INSERT OR UPDATE OF workspace_id, last_deleted_at, text
  ON public.archived_notes
  FOR EACH ROW
  EXECUTE PROCEDURE public.plainsight_trim_archived_notes_trigger();

-- One-time trim for existing over-limit workspaces
DO $$
DECLARE
  wid uuid;
BEGIN
  FOR wid IN SELECT DISTINCT workspace_id FROM public.archived_notes
  LOOP
    PERFORM public.plainsight_trim_archived_notes_workspace(wid);
  END LOOP;
END $$;
