# Local database check

This check tests database migrations without touching the live CBTeD database.

## What it does
`run-check.sh`:
1. Builds a throwaway local PostgreSQL database containing the live production-controller schema and functions.
   They are a snapshot taken on 2026-11-18. The function bodies were checked byte for byte against live by checksum.
2. Records every canonical plan.
3. Applies every migration in `supabase/migrations` dated after that snapshot.
4. Compares the results with `expected-output.txt`.
5. Deletes the throwaway database.

## The checks
- **P1–P4:**
  - existing workflows are unchanged;
  - `idea_to_publish` is valid for 1–20 images and 1–20 clips, and rejected otherwise;
  - the database plans equal the JavaScript planner.
- **01–28:** pretend-user checks of:
  - ownership;
  - tampered plans;
  - the idea approval;
  - the publishing approval;
  - fail-closed publishing;
  - retry.

## Run it
You need Node.js and a local PostgreSQL 16 server:

```
PSQL="sudo -u postgres psql" bash tests/sql/run-check.sh
```

It prints `SQL check passed` or shows a diff and fails.

## Maintenance
If a future migration changes plans on purpose, update `make-expected.mjs` or `expected-output.txt` in the same change. That keeps the difference visible and deliberate.
