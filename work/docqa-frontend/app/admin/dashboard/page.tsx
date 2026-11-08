"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { fetchDashboardMetrics, DashboardMetrics } from "../../../lib/api";
import {
  FileText,
  CheckCircle2,
  Clock,
  AlertTriangle,
  HelpCircle,
  Eye,
  FileCheck,
  ClipboardCheck,
  UploadCloud,
  Layers,
  ArrowRight,
  BookMarked,
} from "lucide-react";

export default function AdminDashboardPage() {
  const { data: metrics, isLoading, isError, error } = useQuery<DashboardMetrics>({
    queryKey: ["admin-dashboard"],
    queryFn: fetchDashboardMetrics,
    refetchInterval: 10000, // refresh every 10s
  });

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-8 bg-lift rounded w-1/4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-28 bg-lift rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-red-500/10 border border-red-500/25 rounded-xl text-red-300 text-sm">
        <h3 className="font-semibold">Failed to load dashboard metrics</h3>
        <p className="text-xs mt-1">{error instanceof Error ? error.message : "Error connecting to server"}</p>
      </div>
    );
  }

  const m = metrics || {
    total_papers: 0,
    processed_papers: 0,
    processing_papers: 0,
    failed_papers: 0,
    total_questions: 0,
    published_questions: 0,
    awaiting_review_questions: 0,
    recent_batches: [],
  };

  const statCards = [
    {
      title: "Total Uploaded Papers",
      value: m.total_papers,
      icon: FileText,
      color: "text-ink-soft bg-raised border-line-strong",
      link: "/admin/batches",
    },
    {
      title: "Successfully Processed",
      value: m.processed_papers,
      icon: CheckCircle2,
      color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25",
      link: "/admin/batches",
    },
    {
      title: "Processing In Progress",
      value: m.processing_papers,
      icon: Clock,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/25",
      link: "/admin/batches",
    },
    {
      title: "Failed Processing",
      value: m.failed_papers,
      icon: AlertTriangle,
      color: "text-red-400 bg-red-500/10 border-red-500/25",
      link: "/admin/batches",
    },
    {
      title: "Total Extracted Questions",
      value: m.total_questions,
      icon: HelpCircle,
      color: "text-ink-soft bg-raised border-line-strong",
      link: "/admin/questions",
    },
    {
      title: "Published Questions",
      value: m.published_questions,
      icon: Eye,
      color: "text-ink-soft bg-raised border-line-strong",
      link: "/admin/questions?publication_status=PUBLISHED",
    },
    {
      title: "Staged / Awaiting Review",
      value: m.awaiting_review_questions,
      icon: ClipboardCheck,
      color: "text-amber-400 bg-amber-500/10 border-amber-500/25",
      link: "/admin/staging",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Admin Overview</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Real-time status of question papers, background workers, and knowledge bank
          </p>
        </div>
        <div className="flex items-center space-x-2.5">
          <Link
            href="/admin/upload"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-primary hover:bg-primary-hover text-ground rounded-lg text-xs font-semibold transition"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Papers</span>
          </Link>
          <Link
            href="/admin/staging"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-amber-500/10 border border-amber-500/25 hover:bg-amber-500/15 text-amber-300 rounded-lg text-xs font-semibold transition"
          >
            <ClipboardCheck className="w-4 h-4 text-amber-400" />
            <span>Staging Area ({m.awaiting_review_questions})</span>
          </Link>
          <Link
            href="/admin/questions"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-surface border border-line hover:bg-raised text-ink-soft rounded-lg text-xs font-semibold transition"
          >
            <HelpCircle className="w-4 h-4 text-ink-muted" />
            <span>Question Bank</span>
          </Link>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.title}
              href={c.link}
              className="bg-surface p-5 rounded-xl border border-line hover:shadow transition group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-ink-muted">{c.title}</span>
                <div className={`p-2 rounded-lg border ${c.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-2xl font-semibold text-ink">{c.value}</span>
                <ArrowRight className="w-4 h-4 text-ink-dim group-hover:text-ink-soft transition" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Ingestion Batches */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        <div className="px-6 py-4 border-b border-line-soft flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-primary" />
            <h3 className="text-sm font-semibold text-ink">Recent Ingestion Batches</h3>
          </div>
          <Link
            href="/admin/batches"
            className="text-xs font-semibold text-primary hover:text-primary hover:underline flex items-center space-x-1"
          >
            <span>View All Batches</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {m.recent_batches.length === 0 ? (
          <div className="p-8 text-center text-xs text-ink-faint">
            No ingestion batches recorded yet. Upload a batch to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-ink-soft">
              <thead className="bg-ground border-b border-line text-ink-soft font-semibold text-[10px]">
                <tr>
                  <th className="px-6 py-3">Batch ID</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Files</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {m.recent_batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-raised transition">
                    <td className="px-6 py-3.5 font-mono text-ink font-medium truncate max-w-xs">
                      {batch.id}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                          batch.status === "COMPLETED"
                            ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
                            : batch.status === "PROCESSING"
                            ? "bg-amber-500/10 text-amber-300 border border-amber-500/25 animate-pulse"
                            : batch.status === "FAILED"
                            ? "bg-red-500/10 text-red-300 border border-red-500/25"
                            : "bg-raised text-ink-soft border border-line"
                        }`}
                      >
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="font-semibold text-ink">{batch.processed_files}</span>
                      <span className="text-ink-faint"> / {batch.total_files}</span>
                    </td>
                    <td className="px-6 py-3.5 text-ink-muted">
                      {new Date(batch.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link
                        href={`/admin/batches?id=${batch.id}`}
                        className="text-primary hover:text-primary font-semibold"
                      >
                        Inspect →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
