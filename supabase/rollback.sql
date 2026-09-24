-- SAFE ROLLBACK NOTICE: intentionally read-only.
-- A failed migration rolls back automatically because the entire SQL file is one transaction.
-- After COMMIT, deleting the new schema would destroy certificates/history and reopen old vulnerabilities.
-- Restore the verified pre-migration database AND Storage backup to a separate project;
-- validate it, then repoint the old application during a maintenance window.
-- Read MIGRATION_GUIDE.md. No DROP TABLE or permissive grant is executed here.
select 'MANUAL_RESTORE_REQUIRED' as status,
 'Use the pre-migration backup in a separate project. Preserve new certificates/results before switching.' as action;
