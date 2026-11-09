"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchBatches,
  fetchBatchDetail,
  retryDocumentProcessing,
  reprocessDocument,
  deleteBatch,
  deleteDocument,
  BatchItem,
  QuestionPaper,
} from "../../../lib/api";
import {
  Layers,
  RefreshCw,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileText,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  Trash2,
} from "lucide-react";

export default function BatchesMonitorPage() {
  const searchParams = useSearchParams();
  const requestedBatchId = searchParams.get("id");
  const queryClient = useQueryClient();

  const [expandedBatchId, setExpandedBatchId] = useState<string | null>(requestedBatchId);

  // Poll batches every 3.5 seconds
  const { data: batches = [], isLoading: loadingBatches } = useQuery<BatchItem[]>({
    queryKey: ["admin-batches"],
    queryFn: () => fetchBatches(0, 50),
    refetchInterval: 3500,
  });

  // Selected batch detail query
  const activeBatchId = expandedBatchId || (batches.length > 0 ? batches[0].id : null);

  const { data: activeBatchDetail, isLoading: loadingDetail } = useQuery<BatchItem>({
    queryKey: ["admin-batch-detail", activeBatchId],
    queryFn: () => {
      if (!activeBatchId) throw new Error("No active batch");
      return fetchBatchDetail(activeBatchId);
    },
    enabled: Boolean(activeBatchId),
    refetchInterval: 3000,
  });

  const retryMutation = useMutation({
    mutationFn: (documentId: string) => retryDocumentProcessing(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-batch-detail"] });
      queryClient.invalidateQueries({ queryKey: ["admin-batches"] });
    },
  });

  const reprocessDocMutation = useMutation({
    mutationFn: (documentId: string) => reprocessDocument(documentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-batch-detail"] });
      queryClient.invalidateQueries({ queryKey: ["admin-batches"] });
    },
  });

  const deleteBatchMutation = useMutation({
    mutationFn: (batchId: string) => deleteBatch(batchId),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({ queryKey: ["admin-batches"] });
      queryClient.invalidateQueries({ queryKey: ["admin-batch-detail"] });
      if (expandedBatchId === deletedId) setExpandedBatchId(null);
    },
  });

  const deleteDocMutation = useMutation({
    mutationFn: (docId: string) => deleteDocument(docId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-batch-detail"] });
      queryClient.invalidateQueries({ queryKey: ["admin-batches"] });
    },
  });

  const emptyBatches = batches.filter((b) => b.total_files === 0);

  const handleClearEmptyBatches = async () => {
    if (!emptyBatches.length) return;
    if (confirm(`Delete ${emptyBatches.length} empty redundant batches?`)) {
      for (const b of emptyBatches) {
        await deleteBatch(b.id);
      }
      queryClient.invalidateQueries({ queryKey: ["admin-batches"] });
      queryClient.invalidateQueries({ queryKey: ["admin-batch-detail"] });
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Title */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-ink tracking-tight">Batch Processing Monitor</h1>
          <p className="text-xs text-ink-muted mt-0.5">
            Real-time pipeline monitoring for document parsing, question segmentation, and indexing
          </p>
        </div>

        <div className="flex items-center gap-2">
          {emptyBatches.length > 0 && (
            <button
              onClick={handleClearEmptyBatches}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/15 text-red-300 border border-red-500/25 rounded-lg text-xs font-semibold transition"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Clear {emptyBatches.length} Empty Batches</span>
            </button>
          )}
          <button
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["admin-batches"] });
              queryClient.invalidateQueries({ queryKey: ["admin-batch-detail"] });
            }}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-surface border border-line hover:bg-raised rounded-lg text-xs font-semibold text-ink-soft transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-ink-faint" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loadingBatches && batches.length === 0 ? (
        <div className="p-12 text-center text-xs text-ink-faint animate-pulse">
          Loading ingestion batches...
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-surface rounded-xl border border-line p-12 text-center space-y-3">
          <Layers className="w-8 h-8 text-ink-faint mx-auto" />
          <h3 className="text-sm font-semibold text-ink">No batches uploaded yet</h3>
          <p className="text-xs text-ink-muted">
            Upload question papers from the Upload page to monitor their extraction.
          </p>
          <Link
            href="/admin/upload"
            className="inline-block mt-2 px-4 py-2 bg-primary text-ground rounded-lg text-xs font-semibold"
          >
            Go to Upload
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Batches List Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-semibold text-ink-soft">
              Batches ({batches.length})
            </h3>
            <div className="space-y-2 max-h-[75vh] overflow-y-auto pr-1">
              {batches.map((b) => {
                const isSelected = b.id === activeBatchId;
                return (
                  <div
                    key={b.id}
                    onClick={() => setExpandedBatchId(b.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition flex flex-col space-y-2 cursor-pointer relative group ${
                      isSelected
                        ? "bg-surface border-primary ring-1 ring-primary/20"
                        : "bg-surface border-line hover:border-line-strong"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-semibold text-ink truncate max-w-[140px]">
                        {b.id.substring(0, 16)}...
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                            b.status === "COMPLETED"
                              ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
                              : b.status === "PROCESSING"
                              ? "bg-amber-500/10 text-amber-300 border border-amber-500/25 animate-pulse"
                              : b.status === "FAILED"
                              ? "bg-red-500/10 text-red-300 border border-red-500/25"
                              : "bg-raised text-ink-soft"
                          }`}
                        >
                          {b.status}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm(`Permanently delete batch ${b.id.substring(0, 8)}...?`)) {
                              deleteBatchMutation.mutate(b.id);
                            }
                          }}
                          title="Delete Batch"
                          className="p-1 text-ink-dim hover:text-red-400 hover:bg-red-500/10 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-ink-muted">
                      <span>{b.processed_files} / {b.total_files} files processed</span>
                      <span>{new Date(b.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Active Batch Documents Panel */}
          <div className="lg:col-span-8 space-y-4">
            {activeBatchDetail && (
              <div className="bg-surface rounded-xl border border-line p-5 space-y-6">
                {/* Batch Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft pb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-ink-faint font-medium">Batch</span>
                      <span className="font-mono text-xs font-semibold text-ink">
                        {activeBatchDetail.id}
                      </span>
                    </div>
                    <p className="text-[11px] text-ink-faint mt-0.5">
                      Created at {new Date(activeBatchDetail.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg ${
                        activeBatchDetail.status === "COMPLETED"
                          ? "bg-emerald-500/10 text-emerald-300 border border-emerald-500/25"
                          : activeBatchDetail.status === "PROCESSING"
                          ? "bg-amber-500/10 text-amber-300 border border-amber-500/25 animate-pulse"
                          : activeBatchDetail.status === "FAILED"
                          ? "bg-red-500/10 text-red-300 border border-red-500/25"
                          : "bg-raised text-ink-soft"
                      }`}
                    >
                      {activeBatchDetail.status}
                    </span>
                    <button
                      onClick={() => {
                        if (confirm(`Permanently delete batch ${activeBatchDetail.id} and all its documents?`)) {
                          deleteBatchMutation.mutate(activeBatchDetail.id);
                        }
                      }}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-red-300 bg-red-500/10 hover:bg-red-500/15 border border-red-500/25 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      <span>Delete Batch</span>
                    </button>
                  </div>
                </div>

                {/* Document Cards */}
                <div className="space-y-3">
                  <h4 className="text-xs font-semibold text-ink-soft">
                    Paper Files ({activeBatchDetail.documents?.length || 0})
                  </h4>

                  {(!activeBatchDetail.documents || activeBatchDetail.documents.length === 0) ? (
                    <div className="p-6 text-center text-xs text-ink-faint bg-ground rounded-lg">
                      No documents found in this batch.
                    </div>
                  ) : (
                    activeBatchDetail.documents.map((doc: QuestionPaper) => (
                      <div
                        key={doc.id}
                        className="p-4 bg-ground rounded-xl border border-line space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-primary flex-shrink-0" />
                            <span className="text-xs font-semibold text-ink truncate max-w-sm">
                              {doc.filename}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2 text-xs">
                            <span className="px-2 py-0.5 bg-surface border border-line rounded font-semibold text-ink-soft">
                              {doc.subject_code && doc.subject_name
                                ? `${doc.subject_code} - ${doc.subject_name}`
                                : doc.subject_name || doc.subject_code || "Unknown Subject"}
                            </span>
                            <span className="px-2 py-0.5 bg-surface border border-line rounded font-semibold text-ink-soft">
                              {doc.exam_year} {doc.exam_type}
                            </span>
                          </div>
                        </div>

                        {/* Pipeline Stage Indicators */}
                        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                          <div className="p-2 bg-surface rounded border border-line">
                            <span className="text-[10px] text-ink-faint font-medium block">
                              1. Parse
                            </span>
                            <span className={`font-semibold ${
                              doc.parser_status === "COMPLETED" ? "text-emerald-400" :
                              doc.parser_status === "IN_PROGRESS" ? "text-amber-400 animate-pulse" :
                              doc.parser_status === "FAILED" ? "text-red-400" : "text-ink-muted"
                            }`}>
                              {doc.parser_status}
                            </span>
                          </div>

                          <div className="p-2 bg-surface rounded border border-line">
                            <span className="text-[10px] text-ink-faint font-medium block">
                              2. Segment
                            </span>
                            <span className={`font-semibold ${
                              doc.extraction_status === "COMPLETED" ? "text-emerald-400" :
                              doc.extraction_status === "IN_PROGRESS" ? "text-amber-400 animate-pulse" :
                              doc.extraction_status === "FAILED" ? "text-red-400" : "text-ink-muted"
                            }`}>
                              {doc.extraction_status}
                            </span>
                          </div>

                          <div className="p-2 bg-surface rounded border border-line">
                            <span className="text-[10px] text-ink-faint font-medium block">
                              3. Index
                            </span>
                            <span className={`font-semibold ${
                              doc.indexing_status === "COMPLETED" ? "text-emerald-400" :
                              doc.indexing_status === "IN_PROGRESS" ? "text-amber-400 animate-pulse" :
                              doc.indexing_status === "FAILED" ? "text-red-400" : "text-ink-muted"
                            }`}>
                              {doc.indexing_status}
                            </span>
                          </div>
                        </div>

                        {/* Error info if failed */}
                        {doc.error_message && (
                          <div className="p-2.5 bg-red-500/10 text-red-300 rounded text-xs border border-red-500/25 flex items-start space-x-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{doc.error_message}</span>
                          </div>
                        )}

                        {/* Footer stats & actions */}
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-line/60">
                          <span className="text-ink-soft">
                            Questions Extracted:{" "}
                            <strong className="text-ink font-semibold">
                              {doc.question_count}
                            </strong>
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => reprocessDocMutation.mutate(doc.id)}
                              disabled={reprocessDocMutation.isPending}
                              title="Re-run parsing & question segmentation pipeline"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs text-ink-soft hover:text-primary hover:bg-primary/10 border border-line rounded-lg font-medium transition"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${reprocessDocMutation.isPending ? "animate-spin" : ""}`} />
                              <span>Re-parse</span>
                            </button>

                            <Link
                              href={`/admin/staging?document_id=${doc.id}`}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs text-primary bg-primary/10 hover:bg-primary/15 border border-primary/30 rounded-lg font-semibold transition"
                            >
                              <span>Review in Staging</span>
                              <ExternalLink className="w-3.5 h-3.5" />
                            </Link>

                            <button
                              onClick={() => {
                                if (confirm(`Permanently delete question paper "${doc.filename}" and its questions?`)) {
                                  deleteDocMutation.mutate(doc.id);
                                }
                              }}
                              disabled={deleteDocMutation.isPending}
                              title="Delete Question Paper"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs text-ink-muted hover:text-red-300 hover:bg-red-500/10 border border-line rounded-lg font-medium transition"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-ink-faint hover:text-red-400" />
                              <span>Delete</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
