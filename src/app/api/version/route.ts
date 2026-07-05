import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

// Read fresh on every request (not a top-level import) so a package.json
// version bump is picked up immediately without a server restart — this is
// what the "bump the version, banner appears" manual test relies on.
function readVersion(): string {
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8");
    return JSON.parse(raw).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

// Stamped once when this server process starts, so a redeploy is detected
// by UpdatePrompt even on releases that didn't bump the package.json version.
const startedAt = new Date().toISOString();

export async function GET() {
  return NextResponse.json(
    { version: readVersion(), startedAt },
    { headers: { "Cache-Control": "no-store" } },
  );
}
