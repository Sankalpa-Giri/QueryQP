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
  approveQuestion,
  bulkApproveQuestions,
  approveAllDocumentQuestions,
  aiRefineQuestion,
  aiTagTopics,
  aiRefineAllDocumentQuestions,
  aiReExtractDocumentQuestions,
  deleteQuestion,
  createQuestion,
  CreateQuestionPayload,
  Question,
  Subject,
  QuestionPaper,
} from "../../../lib/api";
import { SourceViewerModal } from "../../../components/SourceViewerModal";
import {
  Search,
  Filter,
  CheckCircle,
  CheckSquare,
  Square,
  Trash2,
  Edit,
  ExternalLink,
  Award,
  Calendar,
  X,
  ClipboardCheck,
  FileText,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  ArrowRight,
  Plus,
  Sparkles,
  Tag,
  Layers,
  Table as TableIcon,
  Image as ImageIcon,
} from "lucide-react";
import {
  FormattedQuestionContent,
  SAMPLE_TABLE_TEMPLATE,
  SAMPLE_DIAGRAM_REF_TEMPLATE,
  hasDiagramReference,
} from "../../../components/FormattedQuestionContent";

function StagingAreaContent() {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();

  // Filters state
  const [selectedDocId, setSelectedDocId] = useState(searchParams.get("document_id") || "");
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

  // Manual Add Question modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDocId, setAddDocId] = useState("");
  const [addNumber, setAddNumber] = useState("");
  const [addMarks, setAddMarks] = useState("");
  const [addPage, setAddPage] = useState("1");
  const [addTopics, setAddTopics] = useState("");
  const [addText, setAddText] = useState("");

  // Selection state for bulk operations
  const [selectedQuestionIds, setSelectedQuestionIds] = useState<string[]>([]);
  const [actionSuccessMsg, setActionSuccessMsg] = useState<string | null>(null);

  // Expanded card state
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [isRefiningModal, setIsRefiningModal] = useState(false);

  // Fetch subjects
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
  });

  // Fetch documents for the selector
  const { data: documents = [] } = useQuery<QuestionPaper[]>({
    queryKey: ["admin-documents"],
    queryFn: () => fetchDocuments(),
  });

  // Fetch pending questions in staging
  const {
    data: questions = [],
    isLoading,
    isRefetching,
    refetch,
  } = useQuery<Question[]>({
    queryKey: [
      "staging-questions",
      selectedDocId,
      subjectId,
      examYear,
      examType,
      searchText,
    ],
    queryFn: () =>
      fetchAdminQuestions({
        document_id: selectedDocId || undefined,
        subject_id: subjectId || undefined,
        exam_year: examYear ? parseInt(examYear, 10) : undefined,
        exam_type: examType || undefined,
        review_status: "PENDING",
        search: searchText || undefined,
      }),
  });

  // Selected document info
  const activeDocument = documents.find((d) => d.id === selectedDocId);

  // Helper notification
  const showFeedback = (msg: string) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(null), 4500);
  };

  // Mutations
  const approveSingleMutation = useMutation({
    mutationFn: (id: string) => approveQuestion(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setSelectedQuestionIds((prev) => prev.filter((id) => id !== data.id));
      showFeedback(`Question ${data.question_number} approved and moved to Question Bank!`);
    },
  });

  const bulkApproveMutation = useMutation({
    mutationFn: (ids: string[]) => bulkApproveQuestions(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setSelectedQuestionIds([]);
      showFeedback(`Successfully approved ${data.approved_count} questions into the Question Bank!`);
    },
  });

  const approveAllDocMutation = useMutation({
    mutationFn: (docId: string) => approveAllDocumentQuestions(docId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setSelectedQuestionIds([]);
      showFeedback(`All questions for this paper approved and moved to Question Bank!`);
    },
  });

  const aiRefineMutation = useMutation({
    mutationFn: (id: string) => aiRefineQuestion(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      showFeedback(`Question ${data.question_number} enhanced with AI (LaTeX formatted & cleaned)!`);
    },
    onError: (err: any) => {
      alert(err.message || "AI refinement failed.");
    },
  });

  const aiTopicsMutation = useMutation({
    mutationFn: (id: string) => aiTagTopics(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      showFeedback(`Question ${data.question_number} topics auto-tagged with AI!`);
    },
    onError: (err: any) => {
      alert(err.message || "AI topic tagging failed.");
    },
  });

  const aiRefineAllMutation = useMutation({
    mutationFn: (docId: string) => aiRefineAllDocumentQuestions(docId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      showFeedback(`AI enhanced and formatted ${data.refined_count} questions for this paper!`);
    },
    onError: (err: any) => {
      alert(err.message || "Batch AI refinement failed.");
    },
  });

  const aiReExtractMutation = useMutation({
    mutationFn: (docId: string) => aiReExtractDocumentQuestions(docId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-documents"] });
      showFeedback(`AI re-extracted ${data.extracted_count} clean questions directly from paper!`);
    },
    onError: (err: any) => {
      alert(err.message || "AI re-extraction failed.");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteQuestion(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      showFeedback("Question removed from staging.");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Question> & { expected_updated_at?: string } }) =>
      updateQuestion(id, updates),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      setEditingQuestion(null);
      showFeedback(`Question ${data.question_number} updated.`);
    },
    onError: (err: any) => {
      alert(err.message || "Failed to save question. Please reload to see the latest version.");
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateQuestionPayload) => createQuestion(payload),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["staging-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-questions"] });
      queryClient.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setShowAddModal(false);
      // Reset form
      setAddNumber("");
      setAddMarks("");
      setAddTopics("");
      setAddText("");
      showFeedback(`Question ${data.question_number} added directly to Question Bank!`);
    },
  });

  // Modal open & save
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

  // Manual Add Modal open
  const handleOpenAddModal = () => {
    setAddDocId(selectedDocId || (documents.length > 0 ? documents[0].id : ""));
    setAddPage("1");
    setAddNumber("");
    setAddMarks("");
    setAddTopics("");
    setAddText("");
    setShowAddModal(true);
  };

  const handleSaveAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addDocId || !addNumber || !addText) return;

    createMutation.mutate({
      document_id: addDocId,
      question_number: addNumber.trim(),
      question_text: addText.trim(),
      marks: addMarks ? parseFloat(addMarks) : null,
      page_number: parseInt(addPage, 10) || 1,
      topics: addTopics.split(",").map((t) => t.trim()).filter(Boolean),
    });
  };

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedQuestionIds.length === questions.length) {
      setSelectedQuestionIds([]);
    } else {
      setSelectedQuestionIds(questions.map((q) => q.id));
    }
  };

  const toggleSelectOne = (id: string) => {
    setSelectedQuestionIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleDeleteConfirm = (q: Question) => {
    if (
      confirm(
        `Are you sure you want to discard question ${q.question_number} from staging?`
      )
    ) {
      deleteMutation.mutate(q.id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Overview Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
              Stage 2 Verification
            </span>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Staging Area
            </h1>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Questions parsed arrive here first for manual verification.
            Inspect, manually add missing questions, and approve verified questions into the Question Bank.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          <button
            onClick={handleOpenAddModal}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Question Manually</span>
          </button>
          <button
            onClick={() => refetch()}
            disabled={isLoading || isRefetching}
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-400 ${isRefetching ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <Link
            href="/admin/questions"
            className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm transition"
          >
            <span>Question Bank</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
          </Link>
        </div>
      </div>

      {/* Success Notification Banner */}
      {actionSuccessMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-medium flex items-center justify-between animate-fadeIn">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 flex-shrink-0" />
            <span>{actionSuccessMsg}</span>
          </div>
          <button
            onClick={() => setActionSuccessMsg(null)}
            className="text-emerald-600 hover:text-emerald-800 p-1"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Paper-scoped Banner (when a paper is active) */}
      {activeDocument && (
        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 flex flex-col md:flex-row md:items-center md:justify-between gap-3 shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="font-bold text-sm text-slate-900 truncate">
                {activeDocument.filename}
              </span>
            </div>
            <div className="text-xs text-slate-600 flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 bg-white border border-blue-200 rounded font-semibold text-blue-700">
                {activeDocument.subject_name || "Unknown Subject"}
              </span>
              <span className="px-2 py-0.5 bg-white border border-slate-200 rounded font-medium text-slate-700">
                {activeDocument.exam_year} {activeDocument.exam_type}
              </span>
              <span>&bull;</span>
              <span>{activeDocument.page_count} Pages</span>
              <span>&bull;</span>
              <span>Total Questions: {activeDocument.question_count}</span>
            </div>
          </div>

          <div className="flex items-center space-x-2 flex-shrink-0 flex-wrap gap-y-2">
            <button
              onClick={() => {
                if (confirm("Re-run full AI extraction directly from the paper markdown?\n\nThis will replace pending rough questions with clean LaTeX equations, complete subquestions, and syllabus tags.")) {
                  aiReExtractMutation.mutate(activeDocument.id);
                }
              }}
              disabled={aiReExtractMutation.isPending}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              title="Full AI Re-Extraction directly from document markdown"
            >
              <Sparkles className={`w-3.5 h-3.5 ${aiReExtractMutation.isPending ? "animate-spin" : ""}`} />
              <span>{aiReExtractMutation.isPending ? "Re-Extracting..." : "AI Re-Extract Paper"}</span>
            </button>
            <button
              onClick={() => aiRefineAllMutation.mutate(activeDocument.id)}
              disabled={aiRefineAllMutation.isPending || questions.length === 0}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              title="Format LaTeX math & fix OCR noise across all pending questions"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${aiRefineAllMutation.isPending ? "animate-spin" : ""}`} />
              <span>{aiRefineAllMutation.isPending ? "Enhancing..." : `AI Format All (${questions.length})`}</span>
            </button>
            <button
              onClick={() => approveAllDocMutation.mutate(activeDocument.id)}
              disabled={approveAllDocMutation.isPending || questions.length === 0}
              className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition"
            >
              <CheckCircle className="w-4 h-4" />
              <span>
                {approveAllDocMutation.isPending
                  ? "Approving Paper..."
                  : `Approve All for Paper (${questions.length})`}
              </span>
            </button>
            <button
              onClick={() => setSelectedDocId("")}
              className="px-3 py-2 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-medium transition"
            >
              Show All Papers
            </button>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5 text-xs">
          {/* Paper / Document Selector */}
          <div>
            <label className="block text-slate-500 font-semibold mb-1">
              Filter by Paper
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full h-8 px-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800"
            >
              <option value="">All Uploaded Papers</option>
              {documents.map((doc) => (
                <option key={doc.id} value={doc.id}>
                  {doc.filename} ({doc.exam_year} {doc.exam_type})
                </option>
              ))}
            </select>
          </div>

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

          {/* Search Keywords */}
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

      {/* Bulk Action & Controls Header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50">
          <div className="flex items-center space-x-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900"
            >
              {questions.length > 0 && selectedQuestionIds.length === questions.length ? (
                <CheckSquare className="w-4 h-4 text-blue-600" />
              ) : (
                <Square className="w-4 h-4 text-slate-400" />
              )}
              <span>Select All</span>
            </button>
            <span className="text-slate-300">|</span>
            <span className="text-xs font-bold text-slate-800">
              {questions.length} Pending Questions in Staging
            </span>
          </div>

          <div className="flex items-center space-x-2">
            {selectedQuestionIds.length > 0 && (
              <button
                onClick={() => bulkApproveMutation.mutate(selectedQuestionIds)}
                disabled={bulkApproveMutation.isPending}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>
                  {bulkApproveMutation.isPending
                    ? "Approving..."
                    : `Approve Selected (${selectedQuestionIds.length})`}
                </span>
              </button>
            )}

            {questions.length > 0 && selectedDocId && (
              <button
                onClick={() => approveAllDocMutation.mutate(selectedDocId)}
                disabled={approveAllDocMutation.isPending}
                className="inline-flex items-center space-x-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-sm transition"
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>Approve All in This Paper</span>
              </button>
            )}
          </div>
        </div>

        {/* Content Body */}
        {isLoading ? (
          <div className="p-12 text-center text-xs text-slate-400 animate-pulse">
            Loading staged question records...
          </div>
        ) : questions.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <ClipboardCheck className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-sm font-bold text-slate-800">
              No Pending Questions in Staging Area
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              All parsed questions have been approved and moved to the Question Bank,
              or no papers matching the selected filters are awaiting verification.
            </p>
            <div className="pt-2 flex items-center justify-center space-x-3">
              <button
                onClick={handleOpenAddModal}
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-blue-600 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-blue-700 transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Question Manually</span>
              </button>
              <Link
                href="/admin/questions"
                className="inline-flex items-center space-x-1.5 px-3.5 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-800 transition"
              >
                <span>View Question Bank</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] bg-slate-50">
                <tr>
                  <th className="px-4 py-3 w-8">
                    <span className="sr-only">Select</span>
                  </th>
                  <th className="px-4 py-3">No.</th>
                  <th className="px-4 py-3">Parsed Question Text & Topics</th>
                  <th className="px-4 py-3">Source Paper & Page</th>
                  <th className="px-4 py-3">Marks</th>
                  <th className="px-4 py-3">Review Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {questions.map((q) => {
                  const isExpanded = Boolean(expandedIds[q.id]);
                  const isSelected = selectedQuestionIds.includes(q.id);

                  return (
                    <tr
                      key={q.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isSelected ? "bg-blue-50/40" : ""
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => toggleSelectOne(q.id)}
                          className="pt-0.5 text-slate-400 hover:text-blue-600"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-blue-600" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* Number */}
                      <td className="px-4 py-3 font-bold text-amber-700 whitespace-nowrap align-top">
                        <span className="px-2 py-0.5 bg-amber-50 rounded border border-amber-200">
                          {q.question_number}
                        </span>
                      </td>

                      {/* Text & Topics */}
                      <td className="px-4 py-3 text-slate-900 max-w-lg align-top">
                        <div
                          onClick={() => toggleExpand(q.id)}
                          className="cursor-pointer leading-relaxed text-xs md:text-sm"
                          title="Click to expand/collapse"
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

                      {/* Subject & Paper */}
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap align-top">
                        <div className="font-semibold text-slate-800">
                          {q.subject_name}
                        </div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          {q.exam_year} {q.exam_type} &bull; Page {q.page_number}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate max-w-[180px]">
                          {q.source_filename}
                        </div>
                      </td>

                      {/* Marks */}
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

                      {/* Status */}
                      <td className="px-4 py-3 whitespace-nowrap align-top">
                        <span className="px-2 py-0.5 rounded font-semibold text-[10px] bg-amber-50 text-amber-700 border border-amber-200">
                          Pending
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-4 py-3 text-right whitespace-nowrap align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* AI Refine & Format LaTeX */}
                          <button
                            onClick={() => aiRefineMutation.mutate(q.id)}
                            disabled={aiRefineMutation.isPending && (aiRefineMutation.variables as string) === q.id}
                            title="AI Clean OCR & Format LaTeX Math"
                            className="p-1.5 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg transition"
                          >
                            <Sparkles className={`w-3.5 h-3.5 ${aiRefineMutation.isPending && (aiRefineMutation.variables as string) === q.id ? "animate-spin" : ""}`} />
                          </button>

                          {/* AI Tag Topics */}
                          <button
                            onClick={() => aiTopicsMutation.mutate(q.id)}
                            disabled={aiTopicsMutation.isPending && (aiTopicsMutation.variables as string) === q.id}
                            title="AI Auto-Tag Syllabus Topics"
                            className="p-1.5 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg transition"
                          >
                            <Tag className={`w-3.5 h-3.5 ${aiTopicsMutation.isPending && (aiTopicsMutation.variables as string) === q.id ? "animate-spin" : ""}`} />
                          </button>

                          {/* Inspect Source */}
                          <button
                            onClick={() => setInspectQuestionId(q.id)}
                            title="Inspect PDF Source Provenance"
                            className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>

                          {/* Edit */}
                          <button
                            onClick={() => handleOpenEdit(q)}
                            title="Edit Question Content"
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>

                          {/* Approve (Moves to Question Bank) */}
                          <button
                            onClick={() => approveSingleMutation.mutate(q.id)}
                            disabled={approveSingleMutation.isPending}
                            title="Approve and Move to Question Bank"
                            className="inline-flex items-center space-x-1 px-2 py-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition"
                          >
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            <span>Approve</span>
                          </button>

                          {/* Discard / Delete */}
                          <button
                            onClick={() => handleDeleteConfirm(q)}
                            title="Discard / Delete from Staging"
                            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
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

      {/* Manual Add Question Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Add Question to Question Bank
                </h3>
                <p className="text-[11px] text-slate-500">
                  Manually add a question or missing bit. It will be immediately saved to the Question Bank with provided topic tags.
                </p>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Target Question Paper *
                </label>
                <select
                  required
                  value={addDocId}
                  onChange={(e) => setAddDocId(e.target.value)}
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs bg-slate-50"
                >
                  <option value="">Select Paper</option>
                  {documents.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.filename} ({d.exam_year} {d.exam_type})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Question No. *
                  </label>
                  <input
                    type="text"
                    required
                    value={addNumber}
                    onChange={(e) => setAddNumber(e.target.value)}
                    placeholder="e.g. 1(c), 2(b)"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Marks
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={addMarks}
                    onChange={(e) => setAddMarks(e.target.value)}
                    placeholder="e.g. 5"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Page No.
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={addPage}
                    onChange={(e) => setAddPage(e.target.value)}
                    placeholder="e.g. 1"
                    className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-700">
                    Question Text (Markdown, Tables & Diagrams supported) *
                  </label>
                  <div className="flex items-center space-x-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setAddText((prev) =>
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
                        setAddText((prev) =>
                          prev ? `${prev.trim()}\n\n${SAMPLE_DIAGRAM_REF_TEMPLATE.trim()}` : SAMPLE_DIAGRAM_REF_TEMPLATE.trim()
                        );
                      }}
                      className="inline-flex items-center space-x-1 text-[11px] font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 transition"
                      title="Insert reference note directing students to inspect diagram in the original paper"
                    >
                      <ImageIcon className="w-3 h-3" />
                      <span>+ Diagram Ref</span>
                    </button>
                    {addDocId && (
                      <button
                        type="button"
                        onClick={() => {
                          const embedCode = `\n\n![Figure: Question Diagram](/api/v1/documents/${addDocId}/pages/${addPage || 1}/image)\n`;
                          setAddText((prev) => (prev ? `${prev.trim()}${embedCode}` : embedCode.trim()));
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
                  value={addText}
                  onChange={(e) => setAddText(e.target.value)}
                  placeholder="Enter full question wording... You can use | Column 1 | Column 2 | for tables"
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
                  value={addTopics}
                  onChange={(e) => setAddTopics(e.target.value)}
                  placeholder="e.g. Viterbi Algorithm, HMM, Probability"
                  className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{createMutation.isPending ? "Saving..." : "Save to Question Bank"}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Question Modal */}
      {editingQuestion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-800">
                  Verify & Edit Staged Question ({editingQuestion.question_number})
                </h3>
                <p className="text-[11px] text-slate-400">
                  Fix any LlamaParse segmentation or numbering errors before approval
                </p>
              </div>
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
                    Question Number / Subquestion
                  </label>
                  <input
                    type="text"
                    required
                    value={editNumber}
                    onChange={(e) => setEditNumber(e.target.value)}
                    placeholder="e.g. 1(a), 2(b)"
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
                      disabled={isRefiningModal}
                      onClick={async () => {
                        if (!editingQuestion) return;
                        try {
                          setIsRefiningModal(true);
                          const res = await aiRefineQuestion(editingQuestion.id);
                          setEditText(res.question_text);
                          if (res.marks !== null && res.marks !== undefined) {
                            setEditMarks(res.marks.toString());
                          }
                          if (res.topics && res.topics.length > 0) {
                            setEditTopics(res.topics.join(", "));
                          }
                          showFeedback("AI auto-formatted question and KaTeX math!");
                        } catch (err: any) {
                          alert(err.message || "AI auto-format failed");
                        } finally {
                          setIsRefiningModal(false);
                        }
                      }}
                      className="inline-flex items-center space-x-1 text-[11px] font-semibold text-purple-700 hover:text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 transition disabled:opacity-50"
                      title="Auto-clean OCR, format KaTeX math, and detect marks/topics with AI"
                    >
                      <Sparkles className={`w-3 h-3 ${isRefiningModal ? "animate-spin" : ""}`} />
                      <span>{isRefiningModal ? "Refining..." : "AI Auto-Fix & Format"}</span>
                    </button>
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
                  rows={6}
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
                  placeholder="e.g. Transformers, Attention Mechanism, Perplexity"
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

export default function StagingAreaPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-12 text-center text-xs text-slate-400 animate-pulse">
          Loading Staging Area...
        </div>
      }
    >
      <StagingAreaContent />
    </React.Suspense>
  );
}
