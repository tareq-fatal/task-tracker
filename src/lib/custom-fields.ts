// Custom field types: validation, coercion, display. Pure + unit-tested.

export const FIELD_TYPES = ["text", "number", "select", "date", "checkbox"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export function isFieldType(v: string): v is FieldType {
  return (FIELD_TYPES as readonly string[]).includes(v);
}

export function parseOptions(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** Validate + normalize a raw input for storage. Empty → cleared (value ""). */
export function validateValue(
  type: FieldType,
  raw: string,
  options: string[] = []
): { ok: boolean; value?: string; error?: string } {
  const v = (raw ?? "").trim();
  if (v === "") return { ok: true, value: "" }; // clearing a value is allowed
  switch (type) {
    case "text":
      return { ok: true, value: v.slice(0, 500) };
    case "number": {
      if (!/^-?\d+(\.\d+)?$/.test(v)) return { ok: false, error: "NOT_A_NUMBER" };
      return { ok: true, value: String(Number(v)) };
    }
    case "select":
      return options.includes(v) ? { ok: true, value: v } : { ok: false, error: "NOT_AN_OPTION" };
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
        ? { ok: true, value: v }
        : { ok: false, error: "BAD_DATE" };
    case "checkbox":
      return { ok: true, value: v === "true" || v === "1" ? "true" : "false" };
  }
}

/** Human-readable rendering of a stored value. */
export function displayValue(type: FieldType, value: string): string {
  if (!value) return "—";
  if (type === "checkbox") return value === "true" ? "✓" : "—";
  return value;
}
