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
        <div className="h-8 bg-slate-200 rounded w-1/4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-28 bg-slate-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
        <h3 className="font-bold">Failed to load dashboard metrics</h3>
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
      color: "text-blue-600 bg-blue-50 border-blue-200",
      link: "/admin/batches",
    },
    {
      title: "Successfully Processed",
      value: m.processed_papers,
      icon: CheckCircle2,
      color: "text-emerald-600 bg-emerald-50 border-emerald-200",
      link: "/admin/batches",
    },
    {
      title: "Processing In Progress",
      value: m.processing_papers,
      icon: Clock,
      color: "text-amber-600 bg-amber-50 border-amber-200",
      link: "/admin/batches",
    },
    {
      title: "Failed Processing",
      value: m.failed_papers,
      icon: AlertTriangle,
      color: "text-red-600 bg-red-50 border-red-200",
      link: "/admin/batches",
    },
    {
      title: "Total Extracted Questions",
      value: m.total_questions,
      icon: HelpCircle,
      color: "text-indigo-600 bg-indigo-50 border-indigo-200",
      link: "/admin/questions",
    },
    {
      title: "Published Questions",
      value: m.published_questions,
      icon: Eye,
      color: "text-teal-600 bg-teal-50 border-teal-200",
      link: "/admin/questions?publication_status=PUBLISHED",
    },
    {
      title: "Staged / Awaiting Review",
      value: m.awaiting_review_questions,
      icon: ClipboardCheck,
      color: "text-amber-600 bg-amber-50 border-amber-200",
      link: "/admin/staging",
    },
  ];

  return (
    <div className="space-y-8">
      {/* Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Admin Overview</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time status of question papers, background workers, and knowledge bank
          </p>
        </div>
        <div className="flex items-center space-x-2.5">
          <Link
            href="/admin/upload"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <UploadCloud className="w-4 h-4" />
            <span>Upload Papers</span>
          </Link>
          <Link
            href="/admin/staging"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-amber-50 border border-amber-200 hover:bg-amber-100 text-amber-800 rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <ClipboardCheck className="w-4 h-4 text-amber-600" />
            <span>Staging Area ({m.awaiting_review_questions})</span>
          </Link>
          <Link
            href="/admin/questions"
            className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <HelpCircle className="w-4 h-4 text-slate-500" />
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
              className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm hover:shadow transition group flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500">{c.title}</span>
                <div className={`p-2 rounded-lg border ${c.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <span className="text-2xl font-extrabold text-slate-900">{c.value}</span>
                <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-slate-600 transition" />
              </div>
            </Link>
          );
        })}
      </div>

      {/* Recent Ingestion Batches */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-bold text-slate-800">Recent Ingestion Batches</h3>
          </div>
          <Link
            href="/admin/batches"
            className="text-xs font-semibold text-blue-600 hover:text-blue-800 hover:underline flex items-center space-x-1"
          >
            <span>View All Batches</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {m.recent_batches.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-400">
            No ingestion batches recorded yet. Upload a batch to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-6 py-3">Batch ID</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Files</th>
                  <th className="px-6 py-3">Created</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {m.recent_batches.map((batch) => (
                  <tr key={batch.id} className="hover:bg-slate-50 transition">
                    <td className="px-6 py-3.5 font-mono text-slate-800 font-medium truncate max-w-xs">
                      {batch.id}
                    </td>
                    <td className="px-6 py-3.5">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full font-semibold text-[10px] ${
                          batch.status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : batch.status === "PROCESSING"
                            ? "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                            : batch.status === "FAILED"
                            ? "bg-red-50 text-red-700 border border-red-200"
                            : "bg-slate-100 text-slate-700 border border-slate-200"
                        }`}
                      >
                        {batch.status}
                      </span>
                    </td>
                    <td className="px-6 py-3.5">
                      <span className="font-semibold text-slate-800">{batch.processed_files}</span>
                      <span className="text-slate-400"> / {batch.total_files}</span>
                    </td>
                    <td className="px-6 py-3.5 text-slate-500">
                      {new Date(batch.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      <Link
                        href={`/admin/batches?id=${batch.id}`}
                        className="text-blue-600 hover:text-blue-800 font-semibold"
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
