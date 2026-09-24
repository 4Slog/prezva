-- 0153: one door check-in per registration (O117).
--
-- check_ins_registration_id_session_id_key is UNIQUE (registration_id,
-- session_id), but NULLs are distinct, so it never stopped two door rows
-- (session_id IS NULL) for the same registration: a double scan or a racing
-- online + offline sync could both insert. This partial index closes that.
-- The app treats the resulting 23505 as "already checked in".

DO $$
DECLARE
  dup_count integer;
BEGIN
  SELECT count(*) INTO dup_count
  FROM (
    SELECT registration_id
    FROM public.check_ins
    WHERE session_id IS NULL
    GROUP BY registration_id
    HAVING count(*) > 1
  ) d;

  IF dup_count > 0 THEN
    RAISE EXCEPTION 'check_ins has % registration(s) with more than one door row (session_id IS NULL); resolve them before creating check_ins_door_once', dup_count;
  END IF;
END
$$;

CREATE UNIQUE INDEX check_ins_door_once ON public.check_ins (registration_id) WHERE session_id IS NULL;
