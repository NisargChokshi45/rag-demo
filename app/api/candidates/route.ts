import { NextRequest, NextResponse } from 'next/server';
import { listCandidateRoles, listCandidates } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const status = searchParams.get('status') || 'all';
    const sort = searchParams.get('sort') || 'name';

    if (!['all', 'indexed', 'not-indexed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid candidate status' },
        { status: 400 }
      );
    }
    if (!['name', 'role', 'indexed'].includes(sort)) {
      return NextResponse.json(
        { error: 'Invalid candidate sort' },
        { status: 400 }
      );
    }

    const [candidates, roles] = await Promise.all([
      listCandidates({
        search: searchParams.get('search') || undefined,
        role: searchParams.get('role') || undefined,
        status: status as 'all' | 'indexed' | 'not-indexed',
        sort: sort as 'name' | 'role' | 'indexed',
      }),
      listCandidateRoles(),
    ]);

    return NextResponse.json({
      candidates,
      count: candidates.length,
      roles,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
