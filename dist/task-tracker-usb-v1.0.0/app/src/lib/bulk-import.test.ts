import { describe, it, expect } from "vitest";
import { utils, write, read } from "xlsx";
import {
  parseImportFile,
  parseImportDate,
  parseImportNumber,
  parseStatus,
  parsePriority,
  parseType,
  parseRole,
  parseLocale,
  validateTaskRows,
  validateUserRows,
  validateProjectRows,
  buildTemplateXlsx,
  buildTemplateCsv,
  ENTITY_COLUMNS,
  MAX_IMPORT_ROWS,
  type ValidationCtx,
  type RawRow,
} from "./bulk-import";

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

function xlsxBuffer(rows: unknown[][]): Buffer {
  const wb = utils.book_new();
  utils.book_append_sheet(wb, utils.aoa_to_sheet(rows), "Data");
  return write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

function csvBuffer(text: string): Buffer {
  return Buffer.from(text, "utf-8");
}

function emptyCtx(): ValidationCtx {
  return {
    existingTaskKeys: new Set(),
    projectsByName: new Map(),
    usersByHandle: new Map(),
    existingUsernames: new Set(),
    existingEmails: new Set(),
    existingProjectNames: new Set(),
  };
}

function raw(values: Record<string, unknown>, sheetRow = 2): RawRow {
  return { sheetRow, values };
}

/* ------------------------------------------------------------------ */
/* value parsers                                                       */
/* ------------------------------------------------------------------ */

describe("parseImportDate", () => {
  it("parses ISO dates", () => {
    const d = parseImportDate("2026-07-15")!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(6);
    expect(d.getUTCDate()).toBe(15);
  });
  it("parses German DD.MM.YYYY dates", () => {
    const d = parseImportDate("15.07.2026")!;
    expect(d.getUTCMonth()).toBe(6);
    expect(d.getUTCDate()).toBe(15);
  });
  it("parses Excel serial numbers", () => {
    // 45000 = 2023-03-15
    const d = parseImportDate(45000)!;
    expect(d.getUTCFullYear()).toBe(2023);
  });
  it("returns undefined for empty and null for garbage", () => {
    expect(parseImportDate("")).toBeUndefined();
    expect(parseImportDate(null)).toBeUndefined();
    expect(parseImportDate("not a date")).toBeNull();
    expect(parseImportDate("32.13.2026")).toBeNull();
  });
});

describe("parseImportNumber", () => {
  it("accepts numbers and German comma decimals", () => {
    expect(parseImportNumber(2.5)).toBe(2.5);
    expect(parseImportNumber("2,5")).toBe(2.5);
    expect(parseImportNumber("3")).toBe(3);
  });
  it("returns undefined for empty, null for invalid", () => {
    expect(parseImportNumber("")).toBeUndefined();
    expect(parseImportNumber(undefined)).toBeUndefined();
    expect(parseImportNumber("abc")).toBeNull();
  });
});

describe("enum parsers", () => {
  it("maps synonyms (de/en/ar) case-insensitively", () => {
    expect(parseStatus("ERLEDIGT")).toBe("Done");
    expect(parseStatus("in bearbeitung")).toBe("InProgress");
    expect(parseStatus("قيد التنفيذ")).toBe("InProgress");
    expect(parseStatus("Todo")).toBe("Todo");
    expect(parsePriority("dringend")).toBe("Critical");
    expect(parsePriority("hoch")).toBe("High");
    expect(parseType("fehler")).toBe("Bug");
    expect(parseRole("benutzer")).toBe("User");
    expect(parseRole("Admin")).toBe("Admin");
    expect(parseLocale("Deutsch")).toBe("de");
  });
  it("empty → undefined (use default), unknown → null (error)", () => {
    expect(parseStatus("")).toBeUndefined();
    expect(parseStatus("banana")).toBeNull();
    expect(parseRole("BackendAdmin")).toBeNull(); // never assignable via import
  });
});

/* ------------------------------------------------------------------ */
/* file parsing                                                        */
/* ------------------------------------------------------------------ */

describe("parseImportFile", () => {
  it("parses xlsx with canonical headers", () => {
    const buf = xlsxBuffer([
      ["Title", "Status", "Priority"],
      ["Task A", "Done", "High"],
      ["Task B", "", ""],
    ]);
    const res = parseImportFile(buf, "tasks");
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(2);
    expect(res.rows[0].sheetRow).toBe(2);
    expect(res.rows[0].values.title).toBe("Task A");
  });

  it("matches German header aliases case-insensitively", () => {
    const buf = xlsxBuffer([
      ["TITEL", "Fälligkeitsdatum", "Priorität"],
      ["Aufgabe", "15.07.2026", "hoch"],
    ]);
    const res = parseImportFile(buf, "tasks");
    expect(res.ok).toBe(true);
    expect(res.rows[0].values.title).toBe("Aufgabe");
    expect(res.rows[0].values.dueDate).toBe("15.07.2026");
    expect(res.rows[0].values.priority).toBe("hoch");
  });

  it("parses CSV buffers", () => {
    const buf = csvBuffer("Name,Username,Email\nMax Muster,max,max@firma.de\n");
    const res = parseImportFile(buf, "users");
    expect(res.ok).toBe(true);
    expect(res.rows[0].values.username).toBe("max");
    expect(res.rows[0].values.email).toBe("max@firma.de");
  });

  it("reports missing required columns by canonical header", () => {
    const buf = xlsxBuffer([["Description"], ["only a description"]]);
    const res = parseImportFile(buf, "tasks");
    expect(res.ok).toBe(false);
    expect(res.error).toBe("MISSING_COLUMNS");
    expect(res.missingColumns).toEqual(["Title"]);
  });

  it("rejects empty files and header-only files", () => {
    expect(parseImportFile(xlsxBuffer([["Title"]]), "tasks").error).toBe("EMPTY");
  });

  it("skips fully empty lines", () => {
    const buf = csvBuffer("Title\nA\n\n\nB\n");
    const res = parseImportFile(buf, "tasks");
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(2);
  });

  it("caps at MAX_IMPORT_ROWS", () => {
    const lines = ["Name", ...Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `P${i}`)];
    const res = parseImportFile(csvBuffer(lines.join("\n")), "projects");
    expect(res.error).toBe("TOO_MANY_ROWS");
  });
});

/* ------------------------------------------------------------------ */
/* task validation                                                     */
/* ------------------------------------------------------------------ */

describe("validateTaskRows", () => {
  it("applies defaults and resolves lookups", () => {
    const ctx = emptyCtx();
    ctx.projectsByName.set("crm", "p1");
    ctx.usersByHandle.set("max", "u1");
    const { reports, payloads } = validateTaskRows(
      [raw({ title: "A", project: "CRM", assignee: "max" })],
      ctx
    );
    expect(reports[0].status).toBe("create");
    expect(payloads[0]).toMatchObject({
      title: "A",
      status: "Todo",
      priority: "Medium",
      type: "Task",
      projectId: "p1",
      assignedToUserId: "u1",
    });
  });

  it("errors on unknown project / assignee / bad values", () => {
    const { reports } = validateTaskRows(
      [
        raw({ title: "A", project: "Nope", assignee: "ghost", status: "banana", dueDate: "xx", storyPoints: "1.5" }),
      ],
      emptyCtx()
    );
    expect(reports[0].status).toBe("error");
    const codes = reports[0].issues.map((i) => i.code);
    expect(codes).toContain("UNKNOWN_PROJECT");
    expect(codes).toContain("UNKNOWN_ASSIGNEE");
    expect(codes).toContain("BAD_ENUM");
    expect(codes).toContain("BAD_DATE");
    expect(codes).toContain("BAD_NUMBER");
  });

  it("errors on missing title", () => {
    const { reports } = validateTaskRows([raw({ title: "" })], emptyCtx());
    expect(reports[0].status).toBe("error");
    expect(reports[0].issues[0].code).toBe("MISSING_REQUIRED");
  });

  it("skips duplicates within the file and against the DB", () => {
    const ctx = emptyCtx();
    ctx.existingTaskKeys.add("old|");
    const { reports } = validateTaskRows(
      [raw({ title: "New" }, 2), raw({ title: "new" }, 3), raw({ title: "Old" }, 4)],
      ctx
    );
    expect(reports.map((r) => r.status)).toEqual(["create", "skip", "skip"]);
    expect(reports[1].issues[0].code).toBe("DUPLICATE_IN_FILE");
    expect(reports[2].issues[0].code).toBe("ALREADY_EXISTS");
  });

  it("same title in different projects is not a duplicate", () => {
    const ctx = emptyCtx();
    ctx.projectsByName.set("a", "p1");
    ctx.projectsByName.set("b", "p2");
    const { reports } = validateTaskRows(
      [raw({ title: "T", project: "A" }, 2), raw({ title: "T", project: "B" }, 3)],
      ctx
    );
    expect(reports.map((r) => r.status)).toEqual(["create", "create"]);
  });
});

/* ------------------------------------------------------------------ */
/* user validation                                                     */
/* ------------------------------------------------------------------ */

describe("validateUserRows", () => {
  it("lowercases username/email; empty password → null (temp)", () => {
    const { reports, payloads } = validateUserRows(
      [raw({ name: "Max", username: "MaxM", email: "Max@Firma.DE" })],
      emptyCtx()
    );
    expect(reports[0].status).toBe("create");
    expect(payloads[0]).toMatchObject({
      username: "maxm",
      email: "max@firma.de",
      role: "User",
      password: null,
    });
  });

  it("validates username format and password length", () => {
    const { reports } = validateUserRows(
      [
        raw({ name: "A", username: "x" }, 2), // too short
        raw({ name: "B", username: "has space" }, 3),
        raw({ name: "C", username: "okname", password: "123" }, 4),
        raw({ name: "D", username: "okname2", email: "not-an-email" }, 5),
      ],
      emptyCtx()
    );
    expect(reports[0].issues[0].code).toBe("BAD_USERNAME");
    expect(reports[1].issues[0].code).toBe("BAD_USERNAME");
    expect(reports[2].issues[0].code).toBe("PASSWORD_TOO_SHORT");
    expect(reports[3].issues[0].code).toBe("BAD_EMAIL");
  });

  it("skips existing usernames (global) and emails (tenant)", () => {
    const ctx = emptyCtx();
    ctx.existingUsernames.add("taken");
    ctx.existingEmails.add("used@x.de");
    const { reports } = validateUserRows(
      [
        raw({ name: "A", username: "Taken" }, 2),
        raw({ name: "B", username: "fresh", email: "used@x.de" }, 3),
        raw({ name: "C", username: "fresh2" }, 4),
        raw({ name: "D", username: "fresh2" }, 5), // dup in file
      ],
      ctx
    );
    expect(reports.map((r) => r.status)).toEqual(["skip", "skip", "create", "skip"]);
    expect(reports[3].issues[0].code).toBe("DUPLICATE_IN_FILE");
  });
});

/* ------------------------------------------------------------------ */
/* project validation                                                  */
/* ------------------------------------------------------------------ */

describe("validateProjectRows", () => {
  it("defaults color, validates hex", () => {
    const { reports, payloads } = validateProjectRows(
      [raw({ name: "P1" }, 2), raw({ name: "P2", color: "#AB12cd" }, 3), raw({ name: "P3", color: "red" }, 4)],
      emptyCtx()
    );
    expect(payloads[0]?.color).toBe("#6366f1");
    expect(payloads[1]?.color).toBe("#AB12cd");
    expect(reports[2].status).toBe("error");
    expect(reports[2].issues[0].code).toBe("BAD_COLOR");
  });

  it("skips duplicates (file + existing, case-insensitive)", () => {
    const ctx = emptyCtx();
    ctx.existingProjectNames.add("crm");
    const { reports } = validateProjectRows(
      [raw({ name: "CRM" }, 2), raw({ name: "New" }, 3), raw({ name: "new" }, 4)],
      ctx
    );
    expect(reports.map((r) => r.status)).toEqual(["skip", "create", "skip"]);
  });
});

/* ------------------------------------------------------------------ */
/* templates                                                           */
/* ------------------------------------------------------------------ */

describe("templates", () => {
  it("xlsx template round-trips through the parser's header matching", () => {
    for (const entity of ["tasks", "users", "projects"] as const) {
      const buf = buildTemplateXlsx(entity);
      const wb = read(buf, { type: "buffer" });
      expect(wb.SheetNames[0]).toBe("Data");
      expect(wb.SheetNames).toContain("Hints");
      const grid = utils.sheet_to_json(wb.Sheets.Data, { header: 1 }) as unknown[][];
      expect(grid[0]).toEqual(ENTITY_COLUMNS[entity].map((c) => c.header));
    }
  });

  it("csv template contains exactly the canonical headers", () => {
    expect(buildTemplateCsv("users").trim()).toBe("Name,Username,Email,Role,Locale,Password");
  });

  it("a filled template imports cleanly", () => {
    const headers = ENTITY_COLUMNS.tasks.map((c) => c.header);
    const buf = xlsxBuffer([
      headers,
      ["My Task", "Desc", "InProgress", "High", "Bug", "", "", "2026-08-01", 3, "2,5"],
    ]);
    const parsed = parseImportFile(buf, "tasks");
    expect(parsed.ok).toBe(true);
    const { reports, payloads } = validateTaskRows(parsed.rows, emptyCtx());
    expect(reports[0].status).toBe("create");
    expect(payloads[0]).toMatchObject({
      title: "My Task",
      status: "InProgress",
      priority: "High",
      type: "Bug",
      storyPoints: 3,
      estimatedHours: 2.5,
    });
  });
});
