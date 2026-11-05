"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  fetchSubjects,
  uploadBulkPapers,
  Subject,
} from "../../../lib/api";
import {
  UploadCloud,
  FileText,
  Trash2,
  AlertCircle,
  CheckCircle2,
  Layers,
  ArrowRight,
  Settings2,
  Sparkles,
  FileCheck,
} from "lucide-react";

interface FileEntry {
  file: File;
  id: string;
  subject_id: string;
  exam_year: string;
  exam_type: "MIDSEM" | "ENDSEM";
}

export default function QuestionPaperUploadPage() {
  const router = useRouter();

  // Tab mode: "single" is primary, "bulk" is secondary
  const [activeTab, setActiveTab] = useState<"single" | "bulk">("single");

  // Single paper state
  const [singleSubjectId, setSingleSubjectId] = useState<string>("");
  const [singleYear, setSingleYear] = useState<string>(new Date().getFullYear().toString());
  const [singleExamType, setSingleExamType] = useState<"MIDSEM" | "ENDSEM">("ENDSEM");
  const [singleFile, setSingleFile] = useState<File | null>(null);
  const [singleOverwrite, setSingleOverwrite] = useState<boolean>(true);

  // Bulk mode state
  const [bulkMode, setBulkMode] = useState<"shared" | "per_file">("shared");
  const [bulkSubjectId, setBulkSubjectId] = useState<string>("");
  const [bulkYear, setBulkYear] = useState<string>(new Date().getFullYear().toString());
  const [bulkExamType, setBulkExamType] = useState<"MIDSEM" | "ENDSEM">("ENDSEM");
  const [bulkEntries, setBulkEntries] = useState<FileEntry[]>([]);

  // Common parser state
  const [parserType, setParserType] = useState<"llamaparse" | "pymupdf">("llamaparse");
  const [uploading, setUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
  });

  // Single file handlers
  const handleSingleFileSelect = (files: FileList | File[]) => {
    const pdfs = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf"
    );
    if (!pdfs.length) {
      setErrorMessage("Please select a valid PDF file.");
      return;
    }
    setSingleFile(pdfs[0]);
    setErrorMessage(null);
  };

  // Bulk files handlers
  const handleBulkFilesAdded = (files: FileList | File[]) => {
    const validPdfs = Array.from(files).filter(
      (f) => f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf"
    );
    if (!validPdfs.length) {
      setErrorMessage("Please select valid PDF files.");
      return;
    }

    const newEntries: FileEntry[] = validPdfs.map((file) => ({
      file,
      id: Math.random().toString(36).substring(2, 9),
      subject_id: bulkSubjectId,
      exam_year: bulkYear,
      exam_type: bulkExamType,
    }));

    setBulkEntries((prev) => [...prev, ...newEntries]);
    setErrorMessage(null);
  };

  // Single paper submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleFile) {
      setErrorMessage("Please choose a question paper PDF to upload.");
      return;
    }
    if (!singleSubjectId) {
      setErrorMessage("Please select the examination subject.");
      return;
    }
    if (!singleYear || isNaN(parseInt(singleYear, 10))) {
      setErrorMessage("Please provide a valid examination year.");
      return;
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      formData.append("files", singleFile);
      formData.append("subject_id", singleSubjectId);
      formData.append("exam_year", singleYear);
      formData.append("exam_type", singleExamType);
      formData.append("parser_type", parserType);
      formData.append("auto_process", "true");
      formData.append("overwrite", singleOverwrite ? "true" : "false");

      const batch = await uploadBulkPapers(formData);
      router.push(`/admin/batches?id=${batch.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Paper upload failed.");
      setUploading(false);
    }
  };

  // Bulk submit
  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkEntries.length) {
      setErrorMessage("Please select at least one PDF file.");
      return;
    }

    if (bulkMode === "shared") {
      if (!bulkSubjectId) {
        setErrorMessage("Please select a subject for the batch.");
        return;
      }
      if (!bulkYear || isNaN(parseInt(bulkYear, 10))) {
        setErrorMessage("Please provide a valid examination year.");
        return;
      }
    } else {
      for (const entry of bulkEntries) {
        if (!entry.subject_id) {
          setErrorMessage(`Please select a subject for file "${entry.file.name}".`);
          return;
        }
        if (!entry.exam_year || isNaN(parseInt(entry.exam_year, 10))) {
          setErrorMessage(`Please enter a valid year for file "${entry.file.name}".`);
          return;
        }
      }
    }

    setUploading(true);
    setErrorMessage(null);

    try {
      const formData = new FormData();
      bulkEntries.forEach((entry) => {
        formData.append("files", entry.file);
      });

      if (bulkMode === "shared") {
        formData.append("subject_id", bulkSubjectId);
        formData.append("exam_year", bulkYear);
        formData.append("exam_type", bulkExamType);
      } else {
        const perFileMeta: Record<string, any> = {};
        bulkEntries.forEach((entry) => {
          perFileMeta[entry.file.name] = {
            subject_id: entry.subject_id,
            exam_year: parseInt(entry.exam_year, 10),
            exam_type: entry.exam_type,
          };
        });
        formData.append("per_file_metadata", JSON.stringify(perFileMeta));
      }

      formData.append("parser_type", parserType);
      formData.append("auto_process", "true");
      formData.append("overwrite", "true");

      const batch = await uploadBulkPapers(formData);
      router.push(`/admin/batches?id=${batch.id}`);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Bulk upload failed.");
      setUploading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Upload Question Paper</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Associate an examination paper with its subject, year, and exam type to extract questions into the Staging Area
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-1">
        <button
          type="button"
          onClick={() => setActiveTab("single")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
            activeTab === "single"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          Single Paper Upload
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("bulk")}
          className={`px-4 py-2 text-xs font-bold rounded-lg transition ${
            activeTab === "bulk"
              ? "bg-blue-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-slate-100"
          }`}
        >
          Batch / Multi-File Ingestion
        </button>
      </div>

      {errorMessage && (
        <div className="flex items-center space-x-2 p-4 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl animate-fadeIn">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* TAB 1: Single Paper Upload Form */}
      {activeTab === "single" && (
        <form onSubmit={handleSingleSubmit} className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-5">
            <h2 className="text-sm font-bold text-slate-800 flex items-center space-x-2 border-b border-slate-100 pb-3">
              <FileCheck className="w-4 h-4 text-blue-600" />
              <span>Examination Paper Details</span>
            </h2>

            {/* Subject Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Subject *
              </label>
              <select
                required
                value={singleSubjectId}
                onChange={(e) => setSingleSubjectId(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
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
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Academic Year *
                </label>
                <input
                  type="number"
                  required
                  min={1990}
                  max={2050}
                  value={singleYear}
                  onChange={(e) => setSingleYear(e.target.value)}
                  placeholder="e.g. 2024"
                  className="w-full h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Examination Type *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSingleExamType("MIDSEM")}
                    className={`h-10 text-xs font-bold rounded-xl border transition ${
                      singleExamType === "MIDSEM"
                        ? "bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Midsem Exam
                  </button>
                  <button
                    type="button"
                    onClick={() => setSingleExamType("ENDSEM")}
                    className={`h-10 text-xs font-bold rounded-xl border transition ${
                      singleExamType === "ENDSEM"
                        ? "bg-blue-50 border-blue-600 text-blue-700 ring-1 ring-blue-600"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    Endsem Exam
                  </button>
                </div>
              </div>
            </div>

            {/* PDF File Picker */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Question Paper PDF File *
              </label>

              {!singleFile ? (
                <div
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files) handleSingleFileSelect(e.dataTransfer.files);
                  }}
                  onClick={() => document.getElementById("single-file-input")?.click()}
                  className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50 hover:bg-blue-50/20 rounded-2xl p-8 text-center transition cursor-pointer space-y-2"
                >
                  <input
                    id="single-file-input"
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) => e.target.files && handleSingleFileSelect(e.target.files)}
                  />
                  <div className="w-12 h-12 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center mx-auto">
                    <UploadCloud className="w-6 h-6" />
                  </div>
                  <p className="text-sm font-bold text-slate-800">
                    Click to select PDF or drag & drop here
                  </p>
                  <p className="text-xs text-slate-400">
                    Scanned or selectable text PDF question paper
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-2xl flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-slate-900 truncate max-w-md">
                        {singleFile.name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {(singleFile.size / (1024 * 1024)).toFixed(2)} MB &bull; Ready for parsing
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSingleFile(null)}
                    className="px-3 py-1.5 text-xs font-semibold text-red-600 hover:text-red-800 bg-white hover:bg-red-50 border border-red-200 rounded-lg transition"
                  >
                    Change File
                  </button>
                </div>
              )}
            </div>

            {/* Overwrite & Parsing Engine Options */}
            <div className="pt-2 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs">
              <label className="flex items-center space-x-2 text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={singleOverwrite}
                  onChange={(e) => setSingleOverwrite(e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                />
                <span className="font-semibold text-slate-800">
                  Overwrite existing paper and re-extract if already uploaded
                </span>
              </label>

              <div className="flex items-center space-x-2">
                <span className="text-slate-400">Engine:</span>
                <select
                  value={parserType}
                  onChange={(e) => setParserType(e.target.value as any)}
                  className="h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 text-xs"
                >
                  <option value="llamaparse">LlamaParse + PyMuPDF</option>
                  <option value="pymupdf">Native PyMuPDF</option>
                </select>
              </div>
            </div>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading || !singleFile || !singleSubjectId}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold shadow-md transition flex items-center space-x-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Uploading & Launching Extraction...</span>
                </>
              ) : (
                <>
                  <span>Upload & Process Question Paper</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 2: Bulk / Multi-File Ingestion */}
      {activeTab === "bulk" && (
        <form onSubmit={handleBulkSubmit} className="space-y-6">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Settings2 className="w-4 h-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-800">Batch Configuration</h2>
              </div>

              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setBulkMode("shared")}
                  className={`px-3 py-1 rounded font-medium transition ${
                    bulkMode === "shared"
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Shared Metadata
                </button>
                <button
                  type="button"
                  onClick={() => setBulkMode("per_file")}
                  className={`px-3 py-1 rounded font-medium transition ${
                    bulkMode === "per_file"
                      ? "bg-white text-blue-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  Per-File Overrides
                </button>
              </div>
            </div>

            {bulkMode === "shared" && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Subject *</label>
                  <select
                    value={bulkSubjectId}
                    onChange={(e) => setBulkSubjectId(e.target.value)}
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium text-slate-800"
                  >
                    <option value="">Select Subject...</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.code ? `[${s.code}] ` : ""}{s.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Year *</label>
                  <input
                    type="number"
                    value={bulkYear}
                    onChange={(e) => setBulkYear(e.target.value)}
                    placeholder="2024"
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Exam Type *</label>
                  <select
                    value={bulkExamType}
                    onChange={(e) => setBulkExamType(e.target.value as any)}
                    className="w-full h-9 px-3 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                  >
                    <option value="MIDSEM">Midsem</option>
                    <option value="ENDSEM">Endsem</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Bulk Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) handleBulkFilesAdded(e.dataTransfer.files);
            }}
            onClick={() => document.getElementById("bulk-file-input")?.click()}
            className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-white hover:bg-blue-50/20 rounded-2xl p-8 text-center transition cursor-pointer space-y-3"
          >
            <input
              id="bulk-file-input"
              type="file"
              multiple
              accept=".pdf,application/pdf"
              className="hidden"
              onChange={(e) => e.target.files && handleBulkFilesAdded(e.target.files)}
            />
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mx-auto shadow-sm">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">
                Drag & drop multiple PDFs here, or click to browse
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Batch ingest historical papers spanning multiple academic years
              </p>
            </div>
          </div>

          {/* Bulk Review Table */}
          {bulkEntries.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="px-6 py-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
                <span className="text-xs font-bold text-slate-700">
                  Selected Files ({bulkEntries.length})
                </span>
                <button
                  type="button"
                  onClick={() => setBulkEntries([])}
                  className="text-xs font-medium text-red-600 hover:underline"
                >
                  Clear All
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px]">
                    <tr>
                      <th className="px-6 py-3">File Name</th>
                      <th className="px-6 py-3">File Size</th>
                      {bulkMode === "per_file" && (
                        <>
                          <th className="px-6 py-3">Subject</th>
                          <th className="px-6 py-3">Year</th>
                          <th className="px-6 py-3">Exam Type</th>
                        </>
                      )}
                      <th className="px-6 py-3 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {bulkEntries.map((entry) => (
                      <tr key={entry.id} className="hover:bg-slate-50 transition">
                        <td className="px-6 py-3 flex items-center space-x-2 font-medium text-slate-800">
                          <FileText className="w-4 h-4 text-blue-500 flex-shrink-0" />
                          <span className="truncate max-w-xs">{entry.file.name}</span>
                        </td>
                        <td className="px-6 py-3 text-slate-500">
                          {(entry.file.size / (1024 * 1024)).toFixed(2)} MB
                        </td>

                        {bulkMode === "per_file" && (
                          <>
                            <td className="px-6 py-3">
                              <select
                                value={entry.subject_id}
                                onChange={(e) => {
                                  const updated = bulkEntries.map((b) =>
                                    b.id === entry.id ? { ...b, subject_id: e.target.value } : b
                                  );
                                  setBulkEntries(updated);
                                }}
                                className="h-8 px-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800"
                              >
                                <option value="">Select Subject</option>
                                {subjects.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.code ? `[${s.code}] ` : ""}{s.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                            <td className="px-6 py-3">
                              <input
                                type="number"
                                value={entry.exam_year}
                                onChange={(e) => {
                                  const updated = bulkEntries.map((b) =>
                                    b.id === entry.id ? { ...b, exam_year: e.target.value } : b
                                  );
                                  setBulkEntries(updated);
                                }}
                                className="w-20 h-8 px-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800"
                              />
                            </td>
                            <td className="px-6 py-3">
                              <select
                                value={entry.exam_type}
                                onChange={(e) => {
                                  const updated = bulkEntries.map((b) =>
                                    b.id === entry.id ? { ...b, exam_type: e.target.value as any } : b
                                  );
                                  setBulkEntries(updated);
                                }}
                                className="h-8 px-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800"
                              >
                                <option value="MIDSEM">Midsem</option>
                                <option value="ENDSEM">Endsem</option>
                              </select>
                            </td>
                          </>
                        )}

                        <td className="px-6 py-3 text-right">
                          <button
                            type="button"
                            onClick={() =>
                              setBulkEntries((prev) => prev.filter((b) => b.id !== entry.id))
                            }
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Bulk Submit Action */}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploading || !bulkEntries.length}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-semibold shadow-sm transition flex items-center space-x-2"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Processing Batch...</span>
                </>
              ) : (
                <>
                  <span>Submit Batch & Start Ingestion</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
