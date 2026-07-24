"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase/config";

export default function LoginPage() {
  return <Suspense fallback={<main className="auth-shell" />}><LoginForm /></Suspense>;
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!supabaseConfigured()) {
    return <main className="auth-shell"><div className="modal"><span className="feature-icon"><AlertCircle /></span><h2>Supabase isn&apos;t configured yet</h2><p>Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to .env.local, then restart the dev server.</p></div></main>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) throw signInError;
      router.push(params.get("next") || "/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-shell">
    <form className="modal" onSubmit={submit}>
      <span className="feature-icon"><Sparkles /></span>
      <h2>Sign in</h2>
      <p>Welcome back — pick up where you left off.</p>
      <label>Work email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="maya@youragency.com" /></label>
      <label>Password<input required type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Your password" /></label>
      {error && <div className="checker-error"><AlertCircle /><div><b>Couldn&apos;t sign in</b><p>{error}</p></div></div>}
      <button className="button" disabled={loading}>{loading ? "Signing in…" : <>Sign in <ArrowRight /></>}</button>
      <small>Don&apos;t have an account? <Link href="/signup">Create one</Link></small>
    </form>
  </main>;
}
