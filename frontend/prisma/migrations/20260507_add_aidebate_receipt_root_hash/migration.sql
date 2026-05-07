-- Tier 3 transcript bundling: add receiptRootHash to AIDebate.
-- The PredictionBattle model already has battleDataHash which serves the
-- same purpose, so no migration needed there.
--
-- This migration is additive only (NULL-able new column), so it is safe to
-- apply on the live DB without backfilling. New writes populate it; legacy
-- rows leave it NULL and reads fall back to the AIDebateRound child table.

ALTER TABLE "AIDebate" ADD COLUMN "receiptRootHash" TEXT;
