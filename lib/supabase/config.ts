// Same "not configured" pattern as configuredProviders() and placesConfigured(): the app
// should degrade to a clear, honest message rather than a raw crash when Supabase hasn't
// been connected yet (see README's "Production integration order", step 1).
export function supabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
