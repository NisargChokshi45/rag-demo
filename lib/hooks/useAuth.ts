'use client';

import { useCallback, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import { FEATURE_FLAGS } from '@/lib/config';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!FEATURE_FLAGS.AUTH_ENABLED) {
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let active = true;

    const checkUser = async () => {
      try {
        const {
          data: { user: currentUser },
          error: userError,
        } = await supabase.auth.getUser();

        if (!active) return;
        if (userError) {
          setError(userError.message);
          setUser(null);
        } else {
          setUser(currentUser);
        }
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
        setUser(null);
      } finally {
        if (active) setLoading(false);
      }
    };

    void checkUser();

    // Keep the header in step with sign-in/out in this or another tab.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setUser(session?.user ?? null);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      window.location.href = '/login';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logout failed');
    }
  }, []);

  return { user, loading, error, signOut };
}
