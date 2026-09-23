# Database Migrations Guide

This guide explains how to apply database migrations to your Supabase instance.

## Current Status

Migration 006 (`006_screenings_user_and_report.sql`) adds:
- `user_id`, `report`, `reasoning`, `context` columns to the `screenings` table
- `screening_citations` table with cascade deletes

These are required for the screening history persistence feature to work.

## Checking Migration Status

### Option 1: Check via API
```bash
curl http://localhost:3000/api/admin/migrations
```

This returns a JSON response showing which migrations are applied.

### Option 2: Check in Supabase Dashboard
1. Open your Supabase project
2. Go to SQL Editor
3. Run: `SELECT * FROM screening_citations LIMIT 1;`
4. If it returns an error, migration 006 is not applied

## Applying Migrations (Production Solution)

### The Standard Way: Supabase CLI (RECOMMENDED)

```bash
# 1. Install Supabase CLI (if not already installed)
npm install -g supabase
# or
brew install supabase/tap/supabase

# 2. Verify installation
supabase --version

# 3. Authenticate with Supabase
supabase login

# 4. Link your project (get project ref from Supabase dashboard)
supabase link --project-ref YOUR_PROJECT_REF

# 5. Apply all pending migrations to remote
supabase db push --remote

# 6. Verify migrations were applied
curl http://localhost:3000/api/admin/migrations
```

### What `supabase db push` does:
- Compares local migration files with remote database state
- Applies only pending migrations
- Tracks applied migrations in the `_supabase_migrations` table
- Safe to run multiple times (idempotent)

## Manual SQL Method (Emergency Only)

Only use this if the CLI is unavailable. Go to Supabase Dashboard → SQL Editor and run:

```sql
-- Add columns to screenings table
alter table screenings
add column if not exists user_id uuid,
add column if not exists report jsonb,
add column if not exists reasoning text,
add column if not exists context text[];

-- Create index for user filtering
create index if not exists screenings_user_id_idx on screenings(user_id);

-- Create screening_citations table
create table if not exists screening_citations (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid references screenings(id) on delete cascade,
  assessment_id uuid references screening_assessments(id) on delete cascade,
  candidate_id uuid references candidates(id) on delete cascade,
  candidate_name text not null,
  content text not null,
  tool text not null,
  created_at timestamptz default now()
);

-- Create indexes for citations
create index if not exists screening_citations_screening_id_idx on screening_citations(screening_id);
create index if not exists screening_citations_assessment_id_idx on screening_citations(assessment_id);
```

## CI/CD Integration

### GitHub Actions Example

Add to `.github/workflows/deploy.yml`:

```yaml
deploy-migrations:
  runs-on: ubuntu-latest
  steps:
    - uses: actions/checkout@v3
    - uses: supabase/setup-cli@v1
    - run: |
        supabase link --project-ref ${{ secrets.SUPABASE_PROJECT_REF }}
        supabase db push --remote
      env:
        SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
```

### Vercel Deployment

1. Add to build script in `package.json`:
```json
{
  "scripts": {
    "build": "npm run migrate && next build",
    "migrate": "bash ./scripts/apply-migrations.sh"
  }
}
```

2. Set environment variables in Vercel:
   - `SUPABASE_ACCESS_TOKEN` - Your Supabase access token
   - `SUPABASE_PROJECT_REF` - Your project reference

## Troubleshooting

### "Column already exists" Error
This is normal. The migration includes `if not exists` clauses, so it's safe to run again.

### "Permission denied" Error
- Verify your Supabase access token has the right permissions
- Check that your project reference is correct
- Try `supabase login` again to refresh credentials

### "Table not found" Error
This usually means migration 006 hasn't been applied yet. Follow the "Applying Migrations" section above.

### App Still Showing "500 Error"
After applying the migration:
1. Restart the Next.js dev server
2. Clear browser cache
3. Check `/api/admin/migrations` endpoint
4. Verify in Supabase Dashboard that tables exist

## Migration Files

All migrations are stored in `supabase/migrations/`:

- `001_initial_schema.sql` - Creates candidates, resume_chunks tables
- `002_gemini_embedding_2.sql` - Updates embedding dimensions
- `003_jobs.sql` - Creates jobs table
- `004_screenings.sql` - Creates screenings, screening_assessments tables
- `005_job_active.sql` - Adds is_active column to jobs
- `006_screenings_user_and_report.sql` - **Current: Adds user_id, report, context**

## Safety

- All migrations are reversible (data is preserved)
- `if not exists` clauses prevent duplicate column/table errors
- Foreign keys use `on delete cascade` for data integrity
- Migrations are idempotent and safe to run multiple times

## Next Steps

After applying migrations:
1. ✅ Verify with `/api/admin/migrations`
2. ✅ Restart the development server
3. ✅ Test screening history persistence
4. ✅ Check Supabase dashboard for new tables/columns
