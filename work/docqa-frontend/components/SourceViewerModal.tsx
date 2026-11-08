"use client";

import React, { useEffect, useState } from "react";
import { API_BASE, fetchQuestionSource, QuestionSourceContext } from "../lib/api";
import {
  X,
  ExternalLink,
  FileText,
  CheckCircle2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Download,
  Image as ImageIcon,
} from "lucide-react";

interface SourceViewerModalProps {
  questionId: string | null;
  onClose: () => void;
}

export function SourceViewerModal({ questionId, onClose }: SourceViewerModalProps) {
  const [sourceData, setSourceData] = useState<QuestionSourceContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Viewer state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [zoomScale, setZoomScale] = useState<number>(1);
  const [highDpi, setHighDpi] = useState<boolean>(false);
  const [imageLoading, setImageLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!questionId) {
      setSourceData(null);
      return;
    }
    setLoading(true);
    setError(null);
    setZoomScale(1);
    fetchQuestionSource(questionId)
      .then((data) => {
        setSourceData(data);
        setCurrentPage(data.page_number || 1);
      })
      .catch((err) => setError(err.message || "Failed to load source provenance"))
      .finally(() => setLoading(false));
  }, [questionId]);

  if (!questionId) return null;

  const totalPages = sourceData?.total_pages || (sourceData?.page_end && sourceData.page_end > 0 ? sourceData.page_end : 1);
  const dpiValue = highDpi ? 300 : 150;
  const currentImageUrl = sourceData
    ? `${API_BASE}/api/v1/documents/${sourceData.document_id}/pages/${currentPage}/image?dpi=${dpiValue}`
    : "";

  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.25, 2.5));
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.25, 0.5));
  const handleZoomReset = () => setZoomScale(1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-surface rounded-2xl shadow-2xl overflow-hidden border border-line">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-line-soft bg-ground flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-primary text-ground rounded-xl">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-semibold text-ink">
                  Exam Diagram & Source Provenance Viewer
                </h3>
                {sourceData && (
                  <span className="px-2 py-0.5 bg-raised text-ink-soft font-semibold text-xs rounded-md">
                    {sourceData.question_number}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-ink-muted">
                Inspect authentic diagrams, circuits, and full exam questions directly from the original paper
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-faint hover:text-ink-soft rounded-lg hover:bg-line-strong/70 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="w-8 h-8 border-3 border-primary border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-ink-muted">Locating original exam paper and rendering diagram...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-500/10 text-red-300 rounded-xl text-xs sm:text-sm border border-red-500/25">
              {error}
            </div>
          )}

          {sourceData && (
            <div className="space-y-4">
              {/* Paper Provenance Metadata Badges */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 bg-ground p-3.5 rounded-xl border border-line text-xs">
                <div>
                  <span className="text-[10px] text-ink-faint font-semibold">Subject</span>
                  <p className="font-semibold text-ink truncate">{sourceData.subject_name}</p>
                </div>
                <div>
                  <span className="text-[10px] text-ink-faint font-semibold">Academic Year</span>
                  <p className="font-semibold text-ink">{sourceData.exam_year}</p>
                </div>
                <div>
                  <span className="text-[10px] text-ink-faint font-semibold">Exam Type</span>
                  <p className="font-semibold text-primary">{sourceData.exam_type}</p>
                </div>
                <div>
                  <span className="text-[10px] text-ink-faint font-semibold">Question Location</span>
                  <p className="font-semibold text-ink">
                    Page {sourceData.page_number}
                    {sourceData.page_end > sourceData.page_number && ` - ${sourceData.page_end}`}
                  </p>
                </div>
              </div>

              {/* Action Toolbar: Page Navigation, Zoom, and Full PDF Link */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-raised rounded-xl border border-line">
                {/* Page Navigation */}
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage <= 1}
                    className="p-1.5 bg-surface border border-line-strong rounded-lg text-ink-soft hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-ink-soft px-2">
                    Page <strong className="text-primary">{currentPage}</strong> of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 bg-surface border border-line-strong rounded-lg text-ink-soft hover:bg-raised disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Zoom & DPI Controls */}
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 bg-surface p-0.5 rounded-lg border border-line-strong">
                    <button
                      onClick={handleZoomOut}
                      className="p-1 text-ink-soft hover:text-ink rounded hover:bg-lift transition"
                      title="Zoom Out (-25%)"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-mono text-ink-soft px-1.5 min-w-[3rem] text-center">
                      {Math.round(zoomScale * 100)}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      className="p-1 text-ink-soft hover:text-ink rounded hover:bg-lift transition"
                      title="Zoom In (+25%)"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleZoomReset}
                      className="p-1 text-ink-faint hover:text-ink-soft rounded hover:bg-lift transition"
                      title="Reset Zoom"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* High-DPI Toggle for fine diagram inspection */}
                  <button
                    onClick={() => setHighDpi(!highDpi)}
                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg text-xs font-semibold border transition ${
                      highDpi
                        ? "bg-primary text-ground border-primary"
                        : "bg-surface text-ink-soft border-line-strong hover:bg-raised"
                    }`}
                    title="Toggle ultra high-resolution rendering for fine diagram line work"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>{highDpi ? "300 DPI (HD)" : "150 DPI"}</span>
                  </button>
                </div>

                {/* Open Full PDF Button */}
                <div className="flex items-center space-x-2">
                  <a
                    href={`${API_BASE}${sourceData.file_url}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center space-x-1.5 px-3 py-1 bg-surface hover:bg-primary/10 text-primary border border-primary/30 rounded-lg text-xs font-semibold transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Open PDF</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Rendered Page Image with Pan / Zoom Canvas */}
              <div className="relative border border-line-strong rounded-xl overflow-auto bg-black/5 max-h-[550px] min-h-[350px] flex items-start justify-center p-4">
                {imageLoading && (
                  <div className="absolute inset-0 bg-surface/70 flex items-center justify-center z-10 backdrop-blur-xs">
                    <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: "top center",
                    transition: "transform 0.15s ease-out",
                  }}
                  className="inline-block shadow-lg rounded bg-surface overflow-hidden"
                >
                  <img
                    key={currentImageUrl}
                    src={currentImageUrl}
                    alt={`Exam Paper Page ${currentPage}`}
                    onLoad={() => setImageLoading(false)}
                    onLoadStart={() => setImageLoading(true)}
                    className="max-w-none w-auto h-auto block select-none"
                    onError={(e) => {
                      setImageLoading(false);
                      (e.target as HTMLElement).style.display = "none";
                    }}
                  />
                </div>
              </div>

              {/* Footer Provenance Note */}
              <div className="flex flex-wrap items-center justify-between text-[11px] text-ink-muted pt-1">
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>
                    Rendered directly from official question paper:{" "}
                    <strong className="text-ink-soft">{sourceData.filename}</strong>
                  </span>
                </div>
                {sourceData.bbox && (
                  <span className="font-mono text-[10px] text-ink-faint">
                    BBox: [{sourceData.bbox.map((n) => Math.round(n)).join(", ")}]
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-line-soft bg-ground flex items-center justify-between flex-shrink-0">
          <p className="text-[11px] text-ink-muted">
            Tip: Use zoom controls above or open full PDF to inspect small diagram labels & formulas.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-ink-soft bg-surface border border-line-strong rounded-lg hover:bg-lift transition"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
