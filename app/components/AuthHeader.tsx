'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { FEATURE_FLAGS } from '@/lib/config';
import Link from 'next/link';

const secondaryButton =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50';

export function AuthHeader() {
  const { user, loading, signOut } = useAuth();

  if (!FEATURE_FLAGS.AUTH_ENABLED || loading) {
    return null;
  }

  if (!user) {
    return (
      <Link href="/login" className={secondaryButton}>
        Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <span className="max-w-[12rem] truncate text-sm text-slate-600">
        {user.email}
      </span>
      <button type="button" onClick={signOut} className={secondaryButton}>
        Sign out
      </button>
    </div>
  );
}
