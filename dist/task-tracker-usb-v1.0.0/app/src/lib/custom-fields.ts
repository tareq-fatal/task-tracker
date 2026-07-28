// Custom field types: validation, coercion, display. Pure + unit-tested.

export const FIELD_TYPES = ["text", "number", "select", "date", "checkbox", "user"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

/** Types whose stored value must be one of a fixed set passed in as `options`. */
export const CHOICE_TYPES = ["select", "user"] as const;

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

/**
 * Validate + normalize a raw input for storage. Empty → cleared (value "").
 * For `select` the `options` are the allowed labels; for `user` they are the
 * allowed user ids (membership is enforced by the caller passing tenant ids).
 */
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
    case "user":
      return options.includes(v) ? { ok: true, value: v } : { ok: false, error: "NOT_A_USER" };
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
        ? { ok: true, value: v }
        : { ok: false, error: "BAD_DATE" };
    case "checkbox":
      return { ok: true, value: v === "true" || v === "1" ? "true" : "false" };
  }
}

/**
 * Human-readable rendering of a stored value. For `user` fields the stored
 * value is a user id — pass a `userNames` id→name map to resolve it.
 */
export function displayValue(
  type: FieldType,
  value: string,
  userNames?: Record<string, string>
): string {
  if (!value) return "—";
  if (type === "checkbox") return value === "true" ? "✓" : "—";
  if (type === "user") return userNames?.[value] ?? value;
  return value;
}

/**
 * Coerce a stored value into a sortable key. Numbers/dates sort numerically;
 * everything else sorts as a lower-cased string. Empty values always sort last
 * (ascending) via the sentinels. `userNames` resolves user ids to names so
 * user columns sort by display name.
 */
export function sortKeyFor(
  type: FieldType,
  value: string,
  userNames?: Record<string, string>
): number | string {
  if (!value) return type === "number" || type === "date" ? Number.POSITIVE_INFINITY : "￿";
  switch (type) {
    case "number":
      return Number(value);
    case "date":
      return Date.parse(value);
    case "checkbox":
      return value === "true" ? 0 : 1; // checked first when ascending
    case "user":
      return (userNames?.[value] ?? value).toLowerCase();
    default:
      return value.toLowerCase();
  }
}
