'use client';

import { useAuth } from '@/lib/hooks/useAuth';
import { FEATURE_FLAGS } from '@/lib/config';
import Link from 'next/link';

export function AuthHeader() {
  const { user, loading, signOut } = useAuth();

  if (!FEATURE_FLAGS.AUTH_ENABLED || loading) {
    return null;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="text-gray-600 hover:text-gray-900 font-medium text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition"
      >
        Sign In
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-4">
      <span className="text-sm text-gray-600">{user.email}</span>
      <button
        onClick={signOut}
        className="text-gray-600 hover:text-gray-900 font-medium text-sm px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 transition"
      >
        Sign Out
      </button>
    </div>
  );
}
