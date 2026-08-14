import { describe, it, expect } from "vitest";
import { resolveEmailConfig, describeEmailConfig } from "./email-config";

describe("resolveEmailConfig", () => {
  it("is off when nothing is configured — the app must run without email", () => {
    const cfg = resolveEmailConfig({});
    expect(cfg.transport).toBe("none");
    expect(cfg.missing).toEqual([]);
  });

  it("picks SMTP when a mail server is given", () => {
    const cfg = resolveEmailConfig({ SMTP_HOST: "mail.example.de", SMTP_USER: "u", SMTP_PASSWORD: "p" });
    expect(cfg).toMatchObject({ transport: "smtp", host: "mail.example.de", port: 587, secure: false });
  });

  it("picks Resend when only an API key is given", () => {
    const cfg = resolveEmailConfig({ RESEND_API_KEY: "re_123" });
    expect(cfg).toMatchObject({ transport: "resend", apiKey: "re_123" });
  });

  it("prefers the own mail server when both are configured", () => {
    const cfg = resolveEmailConfig({ SMTP_HOST: "mail.example.de", RESEND_API_KEY: "re_123" });
    expect(cfg.transport).toBe("smtp");
  });

  it("lets EMAIL_TRANSPORT override the guess", () => {
    const cfg = resolveEmailConfig({
      EMAIL_TRANSPORT: "resend",
      SMTP_HOST: "mail.example.de",
      RESEND_API_KEY: "re_123",
    });
    expect(cfg.transport).toBe("resend");
    expect(resolveEmailConfig({ EMAIL_TRANSPORT: "none", RESEND_API_KEY: "re_1" }).transport).toBe("none");
  });

  it("says what is missing instead of failing silently", () => {
    expect(resolveEmailConfig({ EMAIL_TRANSPORT: "resend" }).missing).toEqual(["RESEND_API_KEY"]);
    expect(resolveEmailConfig({ EMAIL_TRANSPORT: "smtp" }).missing).toEqual(["SMTP_HOST"]);
    // Half-configured credentials are the classic silent failure.
    expect(resolveEmailConfig({ SMTP_HOST: "m.de", SMTP_USER: "u" }).missing).toEqual(["SMTP_PASSWORD"]);
    expect(resolveEmailConfig({ SMTP_HOST: "m.de", SMTP_PASSWORD: "p" }).missing).toEqual(["SMTP_USER"]);
  });

  it("allows a relay without credentials", () => {
    const cfg = resolveEmailConfig({ SMTP_HOST: "relay.intern", SMTP_PORT: "25" });
    expect(cfg).toMatchObject({ transport: "smtp", port: 25, secure: false });
    expect(cfg.missing).toEqual([]);
  });

  it("switches on implicit TLS for port 465, and lets SMTP_SECURE decide", () => {
    expect(resolveEmailConfig({ SMTP_HOST: "m.de", SMTP_PORT: "465" })).toMatchObject({ secure: true });
    expect(
      resolveEmailConfig({ SMTP_HOST: "m.de", SMTP_PORT: "465", SMTP_SECURE: "false" })
    ).toMatchObject({ secure: false });
  });

  it("takes sender and link base from the environment, never from code", () => {
    const cfg = resolveEmailConfig({
      RESEND_API_KEY: "re_1",
      EMAIL_FROM: "Objektus <no-reply@objektus.de>",
      APP_URL: "https://tasks.example.de/",
    });
    expect(cfg.from).toBe("Objektus <no-reply@objektus.de>");
    expect(cfg.baseUrl).toBe("https://tasks.example.de"); // trailing slash trimmed
  });

  it("never puts a password into the log line", () => {
    const cfg = resolveEmailConfig({ SMTP_HOST: "m.de", SMTP_USER: "u", SMTP_PASSWORD: "geheim" });
    const line = describeEmailConfig(cfg);
    expect(line).not.toContain("geheim");
    expect(line).toContain("m.de");
  });

  it("names the gap in the log line when it is off for a reason", () => {
    expect(describeEmailConfig(resolveEmailConfig({ EMAIL_TRANSPORT: "smtp" }))).toContain("SMTP_HOST");
  });
});
