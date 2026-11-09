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
      <div className="relative flex flex-col w-full max-w-7xl h-[94vh] bg-surface rounded-2xl shadow-2xl border border-line overflow-hidden">
        {/* Header - Space Efficient Dense Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-ground/80 backdrop-blur">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 rounded-xl bg-raised text-ink-soft shrink-0">
              <Presentation className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-ink truncate text-base">
                  {slide.title}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-raised text-ink-soft border border-line-strong shrink-0">
                  {slide.topic_name}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full font-mono font-semibold bg-lift text-ink-soft shrink-0">
                  {slide.file_type}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-ink-muted mt-0.5 truncate">
                <span className="flex items-center gap-1 font-medium text-ink-soft">
                  <User className="w-3.5 h-3.5 text-primary" />
                  {slide.professor_name}
                  {slide.professor_title && ` (${slide.professor_title})`}
                </span>
                {slide.subject_name && (
                  <span className="flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-emerald-400" />
                    {slide.subject_name}
                  </span>
                )}
                {slide.semester && (
                  <span className="flex items-center gap-1">
                    <Layers className="w-3.5 h-3.5 text-primary" />
                    {slide.semester}
                  </span>
                )}
                {slide.academic_year && (
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5 text-amber-400" />
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
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg bg-primary hover:bg-primary-hover text-ground transition-all focus:outline-none focus:ring-2 focus:ring-primary"
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
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs sm:text-sm font-medium rounded-lg border border-line-strong text-ink-soft hover:bg-lift transition"
              title="Open full page in new tab"
            >
              <ExternalLink className="w-4 h-4" />
              <span className="hidden sm:inline">New Tab</span>
            </a>

            {/* Close button */}
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-ink-faint hover:text-ink-soft hover:bg-lift transition"
              title="Close viewer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="relative flex-1 w-full bg-raised overflow-hidden">
          {isPdf ? (
            <iframe
              src={`${fileUrl}#toolbar=1&navpanes=1`}
              className="w-full h-full border-0"
              title={slide.title}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center max-w-lg mx-auto">
              <div className="p-4 rounded-2xl bg-amber-500/15 text-amber-400 mb-4">
                <FileCode className="w-12 h-12" />
              </div>
              <h3 className="text-lg font-semibold text-ink">
                {slide.title}
              </h3>
              <p className="text-sm text-ink-muted mt-2 mb-6">
                This is a <span className="font-semibold">{slide.file_type}</span> slide presentation. Browsers natively preview PDF files directly. For PowerPoint slides, please download the file to view with PowerPoint, Keynote, or Google Slides.
              </p>
              <a
                href={downloadUrl}
                download
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary-hover text-ground font-medium transition transform hover:scale-[1.02]"
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
