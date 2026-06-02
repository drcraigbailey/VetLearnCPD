-- Fixes formulary monographs showing raw JSON for clinical records.
-- The current UI already displays `title` and `description` nicely.
-- This safely adds/fills those fields from whichever source columns exist.

create or replace function pg_temp.vetlearn_fill_display_fields(
  p_table text,
  p_title_candidates text[],
  p_description_candidates text[],
  p_fallback_title text
) returns void
language plpgsql
as $$
declare
  v_table regclass;
  v_col text;
  v_title_expr text := 'coalesce(nullif(title, '''')';
  v_description_expr text := 'coalesce(nullif(description, '''')';
begin
  v_table := to_regclass('public.' || p_table);
  if v_table is null then
    return;
  end if;

  execute format('alter table %s add column if not exists title text', v_table);
  execute format('alter table %s add column if not exists description text', v_table);

  foreach v_col in array p_title_candidates loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = p_table
        and column_name = v_col
    ) then
      v_title_expr := v_title_expr || format(', nullif(%I::text, '''')', v_col);
    end if;
  end loop;

  foreach v_col in array p_description_candidates loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = p_table
        and column_name = v_col
    ) then
      v_description_expr := v_description_expr || format(', nullif(%I::text, '''')', v_col);
    end if;
  end loop;

  v_title_expr := v_title_expr || ', ' || quote_literal(p_fallback_title) || ')';
  v_description_expr := v_description_expr || ', '''')';

  execute format(
    'update %s set title = %s, description = %s where title is null or title = '''' or description is null or description = ''''',
    v_table,
    v_title_expr,
    v_description_expr
  );
end;
$$;

select pg_temp.vetlearn_fill_display_fields(
  'drug_warnings',
  array['warning_type', 'species'],
  array['warning_text', 'notes'],
  'Warning'
);

select pg_temp.vetlearn_fill_display_fields(
  'species_warnings',
  array['species', 'warning_type'],
  array['warning_text', 'notes'],
  'Species warning'
);

select pg_temp.vetlearn_fill_display_fields(
  'adverse_effects',
  array['effect_type', 'species'],
  array['effect_text', 'adverse_effect', 'notes'],
  'Adverse effect'
);

select pg_temp.vetlearn_fill_display_fields(
  'contraindications',
  array['condition', 'contraindication', 'species'],
  array['reason', 'details', 'notes'],
  'Contraindication'
);

select pg_temp.vetlearn_fill_display_fields(
  'monitoring_recommendations',
  array['parameter', 'monitoring_type'],
  array['recommendation', 'monitoring', 'notes'],
  'Monitoring'
);

select pg_temp.vetlearn_fill_display_fields(
  'drug_interactions',
  array['interacting_drug', 'drug_b'],
  array['interaction', 'mechanism', 'recommendation', 'notes'],
  'Interaction'
);

select pg_temp.vetlearn_fill_display_fields(
  'drug_information',
  array['section', 'information_type'],
  array['content', 'information_text', 'summary', 'notes'],
  'Information'
);

select pg_temp.vetlearn_fill_display_fields(
  'clinical_pearls',
  array['category', 'species'],
  array['pearl', 'pearl_text', 'summary', 'notes'],
  'Clinical pearl'
);
