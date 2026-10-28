import { describe, expect, it } from "vitest";
import {
  LEAD_STATUSES,
  LEAD_STATUS_CHIP,
  acceptLeadLink,
  compareLeadsByNextAction,
  isLeadStatus,
  parseLeadFilter,
  parseLeadInput,
  sortLeads,
} from "./leads";

// TOF-0782 (Tarek 28.10.2026): Leads je Projekt.
describe("lead status", () => {
  it("knows exactly New|Contacted|Offer|Won|Lost, each with a chip colour", () => {
    expect([...LEAD_STATUSES]).toEqual(["New", "Contacted", "Offer", "Won", "Lost"]);
    for (const s of LEAD_STATUSES) expect(LEAD_STATUS_CHIP[s]).toBeTruthy();
    expect(isLeadStatus("Won")).toBe(true);
    expect(isLeadStatus("won")).toBe(false);
    expect(isLeadStatus(undefined)).toBe(false);
  });
});

describe("parseLeadInput", () => {
  it("company required, empties become null, status defaults to New", () => {
    expect(parseLeadInput({ company: "  " })).toEqual({ ok: false, error: "COMPANY_REQUIRED" });
    const r = parseLeadInput({ company: " ACME ", contact: "", channel: " Instagram ", status: "", nextAction: "", nextActionAt: "", notes: "" });
    expect(r).toEqual({
      ok: true,
      value: { company: "ACME", contact: null, channel: "Instagram", status: "New", nextAction: null, nextActionAt: null, notes: null },
    });
  });

  it("parses the date input and rejects garbage", () => {
    const r = parseLeadInput({ company: "A", nextActionAt: "2026-11-02" });
    expect(r.ok && r.value.nextActionAt?.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(parseLeadInput({ company: "A", nextActionAt: "morgen" })).toEqual({ ok: false, error: "BAD_DATE" });
    expect(parseLeadInput({ company: "A", nextActionAt: "2026-13-45" })).toEqual({ ok: false, error: "BAD_DATE" });
  });

  it("rejects unknown status and over-long fields", () => {
    expect(parseLeadInput({ company: "A", status: "Maybe" })).toEqual({ ok: false, error: "BAD_STATUS" });
    expect(parseLeadInput({ company: "A".repeat(161) })).toEqual({ ok: false, error: "TOO_LONG" });
    expect(parseLeadInput({ company: "A", notes: "x".repeat(4001) })).toEqual({ ok: false, error: "TOO_LONG" });
  });

  it("keeps Arabic text as is", () => {
    const r = parseLeadInput({ company: "شركة النور", contact: "أحمد", status: "Offer" });
    expect(r.ok && r.value.company).toBe("شركة النور");
  });
});

describe("sorting by next action", () => {
  const d = (s: string) => new Date(s);
  it("ascending, empty dates last, ties by company", () => {
    const sorted = sortLeads([
      { company: "C", nextActionAt: null },
      { company: "B", nextActionAt: d("2026-11-05") },
      { company: "A", nextActionAt: null },
      { company: "D", nextActionAt: d("2026-11-01") },
    ]);
    expect(sorted.map((l) => l.company)).toEqual(["D", "B", "A", "C"]);
    expect(compareLeadsByNextAction({ company: "x", nextActionAt: null }, { company: "y", nextActionAt: d("2026-01-01") })).toBeGreaterThan(0);
  });
});

describe("parseLeadFilter", () => {
  it("accepts known status + archived=1 only", () => {
    expect(parseLeadFilter({ status: "Won", archived: "1" })).toEqual({ status: "Won", showArchived: true });
    expect(parseLeadFilter({ status: "drop table", archived: "yes" })).toEqual({ status: null, showArchived: false });
    expect(parseLeadFilter({ status: ["Lost", "Won"] })).toEqual({ status: "Lost", showArchived: false });
  });
});

describe("acceptLeadLink", () => {
  const lead = { id: "l1", tenantId: "tA", projectId: "p1", archivedAt: null };
  it("archived lead only stays linked if it already was", () => {
    const archived = { ...lead, archivedAt: new Date() };
    expect(acceptLeadLink(archived, { tenantId: "tA", projectId: "p1" }, null)).toBe(false);
    expect(acceptLeadLink(archived, { tenantId: "tA", projectId: "p1" }, "l1")).toBe(true);
    expect(acceptLeadLink(lead, { tenantId: "tA", projectId: "p1" })).toBe(true);
  });
});
