"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminSlides,
  uploadSlideAdmin,
  updateSlideAdmin,
  deleteSlideAdmin,
  fetchAdminSubjects,
  SlideItem,
  Subject,
  getSlideDownloadUrl,
  getAdminUser,
} from "../../../lib/api";
import { SlideViewerModal } from "../../../components/SlideViewerModal";
import {
  Presentation,
  Plus,
  Edit,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Download,
  Eye,
  Search,
  BookOpen,
  User,
  Calendar,
  Layers,
  UploadCloud,
  FileCode,
} from "lucide-react";

export default function AdminSlidesPage() {
  const queryClient = useQueryClient();

  // Filters
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState<string>("");

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [editingSlide, setEditingSlide] = useState<SlideItem | null>(null);
  const [previewSlide, setPreviewSlide] = useState<SlideItem | null>(null);

  const currentUser = getAdminUser();
  const isReviewer = currentUser?.role?.toLowerCase() === "reviewer";

  // Form state
  const [formSubjectId, setFormSubjectId] = useState("");
  const [formProfessorName, setFormProfessorName] = useState("");
  const [formProfessorTitle, setFormProfessorTitle] = useState("");
  const [formTopicName, setFormTopicName] = useState("");
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formSemester, setFormSemester] = useState("");
  const [formAcademicYear, setFormAcademicYear] = useState<string>("2026");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Status feedback
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Fetch subjects for dropdowns
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["admin-subjects"],
    queryFn: fetchAdminSubjects,
  });

  // Fetch slides list
  const {
    data: slidesData,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["admin-slides", selectedSubjectId, searchQuery],
    queryFn: () =>
      fetchAdminSlides({
        subject_id: selectedSubjectId || undefined,
        search: searchQuery || undefined,
        limit: 100,
      }),
  });

  const slides = Array.isArray(slidesData) ? slidesData : (slidesData?.items || []);

  const resetForm = () => {
    setFormSubjectId("");
    setFormProfessorName("");
    setFormProfessorTitle("");
    setFormTopicName("");
    setFormTitle("");
    setFormDescription("");
    setFormSemester("");
    setFormAcademicYear("2026");
    setSelectedFile(null);
    setEditingSlide(null);
  };

  const handleOpenUpload = () => {
    resetForm();
    if (subjects.length > 0) {
      setFormSubjectId(subjects[0].id);
    }
    setIsUploadOpen(true);
  };

  const handleOpenEdit = (slide: SlideItem) => {
    resetForm();
    setEditingSlide(slide);
    setFormSubjectId(slide.subject_id || (subjects[0]?.id ?? ""));
    setFormProfessorName(slide.professor_name);
    setFormProfessorTitle(slide.professor_title || "");
    setFormTopicName(slide.topic_name);
    setFormTitle(slide.title);
    setFormDescription(slide.description || "");
    setFormSemester(slide.semester || "");
    setFormAcademicYear(slide.academic_year ? String(slide.academic_year) : "");
    setIsUploadOpen(true);
  };

  // Upload or update mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingSlide) {
        return updateSlideAdmin(editingSlide.id, {
          subject_id: formSubjectId || undefined,
          professor_name: formProfessorName.trim(),
          professor_title: formProfessorTitle.trim() || undefined,
          topic_name: formTopicName.trim(),
          title: formTitle.trim(),
          description: formDescription.trim() || undefined,
          semester: formSemester.trim() || undefined,
          academic_year: formAcademicYear.trim() || undefined,
        });
      } else {
        if (!selectedFile) {
          throw new Error("Please select a presentation slide file (PDF, PPT, or PPTX).");
        }
        if (!formProfessorName.trim()) {
          throw new Error("Professor name is required.");
        }
        if (!formTopicName.trim()) {
          throw new Error("Topic name is required.");
        }
        if (!formTitle.trim()) {
          throw new Error("Slide title is required.");
        }

        const formData = new FormData();
        formData.append("file", selectedFile);
        const effectiveSubjId = formSubjectId || (subjects.length > 0 ? subjects[0].id : "");
        if (effectiveSubjId) formData.append("subject_id", effectiveSubjId);
        formData.append("professor_name", formProfessorName.trim());
        if (formProfessorTitle.trim()) formData.append("professor_title", formProfessorTitle.trim());
        formData.append("topic_name", formTopicName.trim());
        formData.append("title", formTitle.trim());
        if (formDescription.trim()) formData.append("description", formDescription.trim());
        if (formSemester.trim()) formData.append("semester", formSemester.trim());
        if (formAcademicYear.trim()) formData.append("academic_year", formAcademicYear.trim());

        return uploadSlideAdmin(formData);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-slides"] });
      queryClient.invalidateQueries({ queryKey: ["professor-slides"] });
      setSuccessMessage(editingSlide ? "Slide updated successfully!" : "Slide presentation uploaded successfully!");
      setIsUploadOpen(false);
      resetForm();
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to save slide.");
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (slideId: string) => {
      return deleteSlideAdmin(slideId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-slides"] });
      queryClient.invalidateQueries({ queryKey: ["professor-slides"] });
      setSuccessMessage("Slide deleted successfully.");
    },
    onError: (err: any) => {
      setErrorMessage(err.message || "Failed to delete slide.");
    },
  });

  const handleDelete = (slide: SlideItem) => {
    if (confirm(`Are you sure you want to delete slide "${slide.title}" by ${slide.professor_name}? This cannot be undone.`)) {
      deleteMutation.mutate(slide.id);
    }
  };

  const formatFileSize = (bytes?: number | null) => {
    if (!bytes) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink flex items-center gap-2.5">
            <Presentation className="w-7 h-7 text-primary" />
            Professor Lecture Slides Management
          </h1>
          <p className="text-sm text-ink-muted mt-1">
            Upload, categorize by topic, and manage university lecture presentations and study slides.
          </p>
        </div>
        {!isReviewer ? (
          <button
            onClick={handleOpenUpload}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-primary hover:bg-primary-hover text-ground text-sm font-semibold rounded-xl transition"
          >
            <Plus className="w-4 h-4" />
            <span>Upload New Slides</span>
          </button>
        ) : (
          <div className="px-3.5 py-2 rounded-xl bg-raised border border-line-strong text-ink-soft text-xs font-medium">
            Reviewer Mode: View-Only Slides
          </div>
        )}
      </div>

      {/* Messages */}
      {successMessage && (
        <div className="flex items-center justify-between p-4 bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 rounded-xl text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-emerald-400 hover:text-emerald-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center justify-between p-4 bg-rose-500/10 border border-rose-500/25 text-rose-300 rounded-xl text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-rose-400 hover:text-rose-300">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-surface p-4 rounded-xl border border-line flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
          {/* Subject Filter */}
          <div className="w-full sm:w-64">
            <select
              value={selectedSubjectId}
              onChange={(e) => setSelectedSubjectId(e.target.value)}
              className="w-full h-10 px-3 bg-ground border border-line rounded-lg text-sm text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ` : ""}
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Search Query */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-ink-faint absolute left-3 top-3 pointer-events-none" />
            <input
              type="text"
              placeholder="Search by professor, topic, or slide title..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-10 pl-9 pr-4 bg-ground border border-line rounded-lg text-sm text-ink placeholder-ink-faint focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
            />
          </div>
        </div>

        <div className="text-xs text-ink-muted font-medium">
          Total Slides: <strong className="text-ink">{slides.length}</strong>
        </div>
      </div>

      {/* Slides Table */}
      <div className="bg-surface rounded-xl border border-line overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-sm text-ink-muted flex flex-col items-center justify-center gap-2">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <span>Loading lecture slides...</span>
          </div>
        ) : slides.length === 0 ? (
          <div className="p-12 text-center text-sm text-ink-muted space-y-3">
            <Presentation className="w-12 h-12 text-ink-dim mx-auto" />
            <p className="font-semibold text-ink-soft">No slides found matching your filters.</p>
            <p className="text-xs text-ink-faint">Click &ldquo;Upload New Slides&rdquo; above to add university lecture slides.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-ink-soft">
              <thead className="bg-ground text-xs font-semibold text-ink-soft border-b border-line">
                <tr>
                  <th className="px-4 py-3">Slide Presentation</th>
                  <th className="px-4 py-3">Topic</th>
                  <th className="px-4 py-3">Professor</th>
                  <th className="px-4 py-3">Subject</th>
                  <th className="px-4 py-3">Term & Year</th>
                  <th className="px-4 py-3 text-center">Downloads</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {slides.map((s) => (
                  <tr key={s.id} className="hover:bg-raised/80 transition">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="p-2 rounded-lg bg-raised text-ink-soft shrink-0">
                          <Presentation className="w-4 h-4" />
                        </div>
                        <div className="min-w-0 max-w-xs">
                          <div className="font-semibold text-ink truncate" title={s.title}>
                            {s.title}
                          </div>
                          <div className="flex items-center gap-1.5 text-xs text-ink-faint mt-0.5">
                            <span className="font-mono font-medium text-[10px] px-1.5 py-0.2 rounded bg-raised text-ink-soft border border-line">
                              {s.file_type}
                            </span>
                            <span>{formatFileSize(s.file_size_bytes)}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="inline-block px-2.5 py-1 text-xs font-medium rounded-full bg-raised text-ink-soft border border-line-strong max-w-[180px] truncate">
                        {s.topic_name}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="text-ink font-medium">{s.professor_name}</div>
                      {s.professor_title && (
                        <div className="text-xs text-ink-faint truncate max-w-[160px]">{s.professor_title}</div>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs">
                      {s.subject_name ? (
                        <span className="text-ink font-medium">{s.subject_name}</span>
                      ) : (
                        <span className="text-ink-faint italic">General</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-ink-soft whitespace-nowrap">
                      {s.semester || "Semester —"}
                      {s.academic_year && ` • ${s.academic_year}`}
                    </td>
                    <td className="px-4 py-3.5 text-center text-xs font-semibold text-ink-soft">
                      {s.download_count}
                    </td>
                    <td className="px-4 py-3.5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => setPreviewSlide(s)}
                          className="p-1.5 rounded-lg text-ink-muted hover:text-primary hover:bg-primary/10 transition"
                          title="View PDF / Slides"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <a
                          href={getSlideDownloadUrl(s.id)}
                          download
                          className="p-1.5 rounded-lg text-ink-muted hover:text-primary hover:bg-primary/10 transition"
                          title="Download Presentation"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        {!isReviewer && (
                          <>
                            <button
                              onClick={() => handleOpenEdit(s)}
                              className="p-1.5 rounded-lg text-ink-muted hover:text-amber-400 hover:bg-amber-500/10 transition"
                              title="Edit Details"
                            >
                              <Edit className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(s)}
                              className="p-1.5 rounded-lg text-ink-muted hover:text-rose-400 hover:bg-rose-500/10 transition"
                              title="Delete Slide"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload / Edit Modal */}
      {isUploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="relative w-full max-w-xl bg-surface rounded-2xl shadow-xl border border-line overflow-hidden my-8">
            <div className="flex items-center justify-between px-6 py-4 border-b border-line-soft bg-ground">
              <h2 className="text-lg font-semibold text-ink flex items-center gap-2">
                <Presentation className="w-5 h-5 text-primary" />
                <span>{editingSlide ? "Edit Slide Presentation" : "Upload Professor Lecture Slides"}</span>
              </h2>
              <button
                onClick={() => {
                  setIsUploadOpen(false);
                  resetForm();
                }}
                className="text-ink-faint hover:text-ink-soft p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                saveMutation.mutate();
              }}
              className="p-6 space-y-4"
            >
              {/* File input (required for new uploads) */}
              {!editingSlide && (
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                    Slide File (PDF, PPTX, PPT) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.ppt,.pptx"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                        if (!formTitle) {
                          // Auto-fill title from filename
                          const cleanName = e.target.files[0].name.replace(/\.[^/.]+$/, "");
                          setFormTitle(cleanName);
                        }
                      }
                    }}
                    className="w-full text-sm text-ink-muted file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-primary/10 file:text-primary hover:file:bg-primary/15 cursor-pointer border border-line rounded-xl p-2 bg-ground"
                  />
                  <p className="text-[11px] text-ink-faint mt-1">
                    Upload course lecture decks or module notes (PDF is recommended for seamless in-browser preview).
                  </p>
                </div>
              )}

              {/* Subject Selection */}
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Subject / Course <span className="text-rose-400">*</span>
                </label>
                <select
                  value={formSubjectId}
                  onChange={(e) => setFormSubjectId(e.target.value)}
                  className="w-full h-11 px-3 bg-ground border border-line rounded-xl text-sm text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">Select a subject...</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code ? `[${s.code}] ` : ""}
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Professor Name & Title */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                    Professor Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Dr. A. K. Sharma"
                    value={formProfessorName}
                    onChange={(e) => setFormProfessorName(e.target.value)}
                    className="w-full h-11 px-3 bg-ground border border-line rounded-xl text-sm text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                    Designation / Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Professor & HOD, CSE"
                    value={formProfessorTitle}
                    onChange={(e) => setFormProfessorTitle(e.target.value)}
                    className="w-full h-11 px-3 bg-ground border border-line rounded-xl text-sm text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Topic Name */}
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Curriculum Topic <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Dynamic Programming or CPU Scheduling"
                  value={formTopicName}
                  onChange={(e) => setFormTopicName(e.target.value)}
                  className="w-full h-11 px-3 bg-ground border border-line rounded-xl text-sm text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Slide Title */}
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Presentation Title <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Module 4: Dynamic Programming & Optimal Substructure"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full h-11 px-3 bg-ground border border-line rounded-xl text-sm text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Semester & Year */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                    Semester
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. 4th Semester"
                    value={formSemester}
                    onChange={(e) => setFormSemester(e.target.value)}
                    className="w-full h-11 px-3 bg-ground border border-line rounded-xl text-sm text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                    Academic Year
                  </label>
                  <input
                    type="number"
                    placeholder="e.g. 2026"
                    value={formAcademicYear}
                    onChange={(e) => setFormAcademicYear(e.target.value)}
                    className="w-full h-11 px-3 bg-ground border border-line rounded-xl text-sm text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                  Description / Remarks (Optional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Key concepts covered in this deck..."
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full p-3 bg-ground border border-line rounded-xl text-sm text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-line-soft">
                <button
                  type="button"
                  onClick={() => {
                    setIsUploadOpen(false);
                    resetForm();
                  }}
                  className="px-4 py-2.5 rounded-xl border border-line-strong text-ink-soft text-sm font-medium hover:bg-raised transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saveMutation.isPending}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary hover:bg-primary-hover disabled:bg-primary/40 text-ground text-sm font-semibold rounded-xl transition"
                >
                  {saveMutation.isPending ? (
                    <div className="w-4 h-4 border-2 border-ground border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                  <span>{editingSlide ? "Save Changes" : "Upload Presentation"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Slide Viewer Modal */}
      <SlideViewerModal
        slide={previewSlide}
        onClose={() => setPreviewSlide(null)}
      />
    </div>
  );
}
