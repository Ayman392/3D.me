import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "./client";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;
  const isProtectedRoute = pathname.startsWith("/dashboard") ||
                           pathname.startsWith("/history") ||
                           pathname.startsWith("/models") ||
                           pathname.startsWith("/cad");
  const isAuthRoute = pathname === "/login" || pathname === "/signup" || pathname === "/forgot-password";

  // Check 3dme_dev_session or legacy meshforge_dev_session with one-time migration
  let devSessionCookie = request.cookies.get("3dme_dev_session");
  let needMigration = false;
  if (!devSessionCookie) {
    const legacyCookie = request.cookies.get("meshforge_dev_session");
    if (legacyCookie) {
      devSessionCookie = legacyCookie;
      needMigration = true;
    }
  }
  const hasDevSession = Boolean(devSessionCookie?.value);

  if (needMigration && devSessionCookie) {
    supabaseResponse.cookies.set("3dme_dev_session", devSessionCookie.value, {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      sameSite: "lax",
    });
    supabaseResponse.cookies.delete("meshforge_dev_session");
  }

  if (!isSupabaseConfigured()) {
    if (isProtectedRoute && !hasDevSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      return NextResponse.redirect(url);
    }
    if (isAuthRoute && hasDevSession) {
      const url = request.nextUrl.clone();
      url.pathname = "/dashboard";
      return NextResponse.redirect(url);
    }
    return supabaseResponse;
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // IMPORTANT: Do not run code between createServerClient and
  // supabase.auth.getUser(). A simple mistake could make it very hard to debug
  // issues with users being randomly logged out.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (isProtectedRoute && !user && !hasDevSession) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isAuthRoute && (user || hasDevSession)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
