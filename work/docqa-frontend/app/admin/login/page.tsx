"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { loginAdmin } from "../../../lib/api";
import { Shield, KeyRound, User, ArrowLeft } from "lucide-react";
import { LogoMark } from "../../../components/brand/LogoMark";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await loginAdmin(username, password);
      router.push("/admin/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-ground flex flex-col justify-center items-center p-4 font-sans">
      <div className="w-full max-w-md bg-surface rounded-2xl shadow-2xl p-8 space-y-6 border border-line-strong">
        <div className="text-center space-y-2">
          <LogoMark className="mx-auto h-12 w-12" />
          <h1 className="text-2xl font-semibold text-ink tracking-tight">QueryQP Admin Sign In</h1>
          <p className="text-xs text-ink-muted">
            Manage question papers, extraction pipelines, and knowledge base
          </p>
        </div>

        {error && (
          <div className="p-3 bg-red-500/10 border border-red-500/25 text-red-300 text-xs rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Username</label>
            <div className="relative">
              <User className="w-4 h-4 text-ink-faint absolute left-3 top-3 pointer-events-none" />
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="admin"
                className="w-full pl-9 pr-3 py-2 text-sm bg-ground border border-line rounded-lg text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1">Password</label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-ink-faint absolute left-3 top-3 pointer-events-none" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full pl-9 pr-3 py-2 text-sm bg-ground border border-line rounded-lg text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-primary hover:bg-primary-hover disabled:bg-ink-dim text-ground rounded-lg text-sm font-semibold transition"
          >
            {loading ? "Authenticating..." : "Sign In to Portal"}
          </button>
        </form>

        <div className="pt-2 text-center">
          <Link
            href="/"
            className="inline-flex items-center space-x-1 text-xs text-ink-muted hover:text-ink transition"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Student Search</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
