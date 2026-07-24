"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, ArrowRight, Sparkles } from "lucide-react";
import { supabaseConfigured } from "@/lib/supabase/config";

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmSent, setConfirmSent] = useState(false);

  if (!supabaseConfigured()) {
    return <main className="auth-shell"><div className="modal"><span className="feature-icon"><AlertCircle /></span><h2>Supabase isn&apos;t configured yet</h2><p>Add NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY to .env.local, then restart the dev server.</p></div></main>;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setLoading(true);
    try {
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email, password,
        options: { data: { full_name: fullName } }
      });
      if (signUpError) throw signUpError;
      if (data.session) { router.push("/app"); router.refresh(); return; }
      setConfirmSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed.");
    } finally {
      setLoading(false);
    }
  }

  if (confirmSent) {
    return <main className="auth-shell"><div className="modal"><span className="feature-icon"><Sparkles /></span><h2>Check your email</h2><p>We sent a confirmation link to <b>{email}</b>. Click it to activate your account, then <Link href="/login">sign in</Link>.</p></div></main>;
  }

  return <main className="auth-shell">
    <form className="modal" onSubmit={submit}>
      <span className="feature-icon"><Sparkles /></span>
      <h2>Create your agency account</h2>
      <p>Track AI visibility across every client brand you manage.</p>
      <label>Full name<input required value={fullName} onChange={e => setFullName(e.target.value)} placeholder="Maya Johnson" /></label>
      <label>Work email<input required type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="maya@youragency.com" /></label>
      <label>Password<input required type="password" minLength={8} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" /></label>
      {error && <div className="checker-error"><AlertCircle /><div><b>Couldn&apos;t create your account</b><p>{error}</p></div></div>}
      <button className="button" disabled={loading}>{loading ? "Creating account…" : <>Create account <ArrowRight /></>}</button>
      <small>Already have an account? <Link href="/login">Sign in</Link></small>
    </form>
  </main>;
}
