import { describe, expect, it } from "vitest";
import {
  LEAD_STATUSES,
  LEAD_STATUS_CHIP,
  acceptLeadLink,
  compareLeadsByNextAction,
  isLeadStatus,
  parseCommissionPct,
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
      value: { company: "ACME", contact: null, channel: "Instagram", referredBy: null, commissionPct: null, status: "New", nextAction: null, nextActionAt: null, notes: null },
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

// TOF-0786 (Tarek 28.10.2026): „vermittelt von“ + „Provision %“ je Lead.
describe("TOF-0786: Vermittlung und Provision", () => {
  it("liest Provision tolerant (Komma, Prozentzeichen), leer = keine", () => {
    expect(parseCommissionPct("20")).toEqual({ ok: true, value: 20 });
    expect(parseCommissionPct("12,5")).toEqual({ ok: true, value: 12.5 });
    expect(parseCommissionPct(" 7.25 % ")).toEqual({ ok: true, value: 7.25 });
    expect(parseCommissionPct("")).toEqual({ ok: true, value: null });
    expect(parseCommissionPct(null)).toEqual({ ok: true, value: null });
  });
  it("lehnt Unsinn und Werte außerhalb 0–100 ab", () => {
    for (const v of ["101", "-5", "abc", "1.234", "20%%", "1e2"]) expect(parseCommissionPct(v).ok, v).toBe(false);
  });
  it("parseLeadInput übernimmt Partnerin und Provision, meldet BAD_PERCENT", () => {
    const ok = parseLeadInput({ company: "Al Noor", referredBy: " خانم خليل ", commissionPct: "20" });
    expect(ok.ok && ok.value.referredBy).toBe("خانم خليل");
    expect(ok.ok && ok.value.commissionPct).toBe(20);
    expect(parseLeadInput({ company: "X", commissionPct: "150" })).toEqual({ ok: false, error: "BAD_PERCENT" });
    expect(parseLeadInput({ company: "X", referredBy: "a".repeat(161) })).toEqual({ ok: false, error: "TOO_LONG" });
  });
});
