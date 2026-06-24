# Emergency Drug Species Enrichment Review Summary

Generated for VetLearnCPD on 2026-06-21. Updated after review SQL v1 was too noisy.

## Files

- Migration: `supabase/migrations/20260621_emergency_drug_species_enrichment.sql`
- Review query: `supabase/emergency_drug_species_enrichment_review.sql`

## Safety Status

- No SQL has been run against Supabase by Codex.
- No migration has been applied.
- No production rows have been inserted, updated, or deleted.
- The migration contains no `DELETE`.
- Automatically inserted or enriched rows are marked `reviewed = false`.

## Proposed Schema Changes

The migration adds these columns to `public.emergency_drug_calculator` if they do not already exist:

- `species_notes text`
- `source text`
- `reviewed boolean default false`
- `formulary_match_status text`
- `formulary_source_ids jsonb default '[]'::jsonb`
- `species_warning_summary text`

## Proposed Data Changes

Because Codex did not query Supabase, exact counts are not known locally. Run the review SQL manually to obtain counts before applying the migration.

- Rows that would be created: shown by review rows where `would_action = 'INSERT'`.
- Rows that would be updated: shown by review rows where `would_action = 'UPDATE'`.
- Rows left unchanged: shown by review rows where `would_action = 'LEFT UNCHANGED'`.
- Rows flagged for manual review: shown by review rows where `would_action = 'FLAG FOR REVIEW'`.

The v2 migration only inserts species-specific rows when the match is high confidence:

- exact normalised drug name match
- exact normalised indication match
- explicit species in the formulary source row
- compatible dose unit
- compatible route or blank route on one side
- numeric dose present in the formulary source row
- no existing species-specific emergency row for the same drug and indication
- exactly one canonical candidate after de-duplication
- exactly one source row for that canonical candidate
- no species-specific caution already present in the emergency row notes

The migration only updates metadata columns:

- `species_notes`
- `source`
- `reviewed`
- `formulary_match_status`
- `formulary_source_ids`
- `species_warning_summary`

It does not overwrite existing emergency dose, route, concentration, or concentration unit values.

## V2 Noise Reduction Rules

The revised review and migration SQL:

- groups candidates by emergency row, normalised drug name, normalised species, normalised indication, dose, dose unit, and route
- chooses a single canonical row per grouped candidate, preferring `public.drugs` over `public.drug_clinical_summary`
- treats mirrored or multiple source rows as `FLAG FOR REVIEW`, not `INSERT`
- treats multiple canonical candidate alternatives for the same emergency row, drug, species, and indication as `FLAG FOR REVIEW`
- treats rows with species-specific cautions in existing emergency notes as `FLAG FOR REVIEW`
- includes count columns in the review output:
  - `would_insert_count`
  - `would_update_count`
  - `left_unchanged_count`
  - `flag_for_review_count`

## Manual Review Instructions

Before applying the migration:

1. Open Supabase SQL Editor.
2. Run `supabase/emergency_drug_species_enrichment_review.sql`.
3. Review all rows where `would_action = 'FLAG FOR REVIEW'`.
4. Check the count columns in the review output: `would_insert_count`, `would_update_count`, `left_unchanged_count`, and `flag_for_review_count`.
5. Confirm every `INSERT` row is clinically appropriate.
6. Confirm every `UPDATE` row only adds acceptable metadata.
7. Only after review, run the migration file manually if approved.

## Rollback Plan

The metadata column additions can be rolled back with `ALTER TABLE ... DROP COLUMN`, but this would remove any reviewed metadata later entered by users. Do not drop columns after production use without a backup.

Inserted species-specific emergency rows can be identified by:

- `reviewed = false`
- `formulary_match_status = 'high_confidence_formulary_species_insert'`

Metadata updates can be identified by:

- `reviewed = false`
- `formulary_match_status in ('high_confidence_formulary_metadata_update', 'review_warning_only_metadata_update')`

Because the migration uses existing row data and does not create a separate audit table, a perfect rollback of overwritten metadata is not possible unless you take a backup/export first. Recommended rollback preparation:

1. Export `public.emergency_drug_calculator` before applying the migration.
2. Apply migration only after reviewing the candidate output.
3. If rollback is required, delete only newly inserted rows matching the insert status above and restore metadata columns from the pre-migration export.
