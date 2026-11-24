"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Box, ArrowLeft, Mail, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { resetPassword } from "@/app/auth/actions";

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    const result = await resetPassword(formData);

    if (result?.error) {
      setError(result.error);
    } else if (result?.success) {
      setSuccess(result.success);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen w-screen bg-graphite-950 flex flex-col justify-center items-center px-4 font-sans text-graphite-100">
      <div className="w-full max-w-sm space-y-6">
        {/* Header */}
        <div className="flex flex-col items-center text-center space-y-2">
          <div className="w-10 h-10 rounded bg-forge/15 border border-forge/40 flex items-center justify-center">
            <Box className="w-5 h-5 text-forge" />
          </div>
          <h1 className="font-mono text-base font-bold tracking-wider text-graphite-100">
            3d.me
          </h1>
          <p className="text-xs text-graphite-400 font-mono">
            Reset Account Password
          </p>
        </div>

        {/* Card */}
        <div className="bg-graphite-900 border border-graphite-800 rounded-lg p-6 space-y-5 shadow-2xl">
          <div className="border-b border-graphite-800 pb-3">
            <h2 className="text-xs font-mono font-semibold uppercase tracking-wider text-graphite-200">
              Reset Password
            </h2>
          </div>

          {error && (
            <div className="p-2.5 bg-red-950/60 border border-red-800/60 rounded text-red-200 text-xs font-mono flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="p-2.5 bg-emerald-950/60 border border-emerald-800/60 rounded text-emerald-200 text-xs font-mono flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono text-graphite-400 uppercase">
                Account Email
              </label>
              <input
                type="email"
                name="email"
                required
                placeholder="creator@3d.me"
                className="w-full bg-graphite-850 border border-graphite-750 focus:border-forge rounded px-3 py-2 text-xs font-mono text-graphite-100 placeholder-graphite-600 outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 bg-forge hover:bg-forge-hover disabled:bg-graphite-800 text-graphite-950 font-semibold rounded text-xs font-mono transition-colors flex items-center justify-center gap-1.5"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Sending request...</span>
                </>
              ) : (
                <span>Send Reset Link</span>
              )}
            </button>
          </form>

          <div className="pt-2 border-t border-graphite-800 text-center">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-xs font-mono text-graphite-400 hover:text-graphite-200 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to sign in</span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
