"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  fetchSubjects,
  uploadBulkPapers,
  Subject,
  getAdminUser,
} from "../../../lib/api";
import Link from "next/link";
import {
  UploadCloud,
  FileText,
  AlertCircle,
  ArrowRight,
  FileCheck,
  Cpu,
  Sparkles,
} from "lucide-react";

export default function QuestionPaperUploadPage() {
  const router = useRouter();

  // Single paper state
  const [subjectId, setSubjectId] = useState<string>("");
  const [examYear, setExamYear] = useState<string>(new Date().getFullYear().toString());
  const [examType, setExamType] = useState<"MIDSEM" | "ENDSEM">("ENDSEM");
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState<boolean>(true);

  // Parser engine: Default to native PyMuPDF for reliable local processing & OCR
  const [parserType, setParserType] = useState<"pymupdf" | "llamaparse">("pymupdf");
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentUser = getAdminUser();
  const isReviewer = currentUser?.role?.toLowerCase() === "reviewer";

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
  });

  if (isReviewer) {
    return (
      <div className="max-w-xl mx-auto my-16 bg-surface p-8 rounded-2xl border border-amber-500/25 text-center space-y-4">
        <div className="w-14 h-14 bg-amber-500/10 text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-semibold text-ink">Reviewer Restricted Page</h2>
        <p className="text-xs text-ink-soft leading-relaxed max-w-md mx-auto">
          Question paper uploading and batch ingestion is restricted to <strong>Administrator</strong> and <strong>Superadmin</strong> roles.
          As a <strong>Reviewer</strong>, your primary workflow is verifying, formatting with AI, and approving extracted questions in the Staging Area.
        </p>
        <div className="pt-2">
          <Link
            href="/admin/staging"
            className="inline-flex items-center space-x-2 px-4 py-2 bg-primary hover:bg-primary-hover text-ground text-xs font-semibold rounded-xl transition"
          >
            <span>Proceed to Staging Area</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    );
  }

  // File handler
  const handleFileSelect = (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf"
    );
    if (!pdfs.length) {
      setErrorMessage("Please select a valid PDF question paper file.");
      return;
    }
    setFile(pdfs[0]);
    setErrorMessage(null);
  };

  // Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setErrorMessage("Please choose a question paper PDF to upload.");
      return;
    }
    if (!subjectId) {
      setErrorMessage("Please select the examination subject.");
      return;
    }
    if (!examYear || isNaN(parseInt(examYear, 10))) {
      setErrorMessage("Please provide a valid examination year.");
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("files", file);
      formData.append("subject_id", subjectId);
      formData.append("exam_year", examYear);
      formData.append("exam_type", examType);
      formData.append("parser_type", parserType);
      formData.append("auto_process", "true");
      formData.append("overwrite", overwrite ? "true" : "false");

      const batch = await uploadBulkPapers(formData);
      router.push(`/admin/batches?id=${batch.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Paper upload failed.");
      setUploading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-semibold text-ink tracking-tight">Upload Question Paper</h1>
        <p className="text-xs text-ink-muted mt-0.5">
          Upload an examination paper PDF to automatically extract questions into the Staging Area
        </p>
      </div>

      {errorMessage && (
        <div className="flex items-center space-x-2 p-4 bg-red-500/10 border border-red-500/25 text-red-300 text-xs rounded-xl animate-fadeIn">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Upload Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Automated AI Extraction Pipeline Banner */}
        <div className="p-4 bg-raised border border-line-strong rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-primary text-ground flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <span className="font-semibold text-ink block text-xs">
                Vision & Multimodal AI Structured Extraction Active
              </span>
              <span className="text-[11px] text-ink-muted">
                Automatically extracts questions bit-wise (e.g. 7a, 7b), standardizes LaTeX math, and auto-tags syllabus topics into Staging.
              </span>
            </div>
          </div>
          <span className="px-3 py-1 bg-surface border border-line-strong text-primary font-semibold rounded-xl text-xs shadow-2xs shrink-0 flex items-center gap-1.5 self-start sm:self-auto">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            AI Enabled
          </span>
        </div>

        <div className="bg-surface p-6 rounded-2xl border border-line space-y-5">
          <h2 className="text-sm font-semibold text-ink flex items-center space-x-2 border-b border-line-soft pb-3">
            <FileCheck className="w-4 h-4 text-primary" />
            <span>Examination Paper Details</span>
          </h2>

          {/* Subject Selector */}
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">
              Subject *
            </label>
            <select
              required
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full h-10 px-3 bg-ground border border-line rounded-xl text-xs font-semibold text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            >
              <option value="">Select Examination Subject...</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Year & Exam Type Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                Academic Year *
              </label>
              <input
                type="number"
                required
                min={1990}
                max={2050}
                value={examYear}
                onChange={(e) => setExamYear(e.target.value)}
                placeholder="e.g. 2024"
                className="w-full h-10 px-3 bg-ground border border-line rounded-xl text-xs font-semibold text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                Examination Type *
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setExamType("MIDSEM")}
                  className={`h-10 text-xs font-semibold rounded-xl border transition ${
                    examType === "MIDSEM"
                      ? "bg-primary/10 border-primary text-primary ring-1 ring-primary"
                      : "bg-ground border-line text-ink-soft hover:bg-lift"
                  }`}
                >
                  Midsem Exam
                </button>
                <button
                  type="button"
                  onClick={() => setExamType("ENDSEM")}
                  className={`h-10 text-xs font-semibold rounded-xl border transition ${
                    examType === "ENDSEM"
                      ? "bg-primary/10 border-primary text-primary ring-1 ring-primary"
                      : "bg-ground border-line text-ink-soft hover:bg-lift"
                  }`}
                >
                  Endsem Exam
                </button>
              </div>
            </div>
          </div>

          {/* PDF File Picker */}
          <div>
            <label className="block text-xs font-semibold text-ink-soft mb-1.5">
              Question Paper PDF File *
            </label>

            {!file ? (
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (e.dataTransfer.files) handleFileSelect(e.dataTransfer.files);
                }}
                onClick={() => document.getElementById("paper-file-input")?.click()}
                className="border-2 border-dashed border-line-strong hover:border-primary bg-ground hover:bg-primary/10 rounded-2xl p-8 text-center transition cursor-pointer space-y-2"
              >
                <input
                  id="paper-file-input"
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
                />
                <div className="w-12 h-12 bg-raised text-ink-soft rounded-xl flex items-center justify-center mx-auto">
                  <UploadCloud className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-ink">
                  Click to select PDF or drag & drop here
                </p>
                <p className="text-xs text-ink-faint">
                  Scanned or selectable text PDF examination paper (up to 25 MB)
                </p>
              </div>
            ) : (
              <div className="p-4 bg-raised border border-line-strong rounded-2xl flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary text-ground rounded-xl flex items-center justify-center flex-shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink truncate max-w-md">
                      {file.name}
                    </p>
                    <p className="text-[11px] text-ink-muted">
                      {(file.size / (1024 * 1024)).toFixed(2)} MB &bull; Ready for parsing & extraction
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="px-3 py-1.5 text-xs font-semibold text-red-400 hover:text-red-300 bg-surface hover:bg-red-500/10 border border-red-500/25 rounded-lg transition"
                >
                  Change File
                </button>
              </div>
            )}
          </div>

          {/* Overwrite & Parsing Engine Options */}
          <div className="pt-3 border-t border-line-soft flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
            <label className="flex items-center space-x-2 text-ink-soft cursor-pointer">
              <input
                type="checkbox"
                checked={overwrite}
                onChange={(e) => setOverwrite(e.target.checked)}
                className="rounded border-line-strong text-primary focus:ring-primary w-4 h-4"
              />
              <span className="font-semibold text-ink">
                Overwrite existing paper and re-extract if already uploaded
              </span>
            </label>

            <div className="flex items-center space-x-2">
              <span className="text-ink-muted font-medium flex items-center gap-1">
                <Cpu className="w-3.5 h-3.5" /> Engine:
              </span>
              <select
                value={parserType}
                onChange={(e) => setParserType(e.target.value as any)}
                className="h-8 px-2.5 bg-ground border border-line rounded-lg text-ink-soft text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="pymupdf">AI Extraction + Native PyMuPDF OCR (Recommended)</option>
                <option value="llamaparse">AI Extraction + LlamaParse Cloud</option>
              </select>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={uploading || !file || !subjectId}
            className="px-6 py-3 bg-primary hover:bg-primary-hover disabled:bg-ink-dim text-ground rounded-xl text-xs font-semibold transition flex items-center space-x-2"
          >
            {uploading ? (
              <>
                <div className="w-4 h-4 border-2 border-ground border-t-transparent rounded-full animate-spin" />
                <span>Uploading & Launching AI Extraction Pipeline...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Upload & Run AI Extraction Pipeline</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
