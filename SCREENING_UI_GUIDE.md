# Screening UI & UX Guide

## User Interface Overview

The screening page has been updated with persistent history management. This guide walks through the user experience.

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│                    Screen Candidates                        │
│  Ask screening questions and get AI-powered assessments     │
└─────────────────────────────────────────────────────────────┘

┌────────────────┐ ┌──────────────────────────────────────────┐
│ SIDEBAR        │ │ MAIN CONTENT AREA                        │
│                │ │                                          │
│ Screening      │ │ [Results Area - Shows query, loading, or │
│ History        │ │  report with candidate assessments]      │
│                │ │                                          │
│ [New Session]    │ │                                        │
│                │ │                                          │
│ ────────────   │ │ ─────────────────────────────────────────│
│ Query 1        │ │                                          │
│ Sep 23, 3:45p  │ │ [Input Area with form]                   │
│ 5 candidates ✕ │ │                                          │
│                │ │ [Screen Candidates Button]               │
│ Query 2        │ │                                          │
│ Sep 23, 2:10p  │ │                                          │
│ 3 candidates ✕ │ │                                          │
│                │ │                                          │
│ ────────────   │ │                                          │
│ [Clear History]│ │                                          │
│                │ │                                          │
└────────────────┘ └──────────────────────────────────────────┘
```

## Features & Interactions

### Sidebar - Screening History

#### View History
- **Display**: Shows up to 50 most recent screenings
- **Info shown per item**:
  - Date & time (formatted as "Sep 23 at 3:45:23 PM")
  - Query text (first 2 lines, truncated)
  - Number of candidates evaluated
- **Status**: "Loading history..." shown while fetching from Supabase

#### Load Previous Screening
1. Click on any history item
2. Screening details load from Supabase (brief loading indicator)
3. Query text repopulates input field
4. Full report displays with all assessments and citations
5. Tool calls trace appears if available

#### Delete Screening
1. Hover over a history item
2. ✕ button appears on the right (fade-in animation)
3. Click ✕ to delete
4. Deleted item removed immediately from sidebar
5. Deletion synced to Supabase

#### New Session Button
- Click "New Session" to clear current results
- Resets form, clears query input, removes report display
- Does NOT delete from history

#### Clear History
- Button appears at bottom of sidebar when history exists
- Clicking deletes ALL screenings from user's history
- Confirmation may be added in future

### Main Content - Results Area

#### Before Query Submitted
- Shows empty state: "Start by entering a screening query below"
- History sidebar shows all previous queries

#### While Query Processes
- **Query Display Box**: Shows "Your Query:" with the submitted question
- **Loading Indicator**:
  - Animated three-dot animation (bouncing)
  - "AI Assistant is thinking..." text
  - Tool calls display below showing which tools are being called
  - Scrollable list of tools as they execute

Example loading state:
```
┌─ Your Query: ──────────────────────────────────┐
│ Find candidates with 5+ years Java experience  │
└────────────────────────────────────────────────┘

┌─ AI Assistant is thinking... ─────────────────┐
│ ● ○ ○                                         │
│                                               │
│ Retrieved 12 tool calls                       │
│ ┌─────────────────────────────────────────┐   │
│ │ search_chunks (candidate_1)             │   │
│ │ search_chunks (candidate_2)             │   │
│ │ get_full_resume (candidate_1)           │   │
│ │ search_chunks (candidate_3)             │   │
│ └─────────────────────────────────────────┘   │
└───────────────────────────────────────────────┘
```

#### After Query Completes
Results shown in this order:

##### 1. Query Display
```
┌─ Your Query: ──────────────────────────────────┐
│ Find candidates with 5+ years Java experience  │
└────────────────────────────────────────────────┘
```

##### 2. Tool Calls Trace (Blue Box)
```
┌─ Tool Calls Trace ─────────────────────────────┐
│                                                │
│ ┌─ search_chunks ────────────────────────────┐ │
│ │ {                                          │ │
│ │   "query": "Java experience",              │ │
│ │   "limit": 5                               │ │
│ │ }                                          │ │
│ └────────────────────────────────────────────┘ │
│                                                │
│ ┌─ get_full_resume ──────────────────────────┐ │
│ │ {                                          │ │
│ │   "candidateId": "uuid-1234..."            │ │
│ │ }                                          │ │
│ └────────────────────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

##### 3. Summary (Green Box)
```
┌─ Summary ──────────────────────────────────────┐
│ Found 3 strong Java candidates. Candidate A has│
│ 7 years experience and recent AWS projects...  │
└────────────────────────────────────────────────┘
```

##### 4. Thinking Process (Purple Box)
```
┌─ 🧠 Thinking Process ──────────────────────────┐
│ I analyzed resumes focusing on Java experience │
│ and years in the field. Candidate A stands out │
│ with 7 years of direct Java development...     │
└────────────────────────────────────────────────┘
```

##### 5. Context Used (Indigo Box)
```
┌─ 📋 Context Used ──────────────────────────────┐
│ • Java frameworks mentioned: Spring Boot, ...  │
│ • AWS experience found in 2 candidates         │
│ • Years of experience range: 3-10 years        │
└────────────────────────────────────────────────┘
```

##### 6. Candidate Assessments
```
┌───────────────────────────────────────────────┐
│ Candidate Assessments                         │
├───────────────────────────────────────────────┤
│                                               │
│ ┌─ John Doe ────────────────────────────── 85 │
│ │ /100                                        │
│ │                                             │
│ │ ✓ Evidence                                  │
│ │   ✓ 7 years Java development                │
│ │   ✓ Spring Boot framework expert            │
│ │   ✓ Recent AWS project experience           │
│ │                                             │
│ │ ? Unknowns                                  │
│ │   ? Database experience not mentioned       │
│ │   ? Team leadership experience              │
│ │                                             │
│ │ 📌 Citations from Resume                    │
│ │   ┌─────────────────────────────────────┐   │
│ │   │ Source: search_chunks               │   │
│ │   │ "5 years working with Java and      │   │
│ │   │ Spring Boot at TechCorp..."         │   │
│ │   └─────────────────────────────────────┘   │
│ │                                             │
│ │   ┌─────────────────────────────────────┐   │
│ │   │ Source: get_full_resume             │   │
│ │   │ "AWS certified and deployed multiple│   │
│ │   │ microservices..."                   │   │
│ │   └─────────────────────────────────────┘   │
│ │                                             │
│ └────────────────────────────────────────────┘│
│                                               │
│ ┌─ Jane Smith ────────────────────────────78  │
│ │ /100                                        │
│ │ ...                                         │
│ │                                             │
│ └────────────────────────────────────────────┘│
│                                               │
└───────────────────────────────────────────────┘
```

### Input Form Area

Located at the bottom of the page, sticky to keep visible while scrolling:

#### Job Selection Dropdown
- Shows active job postings
- Format: "Backend Engineer - Java, AWS, Docker"
- Optional - screening works without selecting a job
- Used to associate screening with specific opening

#### Query Input
```
┌───────────────────────────────────────────┐
│ Ask screening questions (e.g., 'Find...   │
│                                           │
│ Press Shift+Enter for a new line.         |
│ Press Enter to screen candidates.         │
│                                           │
│ ┌──────────────────────────────────────┐  │
│ │                                      │  │
│ │  [Multi-line text area]              │  │
│ │                                      │  │
│ └──────────────────────────────────────┘  │
│                                           │
│ [Screen Candidates] (blue, width: 100%)   │
│                                           │
└───────────────────────────────────────────┘
```

#### Keyboard Shortcuts
- **Shift + Enter**: New line in text area
- **Enter**: Submit query (if not at end of line without shift)

#### Button States
- **Enabled**: When query has text and no screening in progress
- **Disabled**: When query is empty or screening is processing
- **Loading**: Shows "Screening..." text while processing
- **Ready**: Shows "Screen Candidates" when ready

## Responsive Design

### Desktop (>768px)
- Sidebar always visible (toggleable with ← button)
- Full query results displayed
- All sections visible at once (with scrolling)

### Mobile (<768px)
- Toggle button (← →) in top-left
- Sidebar slides in/out
- Single column layout
- Touch-friendly spacing

## Animations & Transitions

- **History loading**: Fade-in of sidebar items
- **Delete button**: Fade-in on hover (✕ appears)
- **Results appearing**: Smooth scroll to bottom
- **Loading dots**: Staggered bounce animation (0s, 0.2s, 0.4s delays)
- **Sidebar open/close**: Smooth width transition (200ms)

## Error Handling

### API Errors
If Supabase is unavailable:
```
┌─ Error ───────────────────────────────────────┐
│ Failed to save screening                      │
│ (Falls back to localStorage automatically)    │
└───────────────────────────────────────────────┘
```

### Network Issues
- Graceful fallback to localStorage for save/load
- User can still see results (from cache)
- Retry happens automatically on next interaction

## Accessibility

- Clear labels on all inputs
- Color contrast meets WCAG AA standards
- Keyboard navigation fully supported
- ARIA descriptions on form controls
- Semantic HTML structure

## Color Scheme

- **Summary**: Green background (#DCF0DB) with dark green text
- **Thinking**: Purple background (#EDE9FE) with dark purple text
- **Context**: Indigo background (#E0E7FF) with dark indigo text
- **Tool Calls**: Blue background (#DBEAFE) with dark blue text
- **Assessments**: White with gray borders
- **Citations**: Light gray background with left blue border

## Future UI Enhancements

See SCREENING_PERSISTENCE.md for planned features that will affect UI:
- Search bar in sidebar for finding past screenings
- Filter buttons (by date, job, score, candidate)
- Export/download screening results
- Comparison view for multiple screenings
- Tags/labels for organizing screenings
- Team sharing with permission controls

---

**Last Updated**: Sep 23, 2026
