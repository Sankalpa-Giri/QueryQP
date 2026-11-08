"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminQuestions,
  fetchSubjects,
  updateQuestion,
  deleteQuestion,
  Question,
  Subject,
} from "../../../lib/api";
import { SourceViewerModal } from "../../../components/SourceViewerModal";
import {
  FormattedQuestionContent,
  SAMPLE_TABLE_TEMPLATE,
  SAMPLE_DIAGRAM_REF_TEMPLATE,
} from "../../../components/FormattedQuestionContent";
import {
  Search,
  Filter,
  Trash2,
  Edit,
  ExternalLink,
  Award,
  Calendar,
  X,
  ClipboardCheck,
  Table as TableIcon,
  Image as ImageIcon,
} from "lucide-react";

function QuestionBankContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Filters state initialized from query params or all by default
  const [subjectId, setSubjectId] = useState(searchParams.get("subject_id") || "");
  const [examYear, setExamYear] = useState(searchParams.get("exam_year") || "");
  const [examType, setExamType] = useState(searchParams.get("exam_type") || "");
  const [searchText, setSearchText] = useState("");

  // Inspect source modal
  const [inspectQuestionId, setInspectQuestionId] = useState<string | null>(null);

  // Edit question modal state
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [editNumber, setEditNumber] = useState("");
  const [editText, setEditText] = useState("");
  const [editMarks, setEditMarks] = useState<string>("");
  const [editTopics, setEditTopics] = useState<string>("");

  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
  });

  // Only approved questions appear in Question Bank
  const {
    data: questions = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<Question[]>({
    queryKey: [
      "admin-questions",
      subjectId,
      examYear,
      examType,
      searchText,
    ],
    queryFn: () =>
      fetchAdminQuestions({
        subject_id: subjectId || undefined,
        exam_year: examYear ? parseInt(examYear, 10) : undefined,
        exam_type: examType || undefined,
        review_status: "APPROVED",
        search: searchText || undefined,
      }),
  });

  // Mutations (Edit and Delete only - Approval is handled in the Staging Area)
  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteQuestion(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-questions"] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Question> & { expected_updated_at?: string } }) =>
      updateQuestion(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      setEditingQuestion(null);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to save question. Please refresh to ensure you have the latest version.");
    },
  });

  const handleOpenEdit = (q: Question) => {
    setEditingQuestion(q);
    setEditNumber(q.question_number);
    setEditText(q.question_text);
    setEditMarks(q.marks !== null && q.marks !== undefined ? q.marks.toString() : "");
    setEditTopics((q.topics || []).join(", "));
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingQuestion) return;

    const topicsArray = editTopics
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    updateMutation.mutate({
      id: editingQuestion.id,
      updates: {
        question_number: editNumber,
        question_text: editText,
        marks: editMarks ? parseFloat(editMarks) : null,
        topics: topicsArray,
        expected_updated_at: editingQuestion.updated_at,
      },
    });
  };

  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteConfirm = (q: Question) => {
    if (confirm(`Are you sure you want to permanently delete question ${q.question_number}?`)) {
      deleteMutation.mutate(q.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Question Bank Management</h1>
        <p className="text-xs text-slate-500 mt-0.5">
          Curated repository of approved exam questions available for student search and practice
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          {/* Subject Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Subject</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="">All Subjects</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `[${s.code}] ${s.name}` : s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Exam Year Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Year</label>
            <input
              type="number"
              placeholder="All Years"
              value={examYear}
              onChange={(e) => setExamYear(e.target.value)}
              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            />
          </div>

          {/* Exam Type Filter */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Exam Type</label>
            <select
              value={examType}
              onChange={(e) => setExamType(e.target.value)}
              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="">All Types</option>
              <option value="MIDSEM">Midsem</option>
              <option value="ENDSEM">Endsem</option>
            </select>
          </div>

          {/* Search Box */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Keywords</label>
            <input
              type="text"
              placeholder="Search approved questions..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* Questions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div>
            <span className="text-xs font-bold text-slate-800">
              Approved Question Bank
            </span>
            <span className="text-xs text-slate-500 ml-2">
              ({questions.length} approved questions)
            </span>
          </div>

          <Link
            href="/admin/staging"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold text-amber-800 bg-amber-50 hover:bg-amber-100 rounded-lg border border-amber-200 transition"
          >
            <ClipboardCheck className="w-3.5 h-3.5 text-amber-600" />
            <span>Go to Staging Area</span>
          </Link>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400 animate-pulse">
            Loading approved questions...
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-xs text-red-600 bg-red-50 rounded-xl m-4 space-y-2">
            <div>Failed to load question records: {error instanceof Error ? error.message : "Error"}</div>
            <button
              onClick={() => refetch()}
              className="px-3 py-1 bg-red-600 text-white rounded text-xs font-semibold hover:bg-red-700 transition"
            >
              Retry
            </button>
          </div>
        ) : questions.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400 space-y-2">
            <div>No approved questions match the current filters.</div>
            <p className="text-[11px] text-slate-400">
              Questions must be verified and approved in the Staging Area before appearing here.
            </p>
            {(subjectId || examYear || examType || searchText) && (
              <button
                onClick={() => {
                  setSubjectId("");
                  setExamYear("");
                  setExamType("");
                  setSearchText("");
                }}
                className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-xs font-medium transition"
              >
                Clear all filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] bg-slate-50">
                <tr>
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Question Text & Topics</th>
                  <th className="px-4 py-3">Subject / Paper</th>
                  <th className="px-4 py-3">Marks</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questions.map((q) => {
                  const isExpanded = Boolean(expandedIds[q.id]);
                  return (
                    <tr key={q.id} className="hover:bg-slate-50 transition">
                      <td className="px-4 py-3 font-bold text-blue-700 whitespace-nowrap align-top">
                        {q.question_number}
                      </td>
                      <td className="px-4 py-3 text-slate-900 max-w-md align-top">
                        <div
                          onClick={() => toggleExpand(q.id)}
                          className="cursor-pointer leading-relaxed text-xs md:text-sm"
                        >
                          {isExpanded ? (
                            <FormattedQuestionContent text={q.question_text} />
                          ) : (
                            <div className="line-clamp-2 whitespace-pre-wrap">{q.question_text}</div>
                          )}
                        </div>
                        {q.topics && q.topics.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {q.topics.map((t, idx) => (
                              <span
                                key={idx}
                                className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium"
                              >
                                #{t}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap align-top">
                        <div className="font-semibold text-slate-800">{q.subject_name}</div>
                        <div className="text-[10px] text-slate-400">
                          {q.exam_year} {q.exam_type} &bull; Page {q.page_number}
                        </div>
                      </td>

                      <td className="px-4 py-3 whitespace-nowrap align-top">
                        {q.marks !== null && q.marks !== undefined ? (
                          <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-semibold text-[11px] border border-emerald-200">
                            <Award className="w-3 h-3" />
                            <span>{q.marks}M</span>
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">-</span>
                        )}
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Source viewer button */}
                          <button
                            onClick={() => setInspectQuestionId(q.id)}
                            title="Inspect Source Provenance"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit button */}
                          <button
                            onClick={() => handleOpenEdit(q)}
                            title="Edit Question"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete button */}
                          <button
                            onClick={() => handleDeleteConfirm(q)}
                            title="Delete Question"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded-lg transition"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-800">
                Edit Approved Question ({editingQuestion.question_number})
              </h3>
              <button
                onClick={() => setEditingQuestion(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Question Number
                  </label>
                  <input
                    type="text"
                    required
                    value={editNumber}
                    onChange={(e) => setEditNumber(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Marks Allocation
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={editMarks}
                    onChange={(e) => setEditMarks(e.target.value)}
                    placeholder="e.g. 10"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Question Text (Markdown, Tables & Diagrams supported)
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setEditText((prev) =>
                          prev ? `${prev.trim()}\n\n${SAMPLE_TABLE_TEMPLATE.trim()}` : SAMPLE_TABLE_TEMPLATE.trim()
                        );
                      }}
                      className="inline-flex items-center space-x-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200 transition"
                    >
                      <TableIcon className="w-3 h-3" />
                      <span>+ Table</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditText((prev) =>
                          prev ? `${prev.trim()}\n\n${SAMPLE_DIAGRAM_REF_TEMPLATE.trim()}` : SAMPLE_DIAGRAM_REF_TEMPLATE.trim()
                        );
                      }}
                      className="inline-flex items-center space-x-1 text-[11px] font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 transition"
                      title="Insert reference note directing students to inspect diagram in the original paper"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span>+ Diagram Ref</span>
                    </button>
                    {editingQuestion && (
                      <button
                        type="button"
                        onClick={() => {
                          const embedCode = `\n\n![Figure: Question Diagram](/api/v1/documents/${editingQuestion.document_id}/pages/${editingQuestion.page_number || 1}/image)\n`;
                          setEditText((prev) => (prev ? `${prev.trim()}${embedCode}` : embedCode.trim()));
                        }}
                        className="inline-flex items-center space-x-1 text-[11px] font-semibold text-emerald-700 hover:text-emerald-900 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 transition"
                        title="Embed the exact page diagram image inline in the question"
                      >
                        <ImageIcon className="w-3 h-3" />
                        <span>+ Embed Page Image</span>
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  required
                  rows={5}
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs font-mono"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Tip: Tables use standard Markdown syntax (<code className="text-slate-600 font-mono">| Header 1 | Header 2 |</code> followed by <code className="text-slate-600 font-mono">| --- | --- |</code>).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Topic Tags (comma-separated)
                </label>
                <input
                  type="text"
                  value={editTopics}
                  onChange={(e) => setEditTopics(e.target.value)}
                  placeholder="e.g. Deadlock, CPU Scheduling"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingQuestion(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold"
                >
                  {updateMutation.isPending ? "Saving..." : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Source Viewer Modal */}
      <SourceViewerModal
        questionId={inspectQuestionId}
        onClose={() => setInspectQuestionId(null)}
      />
    </div>
  );
}

export default function QuestionBankAdminPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-12 text-center text-xs text-slate-400 animate-pulse">
          Loading Question Bank...
        </div>
      }
    >
      <QuestionBankContent />
    </React.Suspense>
  );
}
