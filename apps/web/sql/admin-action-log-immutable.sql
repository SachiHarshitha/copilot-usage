-- Defense-in-depth: AdminActionLog rows must be append-only. Application code
-- already never issues UPDATE or DELETE against this table; this trigger
-- enforces that contract at the DB layer so a compromised application or a
-- mis-typed psql session cannot tamper with the audit trail.
--
-- Idempotent: safe to apply repeatedly. Statements are separated by the
-- literal token `--SPLIT--` so the dollar-quoted function body is not
-- mis-tokenized by the applier.

DROP TRIGGER IF EXISTS admin_action_log_immutable ON "AdminActionLog";
--SPLIT--
CREATE OR REPLACE FUNCTION admin_action_log_block_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Allow the FK cascade ON DELETE SET NULL on adminUserId: when an
  -- AdminUser is deleted, the audit row is orphaned (adminUserId -> NULL)
  -- but every other column must be unchanged. This preserves the audit
  -- trail across admin removals without permitting tampering.
  IF TG_OP = 'UPDATE'
     AND OLD."adminUserId" IS NOT NULL
     AND NEW."adminUserId" IS NULL
     AND OLD."id" IS NOT DISTINCT FROM NEW."id"
     AND OLD."adminEmailHash" IS NOT DISTINCT FROM NEW."adminEmailHash"
     AND OLD."action" IS NOT DISTINCT FROM NEW."action"
     AND OLD."targetType" IS NOT DISTINCT FROM NEW."targetType"
     AND OLD."targetId" IS NOT DISTINCT FROM NEW."targetId"
     AND OLD."ipHash" IS NOT DISTINCT FROM NEW."ipHash"
     AND OLD."userAgentHash" IS NOT DISTINCT FROM NEW."userAgentHash"
     AND OLD."before" IS NOT DISTINCT FROM NEW."before"
     AND OLD."after" IS NOT DISTINCT FROM NEW."after"
     AND OLD."metadata" IS NOT DISTINCT FROM NEW."metadata"
     AND OLD."createdAt" IS NOT DISTINCT FROM NEW."createdAt"
  THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'AdminActionLog is append-only; % is not permitted', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
--SPLIT--
CREATE TRIGGER admin_action_log_immutable
BEFORE UPDATE OR DELETE ON "AdminActionLog"
FOR EACH ROW
EXECUTE FUNCTION admin_action_log_block_mutation();
