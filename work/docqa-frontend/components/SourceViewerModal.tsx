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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/65 p-3 sm:p-4 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative flex flex-col w-full max-w-5xl max-h-[92vh] bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-100 bg-slate-50 flex-shrink-0">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-600 text-white rounded-xl shadow-xs">
              <ImageIcon className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="text-sm sm:text-base font-bold text-slate-900">
                  Exam Diagram & Source Provenance Viewer
                </h3>
                {sourceData && (
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 font-extrabold text-xs rounded-md">
                    {sourceData.question_number}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500">
                Inspect authentic diagrams, circuits, and full exam questions directly from the original paper
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/70 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 space-y-3">
              <div className="w-8 h-8 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-slate-500">Locating original exam paper and rendering diagram...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-xl text-xs sm:text-sm border border-red-200">
              {error}
            </div>
          )}

          {sourceData && (
            <div className="space-y-4">
              {/* Paper Provenance Metadata Badges */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Subject</span>
                  <p className="font-bold text-slate-800 truncate">{sourceData.subject_name}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Academic Year</span>
                  <p className="font-bold text-slate-800">{sourceData.exam_year}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Exam Type</span>
                  <p className="font-bold text-purple-700">{sourceData.exam_type}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Question Location</span>
                  <p className="font-bold text-slate-800">
                    Page {sourceData.page_number}
                    {sourceData.page_end > sourceData.page_number && ` - ${sourceData.page_end}`}
                  </p>
                </div>
              </div>

              {/* Action Toolbar: Page Navigation, Zoom, and Full PDF Link */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 bg-slate-100 rounded-xl border border-slate-200">
                {/* Page Navigation */}
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
                    disabled={currentPage <= 1}
                    className="p-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="Previous Page"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-700 px-2">
                    Page <strong className="text-blue-700">{currentPage}</strong> of {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(p + 1, totalPages))}
                    disabled={currentPage >= totalPages}
                    className="p-1.5 bg-white border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed transition"
                    title="Next Page"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Zoom & DPI Controls */}
                <div className="flex items-center space-x-2">
                  <div className="flex items-center space-x-1 bg-white p-0.5 rounded-lg border border-slate-300">
                    <button
                      onClick={handleZoomOut}
                      className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100 transition"
                      title="Zoom Out (-25%)"
                    >
                      <ZoomOut className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-[11px] font-mono text-slate-700 px-1.5 min-w-[3rem] text-center">
                      {Math.round(zoomScale * 100)}%
                    </span>
                    <button
                      onClick={handleZoomIn}
                      className="p-1 text-slate-600 hover:text-slate-900 rounded hover:bg-slate-100 transition"
                      title="Zoom In (+25%)"
                    >
                      <ZoomIn className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={handleZoomReset}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded hover:bg-slate-100 transition"
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
                        ? "bg-blue-600 text-white border-blue-600 shadow-xs"
                        : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
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
                    className="inline-flex items-center space-x-1.5 px-3 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold shadow-xs transition"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Open PDF</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Rendered Page Image with Pan / Zoom Canvas */}
              <div className="relative border border-slate-300 rounded-xl overflow-auto bg-slate-900/5 max-h-[550px] min-h-[350px] flex items-start justify-center p-4">
                {imageLoading && (
                  <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-10 backdrop-blur-xs">
                    <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <div
                  style={{
                    transform: `scale(${zoomScale})`,
                    transformOrigin: "top center",
                    transition: "transform 0.15s ease-out",
                  }}
                  className="inline-block shadow-lg rounded bg-white overflow-hidden"
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
              <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-500 pt-1">
                <div className="flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    Rendered directly from official question paper:{" "}
                    <strong className="text-slate-700">{sourceData.filename}</strong>
                  </span>
                </div>
                {sourceData.bbox && (
                  <span className="font-mono text-[10px] text-slate-400">
                    BBox: [{sourceData.bbox.map((n) => Math.round(n)).join(", ")}]
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between flex-shrink-0">
          <p className="text-[11px] text-slate-500">
            Tip: Use zoom controls above or open full PDF to inspect small diagram labels & formulas.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100 transition shadow-xs"
          >
            Close Viewer
          </button>
        </div>
      </div>
    </div>
  );
}
