#!/usr/bin/env python3
r"""
Generate rerunnable Supabase SQL for VetLearnCPD exotics formulary batches.

Usage:
  py scripts\generate_exotics_sql.py supabase\exotics_batch_3.json supabase\exotics_batch_3.sql

The input JSON should contain:
{
  "tag": "VetLearn Exotics Seed v3",
  "drugs": [...],
  "information": [...],
  "warnings": [...],
  "contraindications": [...],
  "adverse_effects": [...],
  "monitoring": [...],
  "pearls": [...],
  "species_warnings": [...],
  "interactions": [...]
}
"""

import json
import sys
from pathlib import Path
from decimal import Decimal, InvalidOperation


DRUG_COLUMNS = [
    "name", "species", "indication", "route", "dose_min", "dose_max", "dose_unit",
    "frequency", "notes", "source", "category", "formulary_page", "authorised",
    "search_terms", "species_priority", "route_priority", "evidence_notes",
    "formulation", "active", "verified", "bsava_edition", "concentration",
    "source_verified", "renal_adjustment", "hepatic_adjustment",
    "calculator_enabled", "user_id", "custom_details",
]


def q(value):
    """Return a SQL literal."""
    if value is None:
        return "null"

    if isinstance(value, bool):
        return "true" if value else "false"

    if isinstance(value, (int, float, Decimal)):
        return str(value)

    if isinstance(value, list):
        return "array[" + ", ".join(q(str(item)) for item in value) + "]::text[]"

    if isinstance(value, dict):
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
        return q(text) + "::jsonb"

    text = str(value).replace("'", "''")
    return f"'{text}'"


def num_or_none(value):
    if value in ("", None):
        return None
    try:
        return Decimal(str(value))
    except InvalidOperation as exc:
        raise ValueError(f"Expected numeric value, got {value!r}") from exc


def clean_drug(row, tag):
    required = ["name", "species", "category", "indication"]
    for key in required:
        if not str(row.get(key, "")).strip():
            raise ValueError(f"Drug row missing required field {key}: {row}")

    dose_unit = row.get("dose_unit")
    dose_min = num_or_none(row.get("dose_min"))
    dose_max = num_or_none(row.get("dose_max"))

    # Reliability rule: the current VetLearn calculator behaves as a mg/kg calculator.
    # Anything else is still visible in the formulary, but hidden from calculator.
    requested_calc = bool(row.get("calculator_enabled", True))
    safe_for_calc = (
        requested_calc
        and dose_min is not None
        and dose_max is not None
        and str(dose_unit or "").lower() == "mg/kg"
    )

    return {
        "name": row["name"],
        "species": row["species"],
        "indication": row.get("indication"),
        "route": row.get("route"),
        "dose_min": dose_min,
        "dose_max": dose_max,
        "dose_unit": dose_unit,
        "frequency": row.get("frequency"),
        "notes": row.get("notes"),
        "source": tag,
        "category": row.get("category"),
        "formulary_page": row.get("formulary_page"),
        "authorised": bool(row.get("authorised", False)),
        "search_terms": row.get("search_terms", []),
        "species_priority": int(row.get("species_priority", 50)),
        "route_priority": int(row.get("route_priority", 10)),
        "evidence_notes": row.get(
            "evidence_notes",
            "Exotics dosing often uses limited evidence, extrapolation or clinical experience. Use cascade judgement and patient-specific assessment."
        ),
        "formulation": row.get("formulation"),
        "active": bool(row.get("active", True)),
        "verified": bool(row.get("verified", True)),
        "bsava_edition": row.get("bsava_edition", "11th Edition Part B"),
        "concentration": num_or_none(row.get("concentration")),
        "source_verified": bool(row.get("source_verified", True)),
        "renal_adjustment": bool(row.get("renal_adjustment", False)),
        "hepatic_adjustment": bool(row.get("hepatic_adjustment", False)),
        "calculator_enabled": safe_for_calc,
        "user_id": None,
        "custom_details": row.get("custom_details", {}),
    }


def values_block(rows, columns):
    if not rows:
        return ""
    lines = []
    for row in rows:
        vals = ", ".join(q(row.get(col)) for col in columns)
        lines.append(f"  ({vals})")
    return ",\n".join(lines)


def insert_sql(table, columns, rows):
    if not rows:
        return f"-- No rows for public.{table}\n"

    return (
        f"insert into public.{table} ({', '.join(columns)})\n"
        f"values\n"
        f"{values_block(rows, columns)};\n"
    )


def validate_payload(data):
    if "tag" not in data or not str(data["tag"]).strip():
        raise ValueError("JSON must include a non-empty 'tag', e.g. VetLearn Exotics Seed v3")

    for key in [
        "drugs", "information", "warnings", "contraindications", "adverse_effects",
        "monitoring", "pearls", "species_warnings", "interactions"
    ]:
        data.setdefault(key, [])
        if not isinstance(data[key], list):
            raise ValueError(f"'{key}' must be a list")


def generate_sql(data):
    validate_payload(data)
    tag = data["tag"]

    drugs = [clean_drug(row, tag) for row in data["drugs"]]

    information = [
        {
            "drug_name": r["drug_name"],
            "section": r.get("section", "Exotics overview"),
            "content": r["content"],
            "title": tag,
            "description": r.get("description", "Paraphrased exotic monograph seed."),
        }
        for r in data["information"]
    ]

    warnings = [
        {
            "drug_id": None,
            "warning_type": r.get("warning_type", "Clinical caution"),
            "warning_text": r["warning_text"],
            "species": r.get("species", "All"),
            "severity": r.get("severity", "Moderate"),
            "drug_name": r["drug_name"],
            "title": tag,
            "description": r.get("description", "Exotics seed warning"),
        }
        for r in data["warnings"]
    ]

    contraindications = [
        {
            "drug_id": None,
            "drug_name": r["drug_name"],
            "species": r.get("species", "All"),
            "contraindication": r["contraindication"],
            "severity": r.get("severity", "High"),
            "notes": r.get("notes"),
            "title": tag,
            "description": r.get("description", "Exotics seed contraindication"),
        }
        for r in data["contraindications"]
    ]

    adverse_effects = [
        {
            "drug_name": r["drug_name"],
            "effect": r["effect"],
            "frequency": r.get("frequency"),
            "severity": r.get("severity", "Moderate"),
            "title": tag,
            "description": r.get("description", "Exotics seed adverse effect"),
        }
        for r in data["adverse_effects"]
    ]

    monitoring = [
        {
            "drug_id": None,
            "drug_name": r["drug_name"],
            "monitoring_parameter": r["monitoring_parameter"],
            "monitoring_frequency": r.get("monitoring_frequency"),
            "notes": r.get("notes"),
            "title": tag,
            "description": r.get("description", "Exotics seed monitoring"),
        }
        for r in data["monitoring"]
    ]

    pearls = [
        {
            "drug_name": r["drug_name"],
            "pearl": r["pearl"],
            "title": tag,
            "description": r.get("description", "Exotics seed pearl"),
        }
        for r in data["pearls"]
    ]

    species_warnings = [
        {
            "drug_name": r["drug_name"],
            "species": r["species"],
            "warning": r["warning"],
            "severity": r.get("severity", "Moderate"),
            "title": tag,
            "description": r.get("description", "Exotics seed species warning"),
        }
        for r in data["species_warnings"]
    ]

    interactions = [
        {
            "drug_a": r["drug_a"],
            "drug_b": r["drug_b"],
            "severity": r.get("severity", "Moderate"),
            "mechanism": r.get("mechanism"),
            "recommendation": r.get("recommendation"),
            "drug_name": r.get("drug_name", r["drug_a"]),
            "interacting_drug": r.get("interacting_drug", r["drug_b"]),
            "interaction": r.get("interaction"),
            "title": tag,
            "description": r.get("description", "Exotics seed interaction"),
        }
        for r in data["interactions"]
    ]

    sql = []
    sql.append("begin;\n")
    sql.append(f"-- {tag}\n")
    sql.append("-- Generated by scripts/generate_exotics_sql.py. Safe to re-run.\n\n")

    sql.append(f"delete from public.drug_interactions where title = {q(tag)};\n")
    sql.append(f"delete from public.species_warnings where title = {q(tag)};\n")
    sql.append(f"delete from public.monitoring_recommendations where title = {q(tag)};\n")
    sql.append(f"delete from public.contraindications where title = {q(tag)};\n")
    sql.append(f"delete from public.drug_warnings where title = {q(tag)};\n")
    sql.append(f"delete from public.adverse_effects where title = {q(tag)};\n")
    sql.append(f"delete from public.clinical_pearls where title = {q(tag)};\n")
    sql.append(f"delete from public.drug_information where title = {q(tag)};\n")
    sql.append(f"delete from public.drugs where source = {q(tag)};\n\n")

    sql.append(insert_sql("drugs", DRUG_COLUMNS, drugs))
    sql.append("\n")
    sql.append(insert_sql("drug_information", ["drug_name", "section", "content", "title", "description"], information))
    sql.append("\n")
    sql.append(insert_sql("drug_warnings", ["drug_id", "warning_type", "warning_text", "species", "severity", "drug_name", "title", "description"], warnings))
    sql.append("\n")
    sql.append(insert_sql("contraindications", ["drug_id", "drug_name", "species", "contraindication", "severity", "notes", "title", "description"], contraindications))
    sql.append("\n")
    sql.append(insert_sql("adverse_effects", ["drug_name", "effect", "frequency", "severity", "title", "description"], adverse_effects))
    sql.append("\n")
    sql.append(insert_sql("monitoring_recommendations", ["drug_id", "drug_name", "monitoring_parameter", "monitoring_frequency", "notes", "title", "description"], monitoring))
    sql.append("\n")
    sql.append(insert_sql("clinical_pearls", ["drug_name", "pearl", "title", "description"], pearls))
    sql.append("\n")
    sql.append(insert_sql("species_warnings", ["drug_name", "species", "warning", "severity", "title", "description"], species_warnings))
    sql.append("\n")
    sql.append(insert_sql("drug_interactions", ["drug_a", "drug_b", "severity", "mechanism", "recommendation", "drug_name", "interacting_drug", "interaction", "title", "description"], interactions))
    sql.append("\ncommit;\n\n")

    sql.append("-- Quick checks\n")
    sql.append(f"select count(*) as drug_rows from public.drugs where source = {q(tag)};\n")
    sql.append(
        f"select species, category, count(*) as rows\n"
        f"from public.drugs\n"
        f"where source = {q(tag)}\n"
        f"group by species, category\n"
        f"order by species, category;\n"
    )
    sql.append(
        "select\n"
        f"  (select count(*) from public.drug_information where title = {q(tag)}) as monograph_sections,\n"
        f"  (select count(*) from public.drug_warnings where title = {q(tag)}) as warnings,\n"
        f"  (select count(*) from public.contraindications where title = {q(tag)}) as contraindications,\n"
        f"  (select count(*) from public.adverse_effects where title = {q(tag)}) as adverse_effects,\n"
        f"  (select count(*) from public.monitoring_recommendations where title = {q(tag)}) as monitoring,\n"
        f"  (select count(*) from public.clinical_pearls where title = {q(tag)}) as pearls,\n"
        f"  (select count(*) from public.species_warnings where title = {q(tag)}) as species_warnings,\n"
        f"  (select count(*) from public.drug_interactions where title = {q(tag)}) as interactions;\n"
    )

    sql.append("\n-- Calculator safety check: should return zero rows.\n")
    sql.append(
        f"select name, species, dose_unit, dose_min, dose_max, calculator_enabled\n"
        f"from public.drugs\n"
        f"where source = {q(tag)}\n"
        f"  and calculator_enabled = true\n"
        f"  and (dose_min is null or dose_max is null or lower(coalesce(dose_unit, '')) <> 'mg/kg');\n"
    )

    return "".join(sql)


def main():
    if len(sys.argv) != 3:
        print("Usage: py scripts\\generate_exotics_sql.py input.json output.sql", file=sys.stderr)
        sys.exit(2)

    input_path = Path(sys.argv[1])
    output_path = Path(sys.argv[2])

    data = json.loads(input_path.read_text(encoding="utf-8"))
    sql = generate_sql(data)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(sql, encoding="utf-8")

    print(f"Wrote {output_path}")
    print(f"Tag: {data['tag']}")
    print(f"Drug rows: {len(data.get('drugs', []))}")
    print("Now paste the generated SQL into Supabase SQL Editor and run it.")


if __name__ == "__main__":
    main()