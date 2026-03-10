import { existsSync } from "node:fs";

const requiredPaths = [
  "00_start_here_lina.md",
  "docs/architecture/spec_lina_ai_system.md",
  "apps/api/src/index.ts",
  "apps/dashboard/src/index.ts",
  "packages/lina-sdk/src/index.ts",
  "packages/config/src/index.ts",
  "packages/ui/src/index.ts",
  "supabase/migrations/001_initial_schema.sql",
  ".env.example",
];

const missing = requiredPaths.filter((path) => !existsSync(path));

if (missing.length > 0) {
  console.error("Missing required paths:");
  for (const path of missing) {
    console.error(`- ${path}`);
  }
  process.exit(1);
}

console.log("LiNa structure check passed.");
