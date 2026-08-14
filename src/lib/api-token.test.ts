import { describe, it, expect } from "vitest";
import {
  TOKEN_PREFIX,
  mintApiToken,
  hashApiToken,
  parseBearer,
  parseScopes,
  serializeScopes,
  hasScope,
  isTokenUsable,
  hashesMatch,
} from "./api-token";

describe("mintApiToken", () => {
  it("produces an identifiable, high-entropy token", () => {
    const { raw } = mintApiToken();
    expect(raw.startsWith(TOKEN_PREFIX)).toBe(true);
    // 32 bytes → 64 hex chars after the prefix
    expect(raw.length).toBe(TOKEN_PREFIX.length + 64);
  });

  it("never repeats", () => {
    const seen = new Set(Array.from({ length: 200 }, () => mintApiToken().raw));
    expect(seen.size).toBe(200);
  });

  it("returns the hash of the raw token, so only the hash need be stored", () => {
    const { raw, tokenHash } = mintApiToken();
    expect(tokenHash).toBe(hashApiToken(raw));
    // The raw token must not be derivable from what is persisted.
    expect(tokenHash).not.toContain(raw);
  });

  it("keeps a short, non-secret display prefix", () => {
    const { raw, prefix } = mintApiToken();
    expect(raw.startsWith(prefix)).toBe(true);
    expect(prefix.length).toBeLessThan(raw.length / 2); // far too little to guess from
  });
});

describe("parseBearer", () => {
  it("accepts a well-formed header, case-insensitively on the scheme", () => {
    const { raw } = mintApiToken();
    expect(parseBearer(`Bearer ${raw}`)).toBe(raw);
    expect(parseBearer(`bearer ${raw}`)).toBe(raw);
    expect(parseBearer(`  Bearer ${raw}  `)).toBe(raw);
  });

  it("rejects anything that is not a Bearer token of ours", () => {
    const { raw } = mintApiToken();
    expect(parseBearer(null)).toBeNull();
    expect(parseBearer("")).toBeNull();
    expect(parseBearer(raw)).toBeNull(); // no scheme
    expect(parseBearer(`Basic ${raw}`)).toBeNull();
    expect(parseBearer("Bearer")).toBeNull();
    expect(parseBearer("Bearer some-other-token")).toBeNull(); // wrong prefix
  });

  it("rejects a header carrying two values, so nothing smuggles a second token", () => {
    const { raw } = mintApiToken();
    expect(parseBearer(`Bearer ${raw} extra`)).toBeNull();
  });
});

describe("scopes", () => {
  it("parses a CSV and ignores anything unrecognised", () => {
    expect([...parseScopes("read,write")]).toEqual(["read", "write"]);
    expect([...parseScopes(" READ , write ")]).toEqual(["read", "write"]);
    expect([...parseScopes("read,admin,delete")]).toEqual(["read"]);
    expect([...parseScopes(null)]).toEqual([]);
    expect([...parseScopes("")]).toEqual([]);
  });

  it("serializes to a stable, deduped order", () => {
    expect(serializeScopes(["write", "read", "write"])).toBe("read,write");
    expect(serializeScopes(["read"])).toBe("read");
    expect(serializeScopes(["bogus"])).toBe("");
  });

  it("treats write as implying read", () => {
    const writeOnly = parseScopes("write");
    expect(hasScope(writeOnly, "read")).toBe(true);
    expect(hasScope(writeOnly, "write")).toBe(true);
  });

  it("never lets a read-only token write", () => {
    const readOnly = parseScopes("read");
    expect(hasScope(readOnly, "read")).toBe(true);
    expect(hasScope(readOnly, "write")).toBe(false);
  });

  it("gives an empty scope set no access at all", () => {
    const none = parseScopes("");
    expect(hasScope(none, "read")).toBe(false);
    expect(hasScope(none, "write")).toBe(false);
  });
});

describe("isTokenUsable", () => {
  const now = new Date("2026-08-14T12:00:00Z");

  it("accepts a token that is neither revoked nor expired", () => {
    expect(isTokenUsable({ revokedAt: null, expiresAt: null }, now)).toBe(true);
    expect(isTokenUsable({ expiresAt: new Date("2026-09-01T00:00:00Z") }, now)).toBe(true);
  });

  it("rejects a revoked token even when it has not expired", () => {
    expect(
      isTokenUsable(
        { revokedAt: new Date("2026-08-01T00:00:00Z"), expiresAt: new Date("2027-01-01T00:00:00Z") },
        now
      )
    ).toBe(false);
  });

  it("rejects an expired token, including exactly at the expiry instant", () => {
    expect(isTokenUsable({ expiresAt: new Date("2026-08-14T11:59:59Z") }, now)).toBe(false);
    expect(isTokenUsable({ expiresAt: now }, now)).toBe(false);
  });
});

describe("hashesMatch", () => {
  it("matches identical hashes and rejects different ones", () => {
    const a = hashApiToken("tt_mcp_aaa");
    expect(hashesMatch(a, hashApiToken("tt_mcp_aaa"))).toBe(true);
    expect(hashesMatch(a, hashApiToken("tt_mcp_bbb"))).toBe(false);
  });

  it("returns false instead of throwing on a length mismatch", () => {
    expect(hashesMatch(hashApiToken("x"), "short")).toBe(false);
  });
});
