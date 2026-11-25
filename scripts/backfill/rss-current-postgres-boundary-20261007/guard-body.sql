
BEGIN
  IF TG_NARGS <> 1 OR TG_ARGV[0] !~ '^[1-9][0-9]{0,9}$'
     OR SESSION_USER <> 'social_monitor_collection_v2'
     OR SESSION_USER::pg_catalog.regrole::pg_catalog.oid <> TG_ARGV[0]::pg_catalog.oid
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'current source writer excluded';
  END IF;
  IF TG_LEVEL = 'STATEMENT' THEN RETURN NULL; END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
