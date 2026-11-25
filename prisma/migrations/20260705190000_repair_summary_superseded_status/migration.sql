-- @social-monitor-repair-migration
DO $$
BEGIN
  ALTER TYPE "SummaryStatus" ADD VALUE 'SUPERSEDED';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
