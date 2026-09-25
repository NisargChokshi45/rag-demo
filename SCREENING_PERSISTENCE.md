# Screening Persistence Implementation

## Overview

This document describes the implementation of persistent screening session storage in Supabase, allowing users to save and revisit their candidate screening history across sessions.

## Architecture

### Database Schema

#### Tables

**screenings** (extended via migration 006)
- `id` (uuid, PK) - Unique identifier
- `user_id` (uuid, nullable) - Owner of the screening (when auth enabled)
- `job_id` (uuid, FK) - Associated job posting (optional)
- `query` (text) - The screening query/criteria
- `summary` (text) - LLM-generated summary
- `report` (jsonb) - Complete report data including assessments
- `reasoning` (text) - AI thinking process
- `context` (text[]) - Retrieved context used
- `created_at` (timestamptz) - Creation timestamp

Indexes:
- `screenings_user_id_idx` - Fast user-based lookups
- `screenings_job_id_idx` - Job-based filtering
- `screenings_created_at_idx` - Time-based sorting

**screening_assessments** (existing)
- Stores individual candidate evaluations
- Links to screenings and candidates
- Stores score, evidence, unknowns

**screening_citations** (new)
- `id` (uuid, PK)
- `screening_id` (uuid, FK) - Parent screening
- `assessment_id` (uuid, FK) - Associated assessment
- `candidate_id` (uuid, FK) - Candidate reference
- `candidate_name` (text) - Denormalized name for display
- `content` (text) - Quoted text from resume
- `tool` (text) - Source tool (search_chunks or get_full_resume)
- `created_at` (timestamptz)

Indexes:
- `screening_citations_screening_id_idx` - Find citations by screening
- `screening_citations_assessment_id_idx` - Find citations by assessment

## API Endpoints

### POST /api/screenings
Save a new screening session.

**Request Body:**
```json
{
  "jobId": "optional-uuid",
  "query": "Find candidates with Java and AWS experience",
  "report": {
    "query": "...",
    "summary": "...",
    "reasoning": "...",
    "context": ["..."],
    "assessments": [
      {
        "candidateId": "uuid",
        "candidateName": "John Doe",
        "score": 85,
        "evidence": ["..."],
        "unknowns": ["..."],
        "citations": [
          {
            "candidateId": "uuid",
            "candidateName": "John Doe",
            "content": "Worked with Java for 5 years",
            "tool": "search_chunks"
          }
        ]
      }
    ]
  }
}
```

**Response:**
```json
{
  "success": true,
  "screeningId": "uuid"
}
```

**Authentication:**
- Optional - if `AUTH_ENABLED=true`, session is saved for current user
- If auth disabled, all screenings are saved globally

### GET /api/screenings
Fetch screening history.

**Query Parameters:**
- `limit` (default: 50) - Number of records to fetch
- `offset` (default: 0) - Pagination offset

**Response:**
```json
{
  "screenings": [
    {
      "id": "uuid",
      "query": "...",
      "summary": "...",
      "job_id": "uuid or null",
      "created_at": "2026-09-23T15:30:00Z",
      "report": {...}
    }
  ],
  "total": 42
}
```

**Authentication:**
- If `AUTH_ENABLED=true`, returns only current user's screenings
- If auth disabled, returns all screenings

### GET /api/screenings/:id
Fetch a specific screening with full details including assessments and citations.

**Response:**
```json
{
  "id": "uuid",
  "query": "...",
  "summary": "...",
  "created_at": "2026-09-23T15:30:00Z",
  "report": {...},
  "reasoning": "...",
  "context": ["..."],
  "screening_assessments": [
    {
      "id": "uuid",
      "candidate_id": "uuid",
      "score": 85,
      "evidence": ["..."],
      "unknowns": ["..."],
      "screening_citations": [
        {
          "id": "uuid",
          "candidate_id": "uuid",
          "candidate_name": "John Doe",
          "content": "...",
          "tool": "search_chunks"
        }
      ]
    }
  ]
}
```

### DELETE /api/screenings/:id
Delete a screening session (cascades to assessments and citations).

**Response:**
```json
{
  "success": true
}
```

**Authentication:**
- If `AUTH_ENABLED=true`, user can only delete their own screenings
- If auth disabled, allows deletion of any screening

## Frontend Integration

### Usage

The `ScreenPage` component has been updated with the following features:

1. **History Loading**: Loads screenings from Supabase on page load, with localStorage fallback
2. **Save to History**: Automatically saves each screening to Supabase after completion
3. **History Display**: Shows saved screenings in sidebar with timestamps
4. **Delete Screening**: Click the ✕ button to delete a screening from history
5. **Load Screening**: Click a screening to reload it with full details

### Client Library

Use `lib/screenings-api.ts` for API interactions:

```typescript
import {
  saveScreening,
  fetchScreenings,
  fetchScreening,
  deleteScreening,
} from '@/lib/screenings-api';

// Save a screening
const result = await saveScreening(query, report, jobId);
if (result.success) {
  console.log('Saved screening:', result.screeningId);
}

// Fetch history
const { screenings, total } = await fetchScreenings(50, 0);

// Load specific screening
const { screening } = await fetchScreening(id);

// Delete screening
const deleteResult = await deleteScreening(id);
```

## Feature Flags

- `AUTH_ENABLED`: When `true`, screenings are user-scoped. When `false`, all screenings are global.
- `USER_DATA_ISOLATION`: (Depends on AUTH_ENABLED) When `true`, all data is isolated per user.

## Migration Instructions

1. Run the migration to create the new columns and tables:
```bash
npx supabase migration up
```

2. Enable auth features (optional, by default disabled for MVP):
```bash
export NEXT_PUBLIC_AUTH_ENABLED=true
```

3. Start the development server:
```bash
npm run dev
```

## Data Persistence Strategy

### Primary Storage: Supabase
- Recommended for all production environments
- Persistent across sessions and devices
- Multi-user support with auth
- Full-text search capabilities

### Fallback: localStorage
- Used automatically if Supabase API is unavailable
- Persists within browser on single device only
- Maximum ~5MB storage limit
- No cross-device sync

### Hybrid Approach
The implementation uses a hybrid approach:
1. Always try to save/load from Supabase first
2. If Supabase is unavailable, fallback to localStorage
3. Users can migrate from localStorage to Supabase by setting up auth

## Error Handling

All API functions return consistent error responses:
```typescript
{
  success: false,
  error: "error message describing what went wrong"
}
```

The UI shows user-friendly error messages and gracefully falls back to localStorage if Supabase is unavailable.

## Performance Considerations

- **Pagination**: History is paginated (50 items per page) to avoid loading all data
- **Indexing**: User-based and time-based queries are indexed for performance
- **Lazy Loading**: Screening details are fetched on-demand when a user clicks a history item
- **Caching**: Report data is stored as JSONB for quick retrieval

## Security

- **User Isolation**: When `AUTH_ENABLED=true`, users can only view/delete their own screenings
- **RLS Policies**: Can be implemented via Supabase RLS for additional security
- **No Sensitive Data**: Screening data contains only resume chunks and candidate assessments, no raw credentials

## Future Enhancements

1. **Full-Text Search**: Implement keyword search across screening queries and assessments
2. **Export/Import**: Allow users to export screening history as CSV/JSON
3. **Sharing**: Share specific screenings with other users (team collaboration)
4. **Comparison**: Compare multiple screening sessions side-by-side
5. **Filters**: Filter history by date, job, candidate, or score range
6. **Tags**: Add custom tags for organizing screenings
7. **Real-time Updates**: Implement WebSocket updates for live collaboration

## Testing

To test the feature:

1. Create a screening query
2. Verify it appears in the sidebar history
3. Refresh the page - history should persist
4. Click a history item to reload it
5. Delete a screening from history
6. Verify deletion is reflected after refresh

## Troubleshooting

### History not loading
- Check browser console for network errors
- Verify Supabase connection and credentials
- Fallback to localStorage should work automatically

### Screening not saving
- Check API response in Network tab
- Verify Supabase tables are created (run migration)
- Check for required field validation errors

### Auth-related issues
- Ensure `NEXT_PUBLIC_AUTH_ENABLED` is set correctly
- Check user session is active
- Verify Supabase auth is configured

## Related Documentation

- [FEATURES.md](./FEATURES.md) - Overall feature list and status
- [[lib/auth.ts]] - Authentication utilities
- [[lib/supabase/server.ts]] - Supabase client setup
