"use client";

import React from "react";
import { SlideItem, getSlideFileUrl, getSlideDownloadUrl } from "../lib/api";
import {
  X,
  Download,
  ExternalLink,
  Presentation,
  User,
  BookOpen,
  Calendar,
  Layers,
  FileCode,
} from "lucide-react";

interface SlideViewerModalProps {
  slide: SlideItem | null;
  onClose: () => void;
}

export function SlideViewerModal({ slide, onClose }: SlideViewerModalProps) {
  if (!slide) return null;

  const fileUrl = getSlideFileUrl(slide.id);
  const downloadUrl = getSlideDownloadUrl(slide.id);
  const isPdf = slide.file_type.toLowerCase() === "pdf";

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "Unknown size";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative flex flex-col w-full max-w-7xl h-[94vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {/* Header - Space Efficient Dense Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 shrink-0">
              <Presentation className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-slate-900 dark:text-slate-100 truncate text-base">
                  {slide.title}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 shrink-0">
                  {slide.topic_name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full uppercase font-mono font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 shrink-0">
                  {slide.file_type}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                <span className="flex items-center gap-1 font-medium text-slate-700 dark:text-slate-300">
                  <User className="w-3.5 h-3.5 text-indigo-500" />
                  {slide.professor_name}
                  {slide.professor_title && ` (${slide.professor_title})`}
                </span>
                {slide.subject_name && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-500" />
                    {slide.subject_name}
                  </span>
                )}
                {slide.semester && (
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-purple-500" />
                    {slide.semester}
                  </span>
                )}
                {slide.academic_year && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-500" />
                    {slide.academic_year}
                  </span>
                )}
                <span>{formatFileSize(slide.file_size_bytes)}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {/* Download Button */}
            <a
              href={downloadUrl}
              download
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-indigo-500"
              title="Download presentation"
            >
              <Download className="w-4 h-4" />
              <span>Download</span>
            </a>

            {/* Open in New Window */}
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Open full page in new tab"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">New Tab</span>
            </a>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              title="Close viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="relative flex-1 w-full bg-slate-100 dark:bg-slate-950 overflow-hidden">
          {isPdf ? (
            <iframe
              src={`${fileUrl}#toolbar=1&navpanes=1`}
              className="w-full h-full border-0"
              title={slide.title}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center max-w-lg mx-auto">
              <div className="p-4 rounded-2xl bg-amber-100 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 mb-4">
                <FileCode className="w-12 h-12" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {slide.title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 mb-6">
                This is a <span className="font-semibold uppercase">{slide.file_type}</span> slide presentation. Browsers natively preview PDF files directly. For PowerPoint slides, please download the file to view with PowerPoint, Keynote, or Google Slides.
              </p>
              <a
                href={downloadUrl}
                download
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-medium shadow-md transition transform hover:scale-[1.02]"
              >
                <Download className="w-5 h-5" />
                Download Presentation ({formatFileSize(slide.file_size_bytes)})
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
