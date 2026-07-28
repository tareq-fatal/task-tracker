// Regenerate the committed OpenAPI snapshot at <repo>/openapi.json from the
// single source of truth in src/lib/openapi.ts. Run with: npm run openapi:gen
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");

// Import the TS source via tsx's loader (the npm script runs this through tsx).
const { openApiDocument } = await import("../src/lib/openapi.ts");

const out = join(repoRoot, "openapi.json");
writeFileSync(out, JSON.stringify(openApiDocument, null, 2) + "\n", "utf8");
console.log(`Wrote ${out}`);
