import { NextRequest, NextResponse } from 'next/server';
import { FEATURE_FLAGS } from '@/lib/config';
import { deleteJob, updateJob } from '@/lib/db';

interface RouteContext {
  params: Promise<{ id: string }>;
}

function parseJobInput(body: Record<string, unknown>) {
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const description =
    typeof body.description === 'string' ? body.description.trim() : '';
  const experience =
    typeof body.experience === 'string' ? body.experience.trim() : '';
  const skills = Array.isArray(body.skills)
    ? body.skills
        .filter((skill: unknown): skill is string => typeof skill === 'string')
        .map((skill: string) => skill.trim())
        .filter(Boolean)
    : [];
  const is_active =
    typeof body.is_active === 'boolean' ? body.is_active : undefined;

  if (!title || !description || !experience || skills.length === 0) {
    throw new Error(
      'Title, description, experience, and at least one skill are required'
    );
  }

  return { title, description, experience, skills, is_active };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const input = parseJobInput(body);

    return NextResponse.json({ job: await updateJob(id, input) });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to update job';
    const isValidationError = message.startsWith('Title,');

    return NextResponse.json(
      { error: message },
      { status: isValidationError ? 400 : 500 }
    );
  }
}

export async function DELETE(_: NextRequest, context: RouteContext) {
  try {
    if (!FEATURE_FLAGS.JOB_DELETION_ENABLED) {
      throw new Error('Not allowed');
    }

    const { id } = await context.params;
    await deleteJob(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Unable to delete job';
    return NextResponse.json(
      {
        error: message,
      },
      { status: message === 'Not allowed' ? 403 : 500 }
    );
  }
}
