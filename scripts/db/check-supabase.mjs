import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";

const parseDotEnv = () => {
  if (!existsSync(".env")) {
    return {};
  }

  return readFileSync(".env", "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .reduce((accumulator, line) => {
      const separatorIndex = line.indexOf("=");
      if (separatorIndex < 0) {
        return accumulator;
      }

      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      accumulator[key] = value;
      return accumulator;
    }, {});
};

const env = parseDotEnv();
const url = process.env.SUPABASE_URL || env.SUPABASE_URL;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const client = createClient(url, serviceRoleKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const checks = [
  { table: "conversations", columns: "id" },
  { table: "messages", columns: "id, role, content, created_at" },
  { table: "tasks", columns: "id, title, status, assigned_agent, created_at" },
  { table: "executions", columns: "id, status, created_at" },
  { table: "system_logs", columns: "id, level, message, created_at" },
];

for (const check of checks) {
  const { error } = await client.from(check.table).select(check.columns).limit(1);
  if (error) {
    console.error(`TABLE_CHECK_FAIL ${check.table}: ${error.message}`);
  } else {
    console.log(`TABLE_CHECK_OK ${check.table}`);
  }
}
