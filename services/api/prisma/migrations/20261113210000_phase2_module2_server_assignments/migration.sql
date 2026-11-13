-- Phase 2 — Module 2: Server-to-Section & Table Assignment (additive migration)
-- Adds assignedServerId to dining_areas and tables referencing users(id)

ALTER TABLE "dining_areas" ADD COLUMN IF NOT EXISTS "assignedServerId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'dining_areas_assignedServerId_fkey'
  ) THEN
    ALTER TABLE "dining_areas" ADD CONSTRAINT "dining_areas_assignedServerId_fkey"
      FOREIGN KEY ("assignedServerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "tables" ADD COLUMN IF NOT EXISTS "assignedServerId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'tables_assignedServerId_fkey'
  ) THEN
    ALTER TABLE "tables" ADD CONSTRAINT "tables_assignedServerId_fkey"
      FOREIGN KEY ("assignedServerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "dining_areas_assignedServerId_idx" ON "dining_areas"("assignedServerId");
CREATE INDEX IF NOT EXISTS "tables_assignedServerId_idx" ON "tables"("assignedServerId");

