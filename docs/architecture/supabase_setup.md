# LiNa Supabase Setup

Use this when the external Supabase project is reachable but does not yet contain the LiNa schema.

## Current diagnosis

The project URL and keys are valid, but these relations are still missing:

- `conversations`
- `messages`
- `tasks`
- `executions`
- `system_logs`

## How to provision the schema

Open the Supabase project dashboard and go to:

`SQL Editor` -> `New query`

Then run the contents of:

`supabase/migrations/001_initial_schema.sql`

## Verification

After applying the schema, run:

```bash
node scripts/db/check-supabase.mjs
```

Expected result:

```text
TABLE_CHECK_OK conversations
TABLE_CHECK_OK messages
TABLE_CHECK_OK tasks
TABLE_CHECK_OK executions
TABLE_CHECK_OK system_logs
```

## Runtime behavior

Until the schema exists, LiNa automatically falls back to local persistence and logs a warning at startup.

Once the schema is present, LiNa will switch to Supabase automatically on the next restart.
