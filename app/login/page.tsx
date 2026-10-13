'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Alert, buttonClass, Spinner } from '../components/ui';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [fullName, setFullName] = useState('');

  const switchMode = (signUp: boolean) => {
    setIsSignUp(signUp);
    setError(null);
    setNotice(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);

    try {
      const supabase = createClient();

      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName,
            },
          },
        });

        if (signUpError) {
          setError(signUpError.message);
          return;
        }

        setNotice(
          'Account created. Check your email to confirm your address, then sign in.'
        );
        setIsSignUp(false);
        setPassword('');
        setFullName('');
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (signInError) {
          setError(signInError.message);
          return;
        }

        router.push('/candidates');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const inputClass = 'field';

  return (
    <div className="flex flex-1 items-center justify-center bg-gradient-to-br from-blue-50 via-slate-50 to-indigo-100 px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-surface p-6 shadow-xl sm:p-8">
        <div className="mb-6 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white"
          >
            RAG
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            RAG Resume Screening
          </h1>
          <p className="mt-1.5 text-sm text-slate-500">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </p>
        </div>

        {error && (
          <Alert tone="error" className="mb-5">
            {error}
          </Alert>
        )}
        {notice && (
          <Alert tone="success" className="mb-5">
            {notice}
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isSignUp && (
            <div>
              <label
                htmlFor="full-name"
                className="mb-1.5 block text-sm font-medium text-slate-700"
              >
                Full Name
              </label>
              <input
                id="full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Doe"
                className={inputClass}
              />
            </div>
          )}

          <div>
            <label
              htmlFor="email"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className={inputClass}
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-slate-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={isSignUp ? 6 : undefined}
              className={inputClass}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className={buttonClass('primary', 'md', 'w-full')}
          >
            {loading && <Spinner className="h-4 w-4 border-white" />}
            {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-600">
          {isSignUp ? 'Already have an account? ' : "Don't have an account? "}
          <button
            type="button"
            onClick={() => switchMode(!isSignUp)}
            className="rounded font-medium text-blue-600 transition hover:text-blue-700 hover:underline"
          >
            {isSignUp ? 'Sign In' : 'Sign Up'}
          </button>
        </p>

        <div className="mt-6 border-t border-slate-200 pt-5 text-center text-xs text-slate-500">
          <p>Demo authentication is disabled by default.</p>
          <p className="mt-1">
            Set{' '}
            <code className="rounded bg-slate-100 px-1 py-0.5 font-mono">
              NEXT_PUBLIC_AUTH_ENABLED=true
            </code>{' '}
            to enable.
          </p>
          <p className="mt-3">
            <Link
              href="/"
              className="font-medium text-slate-600 hover:underline"
            >
              Back to home
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
