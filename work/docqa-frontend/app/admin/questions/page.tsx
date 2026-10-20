"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  fetchAdminQuestions,
  fetchSubjects,
  fetchDocuments,
  updateQuestion,
  deleteQuestion,
  createQuestion,
  splitQuestion,
  CreateQuestionPayload,
  SplitQuestionPart,
  Question,
  Subject,
  QuestionPaper,
} from "../../../lib/api";
import { SourceViewerModal } from "../../../components/SourceViewerModal";
import {
  FormattedQuestionContent,
  SAMPLE_TABLE_TEMPLATE,
  SAMPLE_DIAGRAM_REF_TEMPLATE,
  hasDiagramReference,
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
  Plus,
  ClipboardCheck,
  GitFork,
  Sparkles,
  Table as TableIcon,
  CheckCircle,
  Image as ImageIcon,
} from "lucide-react";

function QuestionBankContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Filters state initialized from query params or all by default
  const [subjectId, setSubjectId] = useState(searchParams.get("subject_id") || "");
  const [examYear, setExamYear] = useState(searchParams.get("exam_year") || "");
  const [examType, setExamType] = useState(searchParams.get("exam_type") || "");
  const [publicationStatus, setPublicationStatus] = useState(
    searchParams.get("publication_status") || ""
  );
  const [reviewStatus, setReviewStatus] = useState(
    searchParams.get("review_status") || ""
  );
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
      publicationStatus,
      reviewStatus,
      searchText,
    ],
    queryFn: () =>
      fetchAdminQuestions({
        subject_id: subjectId || undefined,
        exam_year: examYear ? parseInt(examYear, 10) : undefined,
        exam_type: examType || undefined,
        publication_status: publicationStatus || undefined,
        review_status: reviewStatus || undefined,
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

  // Split question modal state
  interface SplitPartForm {
    question_number: string;
    question_text: string;
    marks: string;
    topics: string;
    page_number: number;
  }

  const [splittingQuestion, setSplittingQuestion] = useState<Question | null>(null);
  const [splitParts, setSplitParts] = useState<SplitPartForm[]>([]);

  const splitMutation = useMutation({
    mutationFn: ({ id, parts }: { id: string; parts: SplitQuestionPart[] }) =>
      splitQuestion(id, parts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      setSplittingQuestion(null);
    },
  });

  function autoDetectBits(
    text: string,
    baseNumber: string,
    defaultMarks?: number | null,
    pageNum: number = 1
  ): SplitPartForm[] {
    const bitRegex = /(?:(?<=[.?!;\]\)]|\n)\s*|\s+)(?:\(([b-z]|[ivx]+)[\)\\\/\:]|([b-z])[\)\\\/\:])\s+/gi;
    const matches = Array.from(text.matchAll(bitRegex));

    let cleanBase = baseNumber.replace(/\([a-z0-9]+\)$/i, "");
    if (!cleanBase.toUpperCase().startsWith("Q")) cleanBase = `Q${cleanBase}`;

    if (matches.length === 0) {
      return [
        {
          question_number: `${cleanBase}(a)`,
          question_text: text,
          marks: defaultMarks ? (defaultMarks / 2).toFixed(1) : "",
          topics: "",
          page_number: pageNum,
        },
        {
          question_number: `${cleanBase}(b)`,
          question_text: "",
          marks: defaultMarks ? (defaultMarks / 2).toFixed(1) : "",
          topics: "",
          page_number: pageNum,
        },
      ];
    }

    const parts: SplitPartForm[] = [];
    const firstMatch = matches[0];
    const part1Text = text.substring(0, firstMatch.index).trim();
    const firstLetter = (firstMatch[1] || firstMatch[2] || "").toLowerCase();
    const part1Letter = firstLetter === "b" ? "a" : firstLetter === "ii" ? "i" : "a";

    const totalParts = matches.length + 1;
    const splitMarks = defaultMarks ? (defaultMarks / totalParts).toFixed(1) : "";

    parts.push({
      question_number: `${cleanBase}(${part1Letter})`,
      question_text: part1Text.replace(/^(?:\([a-z0-9]+\)|[a-z0-9]+[\)\:\.])\s*/i, "").trim(),
      marks: splitMarks,
      topics: "",
      page_number: pageNum,
    });

    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const nextStart = i < matches.length - 1 ? matches[i + 1].index : text.length;
      const bitText = text.substring(cur.index! + cur[0].length, nextStart).trim();
      const bitLetter = (cur[1] || cur[2] || "").toLowerCase();

      parts.push({
        question_number: `${cleanBase}(${bitLetter})`,
        question_text: bitText.replace(/^(?:\([a-z0-9]+\)|[a-z0-9]+[\)\:\.])\s*/i, "").trim(),
        marks: splitMarks,
        topics: "",
        page_number: pageNum,
      });
    }

    return parts;
  }

  const handleOpenSplit = (q: Question) => {
    setSplittingQuestion(q);
    setSplitParts(autoDetectBits(q.question_text, q.question_number, q.marks, q.page_number));
  };

  const handleAddSplitPart = () => {
    if (!splittingQuestion) return;
    let cleanBase = splittingQuestion.question_number.replace(/\([a-z0-9]+\)$/i, "");
    if (!cleanBase.toUpperCase().startsWith("Q")) cleanBase = `Q${cleanBase}`;
    const nextChar = String.fromCharCode(97 + splitParts.length);

    setSplitParts([
      ...splitParts,
      {
        question_number: `${cleanBase}(${nextChar})`,
        question_text: "",
        marks: "",
        topics: "",
        page_number: splittingQuestion.page_number,
      },
    ]);
  };

  const handleRemoveSplitPart = (index: number) => {
    if (splitParts.length <= 2) return;
    setSplitParts(splitParts.filter((_, idx) => idx !== index));
  };

  const handleUpdateSplitPart = (index: number, field: keyof SplitPartForm, value: any) => {
    const updated = [...splitParts];
    updated[index] = { ...updated[index], [field]: value };
    setSplitParts(updated);
  };

  const handleSaveSplit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!splittingQuestion) return;

    const payloadParts: SplitQuestionPart[] = splitParts.map((p) => ({
      question_number: p.question_number.trim(),
      question_text: p.question_text.trim(),
      marks: p.marks ? parseFloat(p.marks) : null,
      topics: p.topics.split(",").map((t) => t.trim()).filter(Boolean),
      page_number: p.page_number,
    }));

    if (payloadParts.some((p) => !p.question_text || !p.question_number)) {
      alert("All split parts must have a question number and question text.");
      return;
    }

    splitMutation.mutate({
      id: splittingQuestion.id,
      parts: payloadParts,
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
          Review, correct segmentation, approve, and publish questions to the student portal
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-2.5 text-xs">
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

          {/* Review Status */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Review</label>
            <select
              value={reviewStatus}
              onChange={(e) => setReviewStatus(e.target.value)}
              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="">All Reviews</option>
              <option value="PENDING">Pending</option>
              <option value="APPROVED">Approved</option>
              <option value="FLAGGED">Flagged</option>
            </select>
          </div>

          {/* Publication Status */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Publication</label>
            <select
              value={publicationStatus}
              onChange={(e) => setPublicationStatus(e.target.value)}
              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="">All Publications</option>
              <option value="PUBLISHED">Published</option>
              <option value="DRAFT">Draft</option>
              <option value="UNPUBLISHED">Unpublished</option>
            </select>
          </div>

          {/* Search Box */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">Keywords</label>
            <input
              type="text"
              placeholder="Search text..."
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
              Active Question Bank
            </span>
            <span className="text-xs text-slate-500 ml-2">
              ({questions.length} questions listed)
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
            Loading question records...
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
            <div>No questions match the current filters.</div>
            {(subjectId || examYear || examType || publicationStatus || reviewStatus || searchText) && (
              <button
                onClick={() => {
                  setSubjectId("");
                  setExamYear("");
                  setExamType("");
                  setPublicationStatus("");
                  setReviewStatus("");
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
                  <th className="px-4 py-3">Review</th>
                  <th className="px-4 py-3">Status</th>
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

                    <td className="px-4 py-3 whitespace-nowrap">
                      {q.marks !== null && q.marks !== undefined ? (
                        <span className="inline-flex items-center space-x-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 rounded font-semibold text-[11px] border border-emerald-200">
                          <Award className="w-3 h-3" />
                          <span>{q.marks}M</span>
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[11px]">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                          q.review_status === "APPROVED"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-amber-50 text-amber-700 border border-amber-200"
                        }`}
                      >
                        {q.review_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className={`px-2 py-0.5 rounded font-semibold text-[10px] ${
                          q.publication_status === "PUBLISHED"
                            ? "bg-teal-50 text-teal-700 border border-teal-200"
                            : "bg-slate-100 text-slate-600 border border-slate-200"
                        }`}
                      >
                        {q.publication_status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Source viewer button */}
                        <button
                          onClick={() => setInspectQuestionId(q.id)}
                          title="Inspect Source Provenance"
                          className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded transition"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>

                        {/* Split button */}
                        <button
                          onClick={() => handleOpenSplit(q)}
                          title="Split Question Bits"
                          className="p-1 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded transition"
                        >
                          <GitFork className="w-3.5 h-3.5 text-amber-600" />
                        </button>

                        {/* Edit button */}
                        <button
                          onClick={() => handleOpenEdit(q)}
                          title="Edit Question"
                          className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded transition"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        {/* Delete button */}
                        <button
                          onClick={() => handleDeleteConfirm(q)}
                          title="Delete Question"
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-slate-100 rounded transition"
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
                Edit Extracted Question ({editingQuestion.question_number})
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

              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const q = editingQuestion;
                    setEditingQuestion(null);
                    handleOpenSplit(q);
                  }}
                  className="inline-flex items-center space-x-1 text-xs text-amber-700 hover:text-amber-800 font-semibold"
                >
                  <GitFork className="w-3.5 h-3.5" />
                  <span>Split this Question into Bits</span>
                </button>

                <div className="flex space-x-2">
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
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Split Question Modal */}
      {splittingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full border border-slate-200 overflow-hidden max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50 flex-shrink-0">
              <div>
                <div className="flex items-center space-x-2">
                  <GitFork className="w-4 h-4 text-amber-600" />
                  <h3 className="text-sm font-bold text-slate-800">
                    Split Mixed Question ({splittingQuestion.question_number})
                  </h3>
                </div>
                <p className="text-[11px] text-slate-500">
                  Separate combined bits like (a), (b), or multiple sub-questions into individual records
                </p>
              </div>
              <button
                onClick={() => setSplittingQuestion(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSplit} className="p-6 space-y-4 overflow-y-auto flex-1">
              {/* Original Question Reference Bar */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                  <span>Original Combined Text:</span>
                  <button
                    type="button"
                    onClick={() => {
                      const detected = autoDetectBits(
                        splittingQuestion.question_text,
                        splittingQuestion.question_number,
                        splittingQuestion.marks,
                        splittingQuestion.page_number
                      );
                      setSplitParts(detected);
                    }}
                    className="inline-flex items-center space-x-1 text-blue-600 hover:text-blue-800"
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Re-Run Auto Detect</span>
                  </button>
                </div>
                <p className="text-slate-700 font-mono text-[11px] line-clamp-3 whitespace-pre-wrap">
                  {splittingQuestion.question_text}
                </p>
              </div>

              {/* Split Parts List */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                    Derived Sub-Questions ({splitParts.length})
                  </h4>
                  <button
                    type="button"
                    onClick={handleAddSplitPart}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg border border-blue-200 transition"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Another Bit</span>
                  </button>
                </div>

                {splitParts.map((part, index) => (
                  <div
                    key={index}
                    className="p-3.5 bg-slate-50/70 border border-slate-200 rounded-xl space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-700 flex items-center space-x-1.5">
                        <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 inline-flex items-center justify-center text-[11px] font-bold">
                          {index + 1}
                        </span>
                        <span>Bit Part #{index + 1}</span>
                      </span>

                      {splitParts.length > 2 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveSplitPart(index)}
                          className="text-xs text-red-500 hover:text-red-700 font-medium"
                        >
                          Remove Part
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Sub-Question No. *
                        </label>
                        <input
                          type="text"
                          required
                          value={part.question_number}
                          onChange={(e) =>
                            handleUpdateSplitPart(index, "question_number", e.target.value)
                          }
                          placeholder="e.g. 2(a)"
                          className="w-full px-2.5 py-1 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Marks
                        </label>
                        <input
                          type="number"
                          step="0.5"
                          value={part.marks}
                          onChange={(e) =>
                            handleUpdateSplitPart(index, "marks", e.target.value)
                          }
                          placeholder="e.g. 5"
                          className="w-full px-2.5 py-1 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                        Question Text *
                      </label>
                      <textarea
                        required
                        rows={3}
                        value={part.question_text}
                        onChange={(e) =>
                          handleUpdateSplitPart(index, "question_text", e.target.value)
                        }
                        placeholder="Enter text for this sub-part..."
                        className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-end space-x-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setSplittingQuestion(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={splitMutation.isPending}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  {splitMutation.isPending ? "Splitting..." : "Confirm Split"}
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
