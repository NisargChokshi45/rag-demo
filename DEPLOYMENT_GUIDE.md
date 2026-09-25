# Deployment Guide - Screening Persistence

## Quick Start

### 1. Run Database Migration

Apply the migration to your Supabase database:

```bash
# Using Supabase CLI
supabase migration up

# Or manually: Copy and run the SQL in supabase/migrations/006_screenings_user_and_report.sql
# in the Supabase dashboard Query Editor
```

### 2. Build & Deploy

```bash
# Build the application
npm run build

# Start the development server (or deploy to production)
npm run dev
```

### 3. Test the Feature

1. Open http://localhost:3000/screen
2. Create a screening query (e.g., "Find candidates with 5+ years Java experience")
3. Wait for results to load
4. Verify screening appears in the sidebar under "Screening History"
5. Refresh the page - history should persist
6. Click a history item to reload it
7. Click the ✕ button to delete a screening
8. Verify deletion persists after refresh

## Environment Variables

Add these to your `.env.local` if needed:

```bash
# Optional: Enable multi-user auth system
NEXT_PUBLIC_AUTH_ENABLED=true

# Optional: Enable per-user data isolation (requires AUTH_ENABLED=true)
NEXT_PUBLIC_USER_DATA_ISOLATION=true
```

## Database Changes

The migration adds these columns to the `screenings` table:
- `user_id` (uuid, nullable) - Owner of the screening
- `report` (jsonb) - Complete report data
- `reasoning` (text) - AI thinking process
- `context` (text[]) - Retrieved context chunks

New table `screening_citations` stores resume quotes linked to assessments.

## Monitoring & Troubleshooting

### Check if data is being saved

In Supabase dashboard:
```sql
SELECT id, query, summary, user_id, created_at FROM screenings LIMIT 10;
SELECT COUNT(*) as total FROM screenings;
```

### Check for errors in browser console

1. Open DevTools (F12)
2. Go to Console tab
3. Look for network errors or JavaScript errors
4. Check Network tab to see API responses

### Verify API endpoints work

```bash
# Test saving a screening
curl -X POST http://localhost:3000/api/screenings \
  -H "Content-Type: application/json" \
  -d '{"query":"test","report":{"summary":"test","assessments":[]}}'

# Test fetching history
curl http://localhost:3000/api/screenings

# Test fetching specific screening
curl http://localhost:3000/api/screenings/{id}

# Test deleting
curl -X DELETE http://localhost:3000/api/screenings/{id}
```

## Rollback Instructions

If you need to rollback the migration:

1. In Supabase dashboard, go to Migrations
2. Find "006_screenings_user_and_report"
3. Click "Rollback"
4. Or manually run:

```sql
DROP TABLE IF EXISTS screening_citations CASCADE;
ALTER TABLE screenings DROP COLUMN IF EXISTS user_id;
ALTER TABLE screenings DROP COLUMN IF EXISTS report;
ALTER TABLE screenings DROP COLUMN IF EXISTS reasoning;
ALTER TABLE screenings DROP COLUMN IF EXISTS context;
DROP INDEX IF EXISTS screenings_user_id_idx;
```

## Performance Tuning

### For large datasets (>10K screenings)

Consider implementing pagination:
```typescript
// Fetch paginated results
const { screenings } = await fetchScreenings(50, 0); // 50 items, offset 0
```

### Database query optimization

Indexes are already created for:
- `screenings_user_id_idx` - User lookups
- `screenings_created_at_idx` - Time-based sorting
- `screening_citations_screening_id_idx` - Citation lookups

To add full-text search index:
```sql
CREATE INDEX screenings_query_idx ON screenings USING GIN (to_tsvector('english', query));
```

## Production Deployment

### Before deploying:

1. ✅ Run migration on staging database first
2. ✅ Test all screening endpoints
3. ✅ Verify localStorage fallback works
4. ✅ Test with auth enabled (if using multi-user)
5. ✅ Check error handling in browser

### Deploy steps:

1. Deploy code changes
2. Run migration on production database
3. Monitor error logs for API failures
4. Verify users can see their screening history

## Known Limitations

1. **Storage size**: localStorage has ~5MB limit per browser
2. **Cross-device sync**: localStorage data doesn't sync between devices
3. **Large reports**: JSONB field has theoretical 1GB limit (practical limit ~100MB per report)
4. **Concurrent edits**: No real-time sync if multiple tabs open

## Future Improvements

See [SCREENING_PERSISTENCE.md](./SCREENING_PERSISTENCE.md) "Future Enhancements" section for planned features:
- Full-text search on queries
- Export/import history
- Sharing with team members
- Real-time collaboration
- Advanced filtering and tags

## Support

For issues:
1. Check [SCREENING_PERSISTENCE.md](./SCREENING_PERSISTENCE.md) Troubleshooting section
2. Review browser console for errors
3. Check Supabase logs for database issues
4. Verify network requests in DevTools Network tab
