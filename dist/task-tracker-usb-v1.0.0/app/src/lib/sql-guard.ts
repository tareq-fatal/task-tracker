// Pure classification for the DB admin console. Unit-tested.

const DANGER = /\b(DROP|TRUNCATE|DELETE|UPDATE|INSERT|ALTER|GRANT|REVOKE|CREATE|REPLACE|MERGE|COPY)\b/i;
const READ_FIRST = ["SELECT", "EXPLAIN", "SHOW", "WITH", "TABLE", "VALUES"];

export type QueryClass = {
  firstWord: string;
  readOnly: boolean; // safe to run without write-mode
  dangerous: boolean; // contains a mutating/DDL keyword
  multiStatement: boolean; // stacked statements (blocked)
};

export function classifyQuery(raw: string): QueryClass {
  const sql = raw
    .replace(/--.*$/gm, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  const firstWord = (sql.match(/^\s*([a-zA-Z]+)/)?.[1] ?? "").toUpperCase();
  const dangerous = DANGER.test(sql);
  const readOnly = READ_FIRST.includes(firstWord) && !dangerous;
  const multiStatement = sql.replace(/;\s*$/, "").includes(";");
  return { firstWord, readOnly, dangerous, multiStatement };
}

/** Whether a query may run given the current mode. */
export function isAllowed(q: QueryClass, writeMode: boolean): { ok: boolean; reason?: string } {
  if (q.multiStatement) return { ok: false, reason: "MULTI_STATEMENT" };
  if (!q.firstWord) return { ok: false, reason: "EMPTY" };
  if (q.readOnly) return { ok: true };
  if (!writeMode) return { ok: false, reason: "WRITE_MODE_REQUIRED" };
  return { ok: true };
}
