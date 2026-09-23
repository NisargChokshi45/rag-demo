"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { FEATURE_FLAGS } from "@/lib/config";

export function useAuth() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!FEATURE_FLAGS.AUTH_ENABLED) {
      setLoading(false);
      return;
    }

    const checkUser = async () => {
      try {
        const supabase = createClient();
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError) {
          setError(userError.message);
          setUser(null);
        } else {
          setUser(user);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    checkUser();
  }, []);

  const signOut = async () => {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
      setUser(null);
      window.location.href = "/login";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Logout failed");
    }
  };

  return { user, loading, error, signOut };
}
