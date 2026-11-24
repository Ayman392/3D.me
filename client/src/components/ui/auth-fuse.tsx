"use client";

import * as React from "react";
import { useState, useId, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cva, type VariantProps } from "class-variance-authority";
import {
  Eye,
  EyeOff,
  Sparkles,
  Box,
  ArrowRight,
  Lock,
  Mail,
  User,
} from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DoodleButton } from "@/components/ui/doodle-button";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface TypewriterProps {
  text: string | string[];
  speed?: number;
  cursor?: string;
  loop?: boolean;
  deleteSpeed?: number;
  delay?: number;
  className?: string;
}

export function Typewriter({
  text,
  speed = 100,
  cursor = "|",
  loop = false,
  deleteSpeed = 50,
  delay = 1500,
  className,
}: TypewriterProps) {
  const [displayText, setDisplayText] = useState("");
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);
  const [textArrayIndex, setTextArrayIndex] = useState(0);

  const textKey = Array.isArray(text) ? text.join("\u0000") : text;
  const textArray = useMemo(
    () => (Array.isArray(text) ? text : [text]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [textKey],
  );
  const currentText = textArray[textArrayIndex] || "";

  useEffect(() => {
    if (!currentText) return;

    let innerTimer: ReturnType<typeof setTimeout> | undefined;

    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          if (currentIndex < currentText.length) {
            setDisplayText((prev) => prev + currentText[currentIndex]);
            setCurrentIndex((prev) => prev + 1);
          } else if (loop) {
            innerTimer = setTimeout(() => setIsDeleting(true), delay);
          }
        } else {
          if (displayText.length > 0) {
            setDisplayText((prev) => prev.slice(0, -1));
          } else {
            setIsDeleting(false);
            setCurrentIndex(0);
            setTextArrayIndex((prev) => (prev + 1) % textArray.length);
          }
        }
      },
      isDeleting ? deleteSpeed : speed,
    );

    return () => {
      clearTimeout(timeout);
      if (innerTimer) clearTimeout(innerTimer);
    };
  }, [
    currentIndex,
    isDeleting,
    currentText,
    textArray.length,
    loop,
    speed,
    deleteSpeed,
    delay,
    displayText,
  ]);

  return (
    <span className={className}>
      {displayText}
      <span className="animate-pulse text-[var(--brand,#ff6b2c)]">
        {cursor}
      </span>
    </span>
  );
}

const labelVariants = cva(
  "text-xs font-bold uppercase tracking-wider text-foreground/90 peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
);

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> &
    VariantProps<typeof labelVariants>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(labelVariants(), className)}
    {...props}
  />
));
Label.displayName = LabelPrimitive.Root.displayName;

interface DoodleInputProps extends React.ComponentProps<"input"> {
  icon?: React.ReactNode;
}

const DoodleInput = React.forwardRef<HTMLInputElement, DoodleInputProps>(
  ({ className, type, icon, ...props }, ref) => {
    return (
      <div className="relative flex items-center">
        {icon && (
          <span className="pointer-events-none absolute left-3.5 flex items-center text-muted-foreground">
            {icon}
          </span>
        )}
        <input
          type={type}
          className={cn(
            "flex h-11 w-full rounded-xl border-2 border-foreground/80 bg-background/95 px-3.5 py-2.5 text-sm font-medium text-foreground shadow-[0_3px_0_var(--foreground)] transition-all placeholder:font-normal placeholder:text-muted-foreground/70 focus:border-[var(--brand,#ff6b2c)] focus:shadow-[0_3px_0_var(--brand,#ff6b2c)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
            icon && "pl-10",
            className,
          )}
          ref={ref}
          {...props}
        />
      </div>
    );
  },
);
DoodleInput.displayName = "DoodleInput";

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, label, ...props }, ref) => {
    const id = useId();
    const [showPassword, setShowPassword] = useState(false);
    const togglePasswordVisibility = () => setShowPassword((prev) => !prev);
    return (
      <div className="grid w-full items-center gap-1.5">
        {label && <Label htmlFor={id}>{label}</Label>}
        <div className="relative flex items-center">
          <span className="pointer-events-none absolute left-3.5 flex items-center text-muted-foreground">
            <Lock className="size-4" />
          </span>
          <input
            id={id}
            type={showPassword ? "text" : "password"}
            className={cn(
              "flex h-11 w-full rounded-xl border-2 border-foreground/80 bg-background/95 pl-10 pr-11 py-2.5 text-sm font-medium text-foreground shadow-[0_3px_0_var(--foreground)] transition-all placeholder:font-normal placeholder:text-muted-foreground/70 focus:border-[var(--brand,#ff6b2c)] focus:shadow-[0_3px_0_var(--brand,#ff6b2c)] focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
              className,
            )}
            ref={ref}
            {...props}
          />
          <button
            type="button"
            onClick={togglePasswordVisibility}
            className="absolute inset-y-0 right-0 flex h-full w-11 items-center justify-center rounded-r-xl text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
      </div>
    );
  },
);
PasswordInput.displayName = "PasswordInput";

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(signInError.message || "Invalid email or password.");
        return;
      }

      const safeRedirect = redirectTo.startsWith("/")
        ? redirectTo
        : "/dashboard";
      router.push(safeRedirect);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Check your Supabase URL/Key in .env.local and restart dev server.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSignIn}
      autoComplete="on"
      className="flex flex-col gap-5"
    >
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Welcome back to{" "}
          <span className="text-[var(--brand,#ff6b2c)]">3d.me</span>
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Sign in to open your local 2D-to-3D workspace &amp; .GLB vault
        </p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="signin-email">Email</Label>
          <DoodleInput
            id="signin-email"
            name="email"
            type="email"
            icon={<Mail className="size-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>

        <PasswordInput
          name="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="Enter your password"
        />

        {error && (
          <div className="rounded-xl border-2 border-destructive bg-destructive/10 px-3.5 py-2.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        <div className="pt-1">
          <DoodleButton
            type="submit"
            variant="solid"
            size="md"
            disabled={loading}
            className="w-full"
          >
            <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
              <span>{loading ? "Signing in..." : "Enter 3D Studio"}</span>
              {!loading && <ArrowRight className="size-4 shrink-0" />}
            </span>
          </DoodleButton>
        </div>
      </div>
    </form>
  );
}

function SignUpForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);

    if (name.trim().length < 2) {
      setError("Name must be at least 2 characters.");
      return;
    }

    if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/[0-9]/.test(password)
    ) {
      setError(
        "Password must be 8+ characters with uppercase, lowercase, and a number.",
      );
      return;
    }

    setLoading(true);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { name: name.trim() },
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.user && data.session) {
        await supabase.from("profiles").upsert({
          id: data.user.id,
          name: name.trim(),
          email: email.trim(),
        });
        router.push("/dashboard");
        router.refresh();
      } else {
        setInfo(
          "Account created! Check your email to confirm your address before signing in.",
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Something went wrong creating your account.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <form
      onSubmit={handleSignUp}
      autoComplete="on"
      className="flex flex-col gap-5"
    >
      <div className="space-y-1 text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">
          Create your <span className="text-[var(--brand,#ff6b2c)]">3d.me</span>{" "}
          account
        </h1>
        <p className="text-xs text-muted-foreground sm:text-sm">
          Save generated .GLB models and inspect them anytime
        </p>
      </div>

      <div className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="signup-name">Full Name</Label>
          <DoodleInput
            id="signup-name"
            name="name"
            type="text"
            icon={<User className="size-4" />}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            required
            autoComplete="name"
          />
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="signup-email">Email</Label>
          <DoodleInput
            id="signup-email"
            name="email"
            type="email"
            icon={<Mail className="size-4" />}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            autoComplete="email"
          />
        </div>

        <PasswordInput
          name="password"
          label="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="new-password"
          placeholder="8+ chars, upper, lower & number"
        />

        {error && (
          <div className="rounded-xl border-2 border-destructive bg-destructive/10 px-3.5 py-2.5 text-xs font-semibold text-destructive">
            {error}
          </div>
        )}

        {info && (
          <div className="rounded-xl border-2 border-foreground/40 bg-muted px-3.5 py-2.5 text-xs font-semibold text-foreground">
            {info}
          </div>
        )}

        <div className="pt-1">
          <DoodleButton
            type="submit"
            variant="solid"
            size="md"
            disabled={loading}
            className="w-full"
          >
            <span className="inline-flex items-center justify-center gap-2 whitespace-nowrap">
              <span>{loading ? "Creating account..." : "Create Account"}</span>
              {!loading && <ArrowRight className="size-4 shrink-0" />}
            </span>
          </DoodleButton>
        </div>
      </div>
    </form>
  );
}

function AuthFormContainer({
  isSignIn,
  onSetMode,
  bgHoverImage,
  quote,
}: {
  isSignIn: boolean;
  onSetMode: (signIn: boolean) => void;
  bgHoverImage: string;
  quote: { text: string; author: string };
}) {
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const handleGoogleSignIn = async () => {
    setOauthError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/dashboard`,
        },
      });
      if (error) {
        setOauthError(error.message);
      }
    } catch {
      setOauthError("Google sign-in is not configured yet.");
    }
  };

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="relative w-full max-w-[460px] overflow-hidden rounded-[2rem] border-2 border-foreground bg-card p-5 shadow-[0_7px_0_var(--foreground)] sm:p-7"
    >
      {/* Background Hover Image behind Sign In / Sign Up Section */}
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-0 bg-cover bg-center transition-all duration-700 ease-out",
          isHovered ? "scale-105 opacity-30" : "scale-100 opacity-0",
        )}
        style={{ backgroundImage: `url(${bgHoverImage})` }}
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 z-0 transition-opacity duration-500",
          isHovered
            ? "bg-gradient-to-b from-background/80 via-background/70 to-background/90 opacity-100"
            : "opacity-0",
        )}
      />

      {/* Foreground Auth Content */}
      <div className="relative z-10">
        {/* Brand Pill + Mode Switcher */}
        <div className="mb-4 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border-2 border-foreground bg-background px-3.5 py-1.5 text-xs font-extrabold tracking-tight text-foreground shadow-[0_3px_0_var(--foreground)] transition-transform hover:-translate-y-0.5"
          >
            <Box className="size-3.5 text-[var(--brand,#ff6b2c)]" />
            <span>3d.me</span>
          </Link>

          <div className="inline-flex rounded-full border-2 border-foreground bg-background p-1 shadow-[0_3px_0_var(--foreground)]">
            <button
              type="button"
              onClick={() => onSetMode(true)}
              className={cn(
                "rounded-full px-3.5 py-1 text-xs font-bold transition-all",
                isSignIn
                  ? "bg-[var(--brand,#ff6b2c)] text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => onSetMode(false)}
              className={cn(
                "rounded-full px-3.5 py-1 text-xs font-bold transition-all",
                !isSignIn
                  ? "bg-[var(--brand,#ff6b2c)] text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Sign Up
            </button>
          </div>
        </div>

        <div className="mb-4 flex justify-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border-2 border-foreground bg-background px-3 py-1 text-[11px] font-bold uppercase tracking-wider shadow-[0_2px_0_var(--foreground)]">
            <Sparkles className="size-3 text-[var(--brand,#ff6b2c)]" />
            <span className="text-[#2433c9] dark:text-[#ffd23f]">
              {isSignIn ? "LOCAL 3D WORKSPACE" : "FREE CREATOR ACCOUNT"}
            </span>
          </span>
        </div>

        {isSignIn ? <SignInForm /> : <SignUpForm />}

        {/* Divider */}
        <div className="relative my-5 text-center text-xs font-semibold uppercase tracking-wider after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t-2 after:border-dashed after:border-foreground/20">
          <span className="relative z-10 rounded-full bg-background/90 px-3 text-muted-foreground">
            Or continue with
          </span>
        </div>

        {oauthError && (
          <div className="mb-3 rounded-xl border-2 border-destructive bg-destructive/10 px-3.5 py-2 text-xs font-semibold text-destructive">
            {oauthError}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border-2 border-foreground bg-background/95 px-4 text-sm font-bold text-foreground shadow-[0_3px_0_var(--foreground)] transition-all hover:-translate-y-0.5 hover:bg-muted active:translate-y-0"
        >
          <Image
            width={18}
            height={18}
            src="https://cdn.21st.dev/assets/mirror/38/38146bfd9eff6dbf0d74771f2e625c70d87d3770e0d080dbb6e50db1d5403f46.svg"
            alt="Google icon"
            className="h-4 w-4"
          />
          <span>Continue with Google</span>
        </button>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          {isSignIn ? "New to 3d.me?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => onSetMode(!isSignIn)}
            className="font-bold text-[var(--brand,#ff6b2c)] underline-offset-4 hover:underline"
          >
            {isSignIn ? "Create an account" : "Sign in here"}
          </button>
        </p>

        <blockquote className="mt-5 border-t-2 border-dashed border-foreground/15 pt-3.5 text-center">
          <p className="text-xs font-semibold text-foreground/90">
            “
            <Typewriter key={quote.text} text={quote.text} speed={55} />”
          </p>
          <cite className="mt-1 block text-[10px] font-bold uppercase tracking-wider text-[var(--brand,#ff6b2c)] not-italic">
            — {quote.author}
          </cite>
        </blockquote>
      </div>
    </div>
  );
}

interface AuthContentProps {
  image?: {
    src: string;
    alt: string;
  };
  quote?: {
    text: string;
    author: string;
  };
}

interface AuthUIProps {
  defaultMode?: "signin" | "signup";
  signInContent?: AuthContentProps;
  signUpContent?: AuthContentProps;
}

const defaultSignInContent = {
  image: {
    src: "/auth/auth-signin.jpg",
    alt: "3D mechanical bust and camera mesh studio render",
  },
  quote: {
    text: "2D images into local 3D meshes in ~30 seconds.",
    author: "3d.me Studio",
  },
};

const defaultSignUpContent = {
  image: {
    src: "/auth/auth-signup.jpg",
    alt: "3D diorama workspace studio render",
  },
  quote: {
    text: "Zero cloud lock-in. Inspect and export .GLB locally.",
    author: "3d.me Studio",
  },
};

export function AuthUI({
  defaultMode = "signin",
  signInContent = {},
  signUpContent = {},
}: AuthUIProps) {
  const [isSignIn, setIsSignIn] = useState(defaultMode === "signin");

  const finalSignInContent = {
    image: { ...defaultSignInContent.image, ...signInContent.image },
    quote: { ...defaultSignInContent.quote, ...signInContent.quote },
  };
  const finalSignUpContent = {
    image: { ...defaultSignUpContent.image, ...signUpContent.image },
    quote: { ...defaultSignUpContent.quote, ...signUpContent.quote },
  };

  const currentContent = isSignIn ? finalSignInContent : finalSignUpContent;

  return (
    <div
      className="flex min-h-screen w-full items-center justify-center bg-background px-4 pb-10 pt-24 sm:px-6"
      style={{
        backgroundImage:
          "radial-gradient(color-mix(in oklab, var(--foreground) 14%, transparent) 1px, transparent 1px)",
        backgroundSize: "20px 20px",
      }}
    >
      <style>{`
        input[type="password"]::-ms-reveal,
        input[type="password"]::-ms-clear {
          display: none;
        }
      `}</style>

      <AuthFormContainer
        isSignIn={isSignIn}
        onSetMode={setIsSignIn}
        bgHoverImage={currentContent.image.src}
        quote={currentContent.quote}
      />
    </div>
  );
}
