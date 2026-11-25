import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    // Return standard browser client with fallback/dummy if not configured
    return createBrowserClient(
      supabaseUrl || "https://placeholder-meshforge.supabase.co",
      supabaseKey || "placeholder-key"
    );
  }

  return createBrowserClient(supabaseUrl, supabaseKey);
}

export function isSupabaseConfigured(): boolean {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  return Boolean(
    supabaseUrl &&
    supabaseKey &&
    supabaseUrl !== "https://placeholder-meshforge.supabase.co" &&
    !supabaseUrl.includes("placeholder")
  );
}
