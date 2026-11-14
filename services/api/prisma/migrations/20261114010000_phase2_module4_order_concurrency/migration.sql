-- ────────────────────────────────────────────────────────────────────────────
-- Phase 2 — Module 4: Order Concurrency & Transaction Safety
-- Partial unique indexes to prevent duplicate active drafts per table or table session
-- ────────────────────────────────────────────────────────────────────────────

-- Prevent duplicate active DRAFT orders for the same table session within an organization
CREATE UNIQUE INDEX IF NOT EXISTS "orders_active_draft_table_session_idx"
  ON "orders"("organizationId", "tableSessionId")
  WHERE "status" = 'DRAFT' AND "tableSessionId" IS NOT NULL;

-- Prevent duplicate active DRAFT orders for the same table within an organization
CREATE UNIQUE INDEX IF NOT EXISTS "orders_active_draft_table_idx"
  ON "orders"("organizationId", "tableId")
  WHERE "status" = 'DRAFT' AND "tableId" IS NOT NULL;

