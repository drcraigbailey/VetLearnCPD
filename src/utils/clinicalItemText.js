const titleFields = [
  "title",
  "section",
  "information_type",
  "warning_type",
  "effect_type",
  "monitoring_type",
  "condition",
  "contraindication",
  "parameter",
  "interacting_drug",
  "drug_b",
  "category",
  "species",
  "name"
]

const bodyFields = [
  "description",
  "warning_text",
  "effect_text",
  "effect",
  "adverse_effect",
  "reason",
  "details",
  "text",
  "content",
  "information_text",
  "notes",
  "interaction",
  "mechanism",
  "recommendation",
  "monitoring",
  "pearl",
  "pearl_text",
  "summary",
  "warning",
  "contraindication"
]

const formularySourcePattern = /\bVetLearn\s+Exotics\s+(?:Feed|Seed)(?:\s*(?:#\s*[\w.-]+|v(?:ersion)?\s*[\w.-]+))?/gi

export const stripFormularySourceLabel = (value) => String(value || "")
  .replace(formularySourcePattern, "")
  .replace(/^[\s:|/–—-]+|[\s:|/–—-]+$/g, "")
  .replace(/\s{2,}/g, " ")
  .trim()

const metadataFields = new Set([
  "id",
  "drug_id",
  "drug_name",
  "created_at",
  "updated_at",
  "user_id",
  "owner_id",
  "active",
  "title",
  "severity",
  ...titleFields
])

const textValue = (value) => {
  if (value === null || value === undefined) return ""
  if (Array.isArray(value)) return value.map(textValue).filter(Boolean).join(", ")
  if (typeof value === "object") return ""
  return stripFormularySourceLabel(value)
}

const firstFieldText = (item, fields) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return ""
  for (const field of fields) {
    const value = textValue(item[field])
    if (value) return value
  }
  return ""
}

const fallbackBodyText = (item, title) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return ""

  for (const [field, value] of Object.entries(item)) {
    if (metadataFields.has(field)) continue
    const text = textValue(value)
    if (text && text !== title) return text
  }

  return ""
}

export const getClinicalItemTitle = (item) => firstFieldText(item, titleFields)

export const getClinicalItemBody = (item) => {
  if (item === null || item === undefined) return ""
  if (typeof item !== "object" || Array.isArray(item)) return textValue(item)

  const title = getClinicalItemTitle(item)
  const body = firstFieldText(item, bodyFields)
  if (body && body !== title) return body

  return fallbackBodyText(item, title)
}

export const getClinicalItemSeverity = (item) => {
  if (!item || typeof item !== "object" || Array.isArray(item)) return ""
  return textValue(item.severity)
}

export const formatClinicalItemText = (item) => {
  const title = getClinicalItemTitle(item)
  const body = getClinicalItemBody(item)
  const severity = getClinicalItemSeverity(item)

  return [
    title && title !== body ? title : "",
    body,
    severity ? `Severity: ${severity}` : ""
  ].filter(Boolean).join("\n")
}
