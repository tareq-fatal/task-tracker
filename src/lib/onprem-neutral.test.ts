import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { resolveBrandName, brandName, runtimeBrandName, normalizeBrandName } from "./brand";
import { getDictionary, dictionaries } from "./i18n";
import { seoCopy, SEO_COPY, siteUrl } from "./seo";
import { instanceUrl, instanceHost, SITE_URL, LEGACY_TELEGRAM_BOT } from "./instance-url";
import { resolveEmailConfig } from "./email-config";
import { isOnPrem, apkDownloadEnabled } from "./onprem";
import { buildOpenApiDocument } from "./openapi";

// TOF-0795 (Tarek 31.10.2026): On-Prem-Paket für Dritte — Name zur Laufzeit,
// neutrale Standardwerte, APK-Link aus, Ein-Datei-Installer, Nutzungshinweis.

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("TOF-0795: Name zur Laufzeit — Vorrang APP_NAME > NEXT_PUBLIC_APP_NAME > Standard", () => {
  it("reine Vorrang-Regel", () => {
    expect(resolveBrandName("Laufzeit", "Build")).toBe("Laufzeit");
    expect(resolveBrandName("", "Build")).toBe("Build");
    expect(resolveBrandName("   ", "Build")).toBe("Build");
    expect(resolveBrandName(undefined, undefined)).toBeNull();
    expect(resolveBrandName(null, "")).toBeNull();
  });

  it("normalisiert Leerzeichen und begrenzt die Länge", () => {
    expect(normalizeBrandName("  Hafen   Team ")).toBe("Hafen Team");
    expect(normalizeBrandName("x".repeat(200))).toHaveLength(80);
  });

  it("brandName/runtimeBrandName lesen die Umgebung", () => {
    expect(brandName({ APP_NAME: "A", NEXT_PUBLIC_APP_NAME: "B" })).toBe("A");
    expect(brandName({ NEXT_PUBLIC_APP_NAME: "B" })).toBe("B");
    expect(brandName({})).toBeNull();
    expect(runtimeBrandName({ NEXT_PUBLIC_APP_NAME: "B" })).toBeNull();
    vi.stubEnv("APP_NAME", "Hafen Tasks");
    expect(runtimeBrandName()).toBe("Hafen Tasks");
    expect(brandName()).toBe("Hafen Tasks");
  });

  it("ohne APP_NAME: getDictionary und SEO exakt wie bisher (dasselbe Objekt)", () => {
    vi.stubEnv("APP_NAME", "");
    expect(getDictionary("de")).toBe(dictionaries.de);
    expect(getDictionary("ar")["app.name"]).toBe("متعقب المهام");
    expect(seoCopy("de")).toBe(SEO_COPY.de);
  });

  it("mit APP_NAME: Server-Wörterbuch und SEO-Texte tragen den Laufzeit-Namen", () => {
    vi.stubEnv("APP_NAME", "Hafen Tasks");
    const d = getDictionary("ar");
    expect(d["app.name"]).toBe("Hafen Tasks");
    // das Original bleibt unberührt (Client-Wörterbuch, andere Aufrufe)
    expect(dictionaries.ar["app.name"]).toBe("متعقب المهام");
    expect(d["login.subtitle"]).toBe(dictionaries.ar["login.subtitle"]);
    const s = seoCopy("en");
    expect(s.appName).toBe("Hafen Tasks");
    expect(s.title).toContain("Hafen Tasks");
    expect(s.title).not.toContain("Task Tracker");
    expect(SEO_COPY.en.appName).toBe("Task Tracker");
  });

  it("Client: I18nProvider überschreibt app.name per Prop; Layouts reichen den Namen durch", () => {
    const p = readFileSync("src/components/i18n-provider.tsx", "utf8");
    expect(p).toMatch(/appName\?: string \| null/);
    expect(p).toMatch(/key === "app\.name" && appName \? appName/);
    for (const f of ["src/app/(app)/layout.tsx", "src/app/login/page.tsx", "src/app/einladung/[token]/page.tsx"]) {
      expect(readFileSync(f, "utf8"), f).toMatch(/<I18nProvider locale=\{locale\} appName=\{brandName\(\)\}>/);
    }
  });

  it("nichts wird beim Build eingefroren: Metadaten/robots/sitemap/OpenAPI zur Laufzeit", () => {
    const root = readFileSync("src/app/layout.tsx", "utf8");
    expect(root).toMatch(/seoCopy\(locale\)/);
    expect(root).not.toMatch(/SEO_COPY\[/);
    expect(readFileSync("src/app/login/page.tsx", "utf8")).not.toMatch(/SEO_COPY\[|SITE_URL/);
    for (const f of ["src/app/robots.ts", "src/app/sitemap.ts", "src/app/api/openapi.json/route.ts"]) {
      const s = readFileSync(f, "utf8");
      expect(s, f).toMatch(/export const dynamic = "force-dynamic"/);
      expect(s, f).not.toMatch(/SITE_URL/);
    }
  });
});

describe("TOF-0795: Adresse der Instanz (instance-url)", () => {
  it("Vorrang APP_URL > NEXT_PUBLIC_APP_URL > Build-Adresse, ohne Schrägstrich", () => {
    expect(instanceUrl({ APP_URL: "https://a.local/", NEXT_PUBLIC_APP_URL: "https://b.local" })).toBe("https://a.local");
    expect(instanceUrl({ NEXT_PUBLIC_APP_URL: "https://b.local//" })).toBe("https://b.local");
    expect(instanceUrl({ APP_URL: "  " })).toBe(SITE_URL.replace(/\/+$/, ""));
    expect(instanceHost({ APP_URL: "https://192.168.1.10:8443" })).toBe("192.168.1.10");
    expect(instanceHost({ APP_URL: "kein url" })).toBe("localhost");
  });

  it("ohne jede Env: bisheriger Standard (Live-Verhalten unverändert)", () => {
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    expect(instanceUrl()).toBe("https://tasks.coastshield.net");
    expect(siteUrl()).toBe("https://tasks.coastshield.net");
    expect(LEGACY_TELEGRAM_BOT).toBe("CoastShieldHelpBot");
  });

  it("E-Mail: Absender und Link-Basis aus der Instanz — ohne Env wie bisher", () => {
    const live = resolveEmailConfig({});
    expect(live.from).toBe("Task Tracker <noreply@tasks.coastshield.net>");
    expect(live.baseUrl).toBe("https://tasks.coastshield.net");
    const onprem = resolveEmailConfig({ APP_URL: "https://tracker.firma.local/", APP_NAME: "Hafen Tasks" });
    expect(onprem.from).toBe("Hafen Tasks <noreply@tracker.firma.local>");
    expect(onprem.baseUrl).toBe("https://tracker.firma.local");
    expect(resolveEmailConfig({ APP_URL: "https://x.local", EMAIL_FROM: "IT <it@x.local>" }).from).toBe("IT <it@x.local>");
  });

  it("OpenAPI: Kontakt/Server = Adresse der Instanz, keine Personen-/Firmen-Beispiele", () => {
    const doc = buildOpenApiDocument("https://tracker.firma.local") as {
      info: { contact: { url: string } };
      servers: { url: string }[];
    };
    expect(doc.info.contact.url).toBe("https://tracker.firma.local");
    expect(doc.servers[0].url).toBe("https://tracker.firma.local");
    expect(JSON.stringify(doc)).not.toMatch(/coastshield|objektus|tarek|tareq/i);
  });

  it("kein fest verdrahteter Live-Host mehr außerhalb von instance-url.ts", () => {
    for (const f of [
      "src/lib/seo.ts", "src/lib/email-config.ts", "src/lib/export-runner.ts", "src/lib/kontext-laden.ts",
      "src/lib/telegram.ts", "src/lib/openapi.ts", "src/lib/brand.ts", "src/components/sso-settings.tsx",
      "src/components/db-console.tsx",
    ]) {
      expect(readFileSync(f, "utf8"), f).not.toMatch(/coastshield|objektus|tareq-fatal|'tarek'/i);
    }
    const i18n = readFileSync("src/lib/i18n.ts", "utf8");
    expect(i18n).not.toMatch(/coastshield|CoastShieldHelpBot|objektus\.de/i);
  });
});

describe("TOF-0795: Android-APK-Link bei TT_ONPREM aus", () => {
  it("isOnPrem / apkDownloadEnabled", () => {
    expect(isOnPrem({})).toBe(false);
    expect(apkDownloadEnabled({})).toBe(true);
    for (const v of ["1", "true", "yes", " TRUE "]) {
      expect(isOnPrem({ TT_ONPREM: v })).toBe(true);
      expect(apkDownloadEnabled({ TT_ONPREM: v })).toBe(false);
    }
    expect(isOnPrem({ TT_ONPREM: "0" })).toBe(false);
  });

  it("Login und Einstellungen fragen apkDownloadEnabled(); die Komponente blendet den Link aus", () => {
    expect(readFileSync("src/app/login/page.tsx", "utf8")).toMatch(/<ApkDownloadLink apk=\{apkDownloadEnabled\(\)\} \/>/);
    const settings = readFileSync("src/app/(app)/settings/page.tsx", "utf8");
    expect(settings).toMatch(/\{apkDownloadEnabled\(\) && \(/);
    const comp = readFileSync("src/components/apk-download-link.tsx", "utf8");
    expect(comp).toMatch(/if \(!apk\) return null;/);
  });
});

// --- Paket-Wächter -------------------------------------------------------------
const DIR = "deployment/task-tracker-usb";
const read = (p: string) => readFileSync(join(DIR, p), "utf8");

describe("TOF-0795: Ein-Datei-Installer make-run.sh", () => {
  it("existiert, bash + set -euo pipefail, LF", () => {
    expect(existsSync(join(DIR, "make-run.sh"))).toBe(true);
    const s = read("make-run.sh");
    expect(s.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(s).toMatch(/^set -euo pipefail$/m);
    expect(s.includes("\r")).toBe(false);
  });

  it("der Kopf prüft die SHA-256 VOR dem Entpacken und läuft selbst mit set -euo pipefail", () => {
    const s = read("make-run.sh");
    const head = s.slice(s.indexOf("<<'RUNHEADER'"), s.lastIndexOf("RUNHEADER"));
    expect(head).toMatch(/^#!\/usr\/bin\/env bash$/m);
    expect(head).toMatch(/^set -euo pipefail$/m);
    expect(head).toMatch(/TT_PAYLOAD_SHA256="@@SHA256@@"/);
    expect(head).toMatch(/payload \| sha256sum/);
    // Installationsweg: verify steht vor dem ersten tar -x in den Kopf-Befehlen nach "install"
    const install = head.slice(head.indexOf("# --- install"));
    expect(install.indexOf("verify")).toBeGreaterThan(-1);
    expect(install.indexOf("verify")).toBeLessThan(install.indexOf("tar -xzf"));
    // root, Ubuntu, Platz, Optionen
    expect(head).toMatch(/sudo bash/);
    expect(head).toMatch(/ubuntu:22\.04\|ubuntu:24\.04/);
    expect(head).toMatch(/df -Pk \/var\/tmp/);
    for (const o of ["--check", "--extract-only", "--help", "--)"]) expect(head).toContain(o);
    expect(head).toMatch(/mktemp -d "\/var\/tmp\/task-tracker-onprem-\$TT_RUN_VERSION\.XXXXXX"/);
    expect(head).toMatch(/--tls internal --app-name "\$Q_NAME"/);
    expect(head).toMatch(/detect_lan_ip/);
    // Prüfsummen-Datei im sha256sum-Format
    expect(s).toMatch(/sha256sum "\$\(basename "\$RUN"\)" >"\$\(basename "\$SUM"\)"/);
  });

  it("make-bundle.sh --run ruft make-run.sh", () => {
    const m = read("make-bundle.sh");
    expect(m).toMatch(/--run\) WITH_RUN=1/);
    expect(m).toMatch(/make-run\.sh" "\$STAGE" --out "\$OUT_DIR"/);
  });
});

describe("TOF-0795: Neutralität des Pakets", () => {
  it("make-bundle: offline ohne app/ (nur mit --with-source), neutrales Image", () => {
    const m = read("make-bundle.sh");
    expect(m).toMatch(/--with-source\) WITH_SOURCE=1/);
    expect(m).toMatch(/\[ "\$OFFLINE" = "0" \] && WITH_SOURCE=1/);
    expect(m).toMatch(/if \[ "\$WITH_SOURCE" = "1" \]; then\n\s+step "Snapshotting/);
    expect(m).toMatch(/app\/ is in an offline bundle without --with-source/);
    expect(m).toMatch(/NEUTRAL_APP_URL="https:\/\/task-tracker\.local"/);
    expect(m).toMatch(/--build-arg "NEXT_PUBLIC_APP_URL=\$NEUTRAL_APP_URL"/);
    expect(m).toMatch(/--build-arg "TT_ONPREM_IMAGE=1"/);
    expect(readFileSync("Dockerfile", "utf8")).toMatch(/ARG TT_ONPREM_IMAGE=""/);
  });

  it("CUSTOMER_OPTIONS.md wird nie ins Paket kopiert", () => {
    const m = read("make-bundle.sh");
    const copies = m.split("\n").filter((l) => /^\s*(cp|find)\b/.test(l) && !/CUSTOMER_OPTIONS/.test(l));
    for (const l of copies) {
      expect(l).not.toMatch(/docs\/\*|docs"\s*"\$STAGE|-name '\*\.md'/);
    }
    expect(m).toMatch(/-name 'INSTALL_\*\.pdf'/);
    expect(m).toMatch(/find "\$STAGE" -name 'CUSTOMER_OPTIONS\.md'/);
    expect(m).toMatch(/die "docs\/CUSTOMER_OPTIONS\.md ended up in the bundle/);
  });

  it("NUTZUNGSHINWEISE.md: DE/EN/AR, Support-Adresse, wird kopiert und verlinkt", () => {
    const n = read("NUTZUNGSHINWEISE.md");
    expect(n).toContain("Tarek@tarekfatal.com");
    expect(n).toContain("TOF Solution (Tarek Fatal)");
    expect(n).toMatch(/## Deutsch/);
    expect(n).toMatch(/## English/);
    expect(n).toMatch(/## العربية/);
    expect(n).toMatch(/gesonderte\s+Vereinbarung/);
    expect(read("make-bundle.sh")).toMatch(/NUTZUNGSHINWEISE\.md\} "\$STAGE\/"/);
    expect(read("README.md")).toMatch(/\(NUTZUNGSHINWEISE\.md\)/);
    // die einzige Kontaktangabe: keine andere E-Mail-Adresse von uns im Paket
    for (const f of ["README.md", "install.sh", "make-bundle.sh", "make-run.sh", "docs/OFFLINE.md", "templates/env.template"]) {
      expect(read(f), f).not.toMatch(/coastshield|objektus|marisight|outlook\.com|gmail|13\.140\.146\.101|github\.com\/tareq|Coast Shield/i);
    }
  });

  it("install.sh setzt TT_ONPREM=1 und APP_NAME (Laufzeit), kennt --logo", () => {
    const e = read("templates/env.template");
    expect(e).toMatch(/^TT_ONPREM=1$/m);
    expect(e).toMatch(/^APP_NAME=__APP_NAME__$/m);
    expect(e).not.toMatch(/^NEXT_PUBLIC_APP_NAME=/m);
    const i = read("install.sh");
    expect(i).toMatch(/"APP_NAME=\$APP_NAME_ENV"/);
    expect(i).toMatch(/--logo\) ARG_LOGO=/);
    expect(i).toMatch(/validate_logo "\$ARG_LOGO"/);
    expect(i).toMatch(/TT_LOGO_SRC=\$LOGO_IN_CONTAINER/);
    expect(i).not.toMatch(/Instance name built in/);
    expect(read("lib/common.sh")).toMatch(/TT_LOGO_MAX_BYTES=\$\(\(2 \* 1024 \* 1024\)\)/);
  });

  it("update.sh: ohne Quellcode kein --rebuild, 1.1.x-.env bekommt APP_NAME und TT_ONPREM", () => {
    const u = read("update.sh");
    expect(u).toMatch(/This installation has no source code/);
    expect(u).toMatch(/OLD_NAME="\$\(env_get NEXT_PUBLIC_APP_NAME \|\| true\)"/);
    expect(u).toMatch(/printf 'TT_ONPREM=1\\n'/);
  });

  it("backup.sh: kein fremder GPG-Schlüssel, Sicherungsordner nur für root", () => {
    const b = read("backup.sh");
    expect(b).not.toMatch(/gpg|--recipient/i);
    expect(b).toMatch(/chmod 700 "\$TT_BACKUP_DIR"/);
  });

  it("Anleitungen in drei Sprachen, je 2 Seiten, ohne Kundennamen", () => {
    const b = read("docs/build-pdfs.mjs");
    expect(b).toMatch(/for \(const lang of \["de", "en", "ar"\]\)/);
    expect(b).toMatch(/INSTALL_EN\.pdf/);
    expect(b).not.toMatch(/Coast Shield|coastshield/i);
    for (const f of ["docs/INSTALL_DE.pdf", "docs/INSTALL_EN.pdf", "docs/INSTALL_AR.pdf", "docs/install-en.html"]) {
      expect(existsSync(join(DIR, f)), f).toBe(true);
    }
  });
});
