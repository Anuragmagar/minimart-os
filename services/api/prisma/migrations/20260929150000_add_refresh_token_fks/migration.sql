-- Add the missing tenant foreign keys to refresh_tokens.
-- refresh_tokens.user_id and refresh_tokens.organization_id were created as bare
-- UUID columns, so BR-040 (one organization must never reach another's data) was
-- not structurally enforceable, and a token row could outlive the tenant it
-- belonged to. This migration is additive only: it adds two foreign keys and
-- deletes no rows and no columns.
--
-- No indexes are added here: the base migration already created
-- refresh_tokens_user_id_idx and refresh_tokens_organization_id_idx, and
-- PostgreSQL does not auto-index the referencing side of a foreign key.

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
