/**
 * Screening API client utilities
 * Provides type-safe functions for interacting with the screenings API
 */

export interface ReportData {
  query: string;
  assessments: Array<{
    candidateId: string;
    candidateName: string;
    score: number;
    evidence: string[];
    unknowns: string[];
    citations?: Array<{
      candidateId: string;
      candidateName: string;
      content: string;
      tool: 'search_chunks' | 'get_full_resume';
    }>;
  }>;
  summary: string;
  reasoning?: string;
  context?: string[];
}

export interface Screening {
  id: string;
  query: string;
  summary: string;
  job_id?: string;
  created_at: string;
  report: ReportData;
  reasoning?: string;
  context?: string[];
  screening_assessments: Array<{
    id: string;
    candidate_id: string;
    score: number;
    evidence: string[];
    unknowns: string[];
    screening_citations: Array<{
      id: string;
      candidate_id: string;
      candidate_name: string;
      content: string;
      tool: 'search_chunks' | 'get_full_resume';
    }>;
  }>;
}

/**
 * Save a new screening session to Supabase
 */
export async function saveScreening(
  query: string,
  report: ReportData,
  jobId?: string
): Promise<{ success: boolean; screeningId?: string; error?: string }> {
  try {
    const response = await fetch('/api/screenings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: jobId || undefined,
        query,
        report,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.error || 'Failed to save screening' };
    }

    return { success: true, screeningId: data.screeningId };
  } catch (error) {
    console.error('Error saving screening:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch screening history
 */
export async function fetchScreenings(
  limit = 50,
  offset = 0
): Promise<{ screenings: Screening[]; total: number; error?: string }> {
  try {
    const response = await fetch(
      `/api/screenings?limit=${limit}&offset=${offset}`
    );
    const data = await response.json();

    if (!response.ok) {
      return { screenings: [], total: 0, error: data.error };
    }

    return {
      screenings: data.screenings || [],
      total: data.total || 0,
    };
  } catch (error) {
    console.error('Error fetching screenings:', error);
    return {
      screenings: [],
      total: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Fetch a specific screening with all details
 */
export async function fetchScreening(id: string): Promise<{
  screening?: Screening;
  error?: string;
}> {
  try {
    const response = await fetch(`/api/screenings/${id}`);
    const data = await response.json();

    if (!response.ok) {
      return { error: data.error };
    }

    return { screening: data };
  } catch (error) {
    console.error('Error fetching screening:', error);
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Delete a screening
 */
export async function deleteScreening(
  id: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`/api/screenings/${id}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.error };
    }

    return { success: true };
  } catch (error) {
    console.error('Error deleting screening:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
