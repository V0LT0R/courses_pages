-- Superseded in release 2.
-- New database: full_schema.sql
-- Existing database: migrate_existing_database.sql
-- Then: verify_database.sql
DO $$ BEGIN RAISE EXCEPTION 'Use supabase/migrate_existing_database.sql (or full_schema.sql for a new project).'; END $$;
