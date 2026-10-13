import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  const authError = await validateAuth();
  if (authError) return authError;

  try {
    const { filename } = await request.json();
    if (!filename || typeof filename !== 'string') {
      return NextResponse.json(
        { error: 'Filename is required' },
        { status: 400 }
      );
    }

    const safeName = filename.replace(/[^A-Za-z0-9._-]/g, '_');
    const path = `${Date.now()}-${safeName}`;

    const client = createServiceClient();
    const { data, error } = await client.storage
      .from('documents')
      .createSignedUploadUrl(path, { upsert: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      signedUrl: data.signedUrl,
      path,
      token: data.token,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
