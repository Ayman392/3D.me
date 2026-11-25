"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";
import { isSupabaseConfigured } from "@/utils/supabase/client";
import { cookies } from "next/headers";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (!isSupabaseConfigured()) {
    // Development local session mode
    const cookieStore = await cookies();
    cookieStore.set("3dme_dev_session", JSON.stringify({ email, id: "dev-user-001" }), {
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 days
      httpOnly: false,
    });
    // Clean up legacy cookie if present
    cookieStore.delete("meshforge_dev_session");
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signup(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Email and password are required." };
  }

  if (password.length < 6) {
    return { error: "Password must be at least 6 characters." };
  }

  if (!isSupabaseConfigured()) {
    // Development local session mode
    const cookieStore = await cookies();
    cookieStore.set("3dme_dev_session", JSON.stringify({ email, id: "dev-user-001" }), {
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
      httpOnly: false,
    });
    cookieStore.delete("meshforge_dev_session");
    revalidatePath("/", "layout");
    redirect("/dashboard");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signout() {
  const cookieStore = await cookies();
  cookieStore.delete("3dme_dev_session");
  cookieStore.delete("meshforge_dev_session");

  if (isSupabaseConfigured()) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }

  revalidatePath("/", "layout");
  redirect("/login");
}

export async function resetPassword(formData: FormData) {
  const email = formData.get("email") as string;

  if (!email) {
    return { error: "Email is required." };
  }

  if (!isSupabaseConfigured()) {
    return { success: "Password reset link sent to your email (Development mode)." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/auth/callback?next=/dashboard`,
  });

  if (error) {
    return { error: error.message };
  }

  return { success: "Password reset link has been dispatched to your email." };
}
