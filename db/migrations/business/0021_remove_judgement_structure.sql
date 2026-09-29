-- Remove the judgement engine, extraction candidates and structure proposals (ADR 0014).
-- The BE-08 invariant returns: a SUPERSEDED context names exactly one successor.
-- Fails loudly if a database still holds SUPERSEDED contexts without superseded_by_id.
DROP TRIGGER "context_successor_required" ON "business"."context";--> statement-breakpoint
DROP TABLE "business"."context_successor" CASCADE;--> statement-breakpoint
DROP TABLE "business"."extraction_candidate" CASCADE;--> statement-breakpoint
DROP TABLE "business"."judgement_exposure" CASCADE;--> statement-breakpoint
DROP TABLE "business"."judgement_feedback" CASCADE;--> statement-breakpoint
DROP TABLE "business"."judgement_proposal" CASCADE;--> statement-breakpoint
DROP TABLE "business"."judgement_request" CASCADE;--> statement-breakpoint
DROP TABLE "business"."judgement_run" CASCADE;--> statement-breakpoint
DROP TABLE "business"."structure_mutation" CASCADE;--> statement-breakpoint
DROP TABLE "business"."structure_proposal" CASCADE;--> statement-breakpoint
DROP FUNCTION "business"."ensure_context_successor"();--> statement-breakpoint
ALTER TABLE "business"."context" DROP CONSTRAINT "context_superseded_target_check";--> statement-breakpoint
ALTER TABLE "business"."context" ADD CONSTRAINT "context_superseded_target_check" CHECK (("business"."context"."state" = 'SUPERSEDED') = ("business"."context"."superseded_by_id" IS NOT NULL));