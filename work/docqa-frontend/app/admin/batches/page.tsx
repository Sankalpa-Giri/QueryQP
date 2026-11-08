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
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Batch Processing Monitor</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time pipeline monitoring for document parsing, question segmentation, and indexing
          </p>
        </div>

        <div className="flex items-center gap-2">
          {emptyBatches.length > 0 && (
            <button
              onClick={handleClearEmptyBatches}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-semibold shadow-sm transition"
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
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 shadow-sm transition"
          >
            <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {loadingBatches && batches.length === 0 ? (
        <div className="p-12 text-center text-xs text-slate-400 animate-pulse">
          Loading ingestion batches...
        </div>
      ) : batches.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center space-y-3">
          <Layers className="w-8 h-8 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No batches uploaded yet</h3>
          <p className="text-xs text-slate-500">
            Upload question papers from the Upload page to monitor their extraction.
          </p>
          <Link
            href="/admin/upload"
            className="inline-block mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold"
          >
            Go to Upload
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Batches List Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
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
                        ? "bg-white border-blue-500 shadow-sm ring-1 ring-blue-500/20"
                        : "bg-white border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-slate-800 truncate max-w-[140px]">
                        {b.id.substring(0, 16)}...
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            b.status === "COMPLETED"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : b.status === "PROCESSING"
                              ? "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                              : b.status === "FAILED"
                              ? "bg-red-50 text-red-700 border border-red-200"
                              : "bg-slate-100 text-slate-700"
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
                          className="p-1 text-slate-300 hover:text-red-600 hover:bg-red-50 rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500">
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
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-6">
                {/* Batch Header Bar */}
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="text-xs text-slate-400 font-medium">Batch</span>
                      <span className="font-mono text-xs font-bold text-slate-800">
                        {activeBatchDetail.id}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Created at {new Date(activeBatchDetail.created_at).toLocaleString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2.5 py-1 text-xs font-bold rounded-lg ${
                        activeBatchDetail.status === "COMPLETED"
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                          : activeBatchDetail.status === "PROCESSING"
                          ? "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                          : activeBatchDetail.status === "FAILED"
                          ? "bg-red-50 text-red-700 border border-red-200"
                          : "bg-slate-100 text-slate-700"
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
                      className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 hover:bg-red-100 border border-red-200 rounded-lg transition"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-600" />
                      <span>Delete Batch</span>
                    </button>
                  </div>
                </div>

                {/* Document Cards */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Paper Files ({activeBatchDetail.documents?.length || 0})
                  </h4>

                  {(!activeBatchDetail.documents || activeBatchDetail.documents.length === 0) ? (
                    <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
                      No documents found in this batch.
                    </div>
                  ) : (
                    activeBatchDetail.documents.map((doc: QuestionPaper) => (
                      <div
                        key={doc.id}
                        className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                            <span className="text-xs font-bold text-slate-800 truncate max-w-sm">
                              {doc.filename}
                            </span>
                          </div>

                          <div className="flex items-center space-x-2 text-xs">
                            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-semibold text-slate-700">
                              {doc.subject_code && doc.subject_name
                                ? `${doc.subject_code} - ${doc.subject_name}`
                                : doc.subject_name || doc.subject_code || "Unknown Subject"}
                            </span>
                            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-semibold text-slate-700">
                              {doc.exam_year} {doc.exam_type}
                            </span>
                          </div>
                        </div>

                        {/* Pipeline Stage Indicators */}
                        <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="text-[10px] text-slate-400 uppercase font-medium block">
                              1. Parse
                            </span>
                            <span className={`font-semibold ${
                              doc.parser_status === "COMPLETED" ? "text-emerald-600" :
                              doc.parser_status === "IN_PROGRESS" ? "text-amber-600 animate-pulse" :
                              doc.parser_status === "FAILED" ? "text-red-600" : "text-slate-500"
                            }`}>
                              {doc.parser_status}
                            </span>
                          </div>

                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="text-[10px] text-slate-400 uppercase font-medium block">
                              2. Segment
                            </span>
                            <span className={`font-semibold ${
                              doc.extraction_status === "COMPLETED" ? "text-emerald-600" :
                              doc.extraction_status === "IN_PROGRESS" ? "text-amber-600 animate-pulse" :
                              doc.extraction_status === "FAILED" ? "text-red-600" : "text-slate-500"
                            }`}>
                              {doc.extraction_status}
                            </span>
                          </div>

                          <div className="p-2 bg-white rounded border border-slate-200">
                            <span className="text-[10px] text-slate-400 uppercase font-medium block">
                              3. Index
                            </span>
                            <span className={`font-semibold ${
                              doc.indexing_status === "COMPLETED" ? "text-emerald-600" :
                              doc.indexing_status === "IN_PROGRESS" ? "text-amber-600 animate-pulse" :
                              doc.indexing_status === "FAILED" ? "text-red-600" : "text-slate-500"
                            }`}>
                              {doc.indexing_status}
                            </span>
                          </div>
                        </div>

                        {/* Error info if failed */}
                        {doc.error_message && (
                          <div className="p-2.5 bg-red-50 text-red-700 rounded text-xs border border-red-200 flex items-start space-x-2">
                            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{doc.error_message}</span>
                          </div>
                        )}

                        {/* Footer stats & actions */}
                        <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200/60">
                          <span className="text-slate-600">
                            Questions Extracted:{" "}
                            <strong className="text-slate-900 font-bold">
                              {doc.question_count}
                            </strong>
                          </span>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => reprocessDocMutation.mutate(doc.id)}
                              disabled={reprocessDocMutation.isPending}
                              title="Re-run parsing & question segmentation pipeline"
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs text-slate-600 hover:text-blue-700 hover:bg-blue-50 border border-slate-200 rounded-lg font-medium transition"
                            >
                              <RotateCcw className={`w-3.5 h-3.5 ${reprocessDocMutation.isPending ? "animate-spin" : ""}`} />
                              <span>Re-parse</span>
                            </button>

                            <Link
                              href={`/admin/staging?document_id=${doc.id}`}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg font-semibold transition"
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
                              className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs text-slate-500 hover:text-red-700 hover:bg-red-50 border border-slate-200 rounded-lg font-medium transition"
                            >
                              <Trash2 className="w-3.5 h-3.5 text-slate-400 hover:text-red-600" />
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
