import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

// TOF-0794 (Tarek 31.10.2026): Quelltext-Wächter für das On-Premise-Paket
// deployment/task-tracker-usb ("task-tracker-onprem").

const DIR = "deployment/task-tracker-usb";
const read = (p: string) => readFileSync(join(DIR, p), "utf8");

function shellScripts(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...shellScripts(p));
    else if (name.endsWith(".sh")) out.push(p);
  }
  return out;
}

describe("TOF-0794: On-Premise-Paket", () => {
  it("bootstrap-admin.cjs gibt nie ein Klartext-Passwort aus", () => {
    const src = read("lib/bootstrap-admin.cjs");
    const outputs = src.split("\n").filter((l) => /console\.(log|error|info|warn)\(/.test(l));
    expect(outputs.length).toBeGreaterThan(0);
    // Was in den Ausgaben interpoliert wird: nie Passwort, Geheimnis oder Hash.
    const interpolated = outputs.flatMap((l) => [...l.matchAll(/\$\{([^}]*)\}/g)].map((m) => m[1]));
    expect(interpolated.length).toBeGreaterThan(0);
    for (const expr of interpolated) {
      expect(expr).not.toMatch(/PASSWORD|secret|hash|Hash/);
      if (/\braw\b/.test(expr)) expect(expr).toBe("inviteUrl(PUBLIC_URL, raw)");
    }
    for (const l of outputs) expect(l).not.toMatch(/PASSWORD|secret|passwordHash/);
    // Der Klartext-Token verlässt das Skript nur innerhalb des Links.
    expect(src).toMatch(/console\.log\(`invite_url=\$\{inviteUrl\(PUBLIC_URL, raw\)\}`\)/);
    // Gleiche Primitive wie src/lib/invite.ts
    expect(src).toMatch(/randomBytes\(INVITE_TOKEN_BYTES\)\.toString\("base64url"\)/);
    expect(src).toMatch(/createHash\("sha256"\)\.update\(raw, "utf8"\)\.digest\("hex"\)/);
    expect(src).toMatch(/\/einladung\//);
    expect(src).toMatch(/const ROLE = "BackendAdmin"/);
  });

  it("install.sh: --tls internal/http/domain, Standard internal, kein generiertes Admin-Passwort", () => {
    const src = read("install.sh");
    expect(src).toMatch(/--tls\) ARG_TLS=/);
    expect(src).toMatch(/case "\$ARG_TLS" in ""\|internal\|domain\|http\)/);
    for (const mode of ["internal", "http", "domain"]) {
      expect(src).toMatch(new RegExp(`^\\s+${mode}\\)`, "m"));
    }
    expect(src).toMatch(/TLS_MODE="internal"/);
    expect(src).toMatch(/templates\/Caddyfile\.internal/);
    expect(src).toMatch(/COOKIE_SECURE="false"/);
    expect(src).not.toMatch(/ADMIN_PASSWORD="\$\(rand_password/);
    expect(src).not.toMatch(/echo "Password: \$ADMIN_PASSWORD"/);
    expect(src).toMatch(/invite_url=/);
    expect(src).toMatch(/TT_OFFLINE_VALUE="1"; PULL_POLICY="never"/);
    expect(src).toMatch(/invite\.sh/);
  });

  it("Caddyfile.internal: tls internal, kein ACME/E-Mail, keine OCSP-Abrufe", () => {
    const c = read("templates/Caddyfile.internal");
    const directives = c
      .split("\n")
      .filter((l) => !l.trim().startsWith("#"))
      .join("\n");
    expect(directives).toMatch(/^\s*tls internal\s*$/m);
    expect(directives).toMatch(/^\s*local_certs\s*$/m);
    expect(directives).toMatch(/^\s*ocsp_stapling off\s*$/m);
    expect(directives).toMatch(/^\s*skip_install_trust\s*$/m);
    expect(directives).not.toMatch(/\bemail\b/);
    expect(directives).not.toMatch(/\bacme/);
  });

  it("docker-compose.yml: pull_policy steuerbar, Name als Build-Arg, CA-Ordner für caddy", () => {
    const y = read("docker-compose.yml");
    expect(y.match(/pull_policy: \$\{TT_PULL_POLICY:-missing\}/g)?.length).toBe(3);
    expect(y).toMatch(/NEXT_PUBLIC_APP_NAME: \$\{NEXT_PUBLIC_APP_NAME:-\}/);
    expect(y).toMatch(/\.\/ca:\/srv\/ca:ro/);
  });

  it("env.template kennt alle neuen Schalter", () => {
    const e = read("templates/env.template");
    for (const k of ["TT_TLS_MODE", "TT_PUBLIC_URL", "TT_OFFLINE", "TT_PULL_POLICY", "COOKIE_SECURE", "NEXT_PUBLIC_APP_NAME", "CHECKPOINT_DISABLE"]) {
      expect(e).toMatch(new RegExp(`^${k}=`, "m"));
    }
  });

  it("make-bundle.sh: Paketname task-tracker-onprem, --out, --app-name, debs je Ubuntu-Version", () => {
    const m = read("make-bundle.sh");
    expect(m).toMatch(/NAME="task-tracker-onprem-v\$VERSION"/);
    expect(m).toMatch(/--out\) OUT_DIR=/);
    expect(m).toMatch(/--build-arg "NEXT_PUBLIC_APP_NAME=\$APP_NAME"/);
    expect(m).toMatch(/"jammy=ubuntu:22\.04" "noble=ubuntu:24\.04"/);
    expect(m).toMatch(/tar -C "\$OUT_DIR" -czf "\$TARGZ"/);
    expect(read("VERSION").trim()).toBe("1.1.0");
  });

  it("alle .sh im deployment-Ordner: LF-Zeilenenden und set -euo pipefail", () => {
    const files = shellScripts("deployment");
    expect(files.length).toBeGreaterThanOrEqual(8);
    for (const f of files) {
      const s = readFileSync(f, "utf8");
      expect(s.includes("\r"), `${f} hat CRLF`).toBe(false);
      expect(s, `${f} ohne set -euo pipefail`).toMatch(/^set -euo pipefail$/m);
      expect(s.startsWith("#!/usr/bin/env bash\n"), `${f} ohne bash-Shebang`).toBe(true);
    }
  });
});

// TOF-0794 (Offline-Test 31.10.2026): Rollback = Daten UND vorherige Version.
describe("TOF-0794: update.sh --rollback stellt auch die alte Version ein", () => {
  it("liest die Version aus dem MANIFEST des Vor-Update-Backups und setzt TT_VERSION zurück", () => {
    const s = readFileSync("deployment/task-tracker-usb/update.sh", "utf8");
    expect(s).toMatch(/Version \*: \*/);
    expect(s).toMatch(/ROLLBACK_TO_VERSION/);
    expect(s).toMatch(/s\/\^TT_VERSION=\.\*\/TT_VERSION=\$ROLLBACK_TO_VERSION\//);
  });
});
