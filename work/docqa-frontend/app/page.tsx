"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  fetchSubjects,
  searchPYQs,
  getSearchSuggestions,
  Question,
  SearchResponse,
  Subject,
} from "../lib/api";

import { SourceViewerModal } from "../components/SourceViewerModal";
import {
  Search,
  BookOpen,
  Calendar,
  Layers,
  FileCheck2,
  ExternalLink,
  ChevronRight,
  Shield,
  Sparkles,
  HelpCircle,
  Award,
  Image as ImageIcon,
} from "lucide-react";
import {
  FormattedQuestionContent,
  hasDiagramReference,
} from "../components/FormattedQuestionContent";

const SUGGESTED_TOPICS = [
  "Linked list reversal and circular list",
  "Doubly linked list node deletion",
  "Banker's Algorithm deadlock avoidance",
  "QuickSort average and worst-case complexity",
  "CPU scheduling preemptive vs non-preemptive",
  "B-Trees and AVL rotations",
  "SQL normalization 3NF and BCNF",
];

function FormattedQuestionText({ text }: { text: string; query?: string }) {
  return <FormattedQuestionContent text={text} />;
}


export default function StudentPortalPage() {
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>("");
  const [query, setQuery] = useState("");
  const [examType, setExamType] = useState<string>("");
  const [minYear, setMinYear] = useState<string>("");
  const [maxYear, setMaxYear] = useState<string>("");
  const [activeSearch, setActiveSearch] = useState<{
    query: string;
    subjectId: string;
    examType?: string;
    minYear?: number;
    maxYear?: number;
  } | null>(null);

  const [inspectQuestionId, setInspectQuestionId] = useState<string | null>(null);

  // Fetch subjects list
  const { data: subjects = [], isLoading: loadingSubjects } = useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
  });

  // Fetch dynamic query suggestions based on selected subject
  const { data: suggestionsData } = useQuery({
    queryKey: ["search-suggestions", selectedSubjectId],
    queryFn: () => getSearchSuggestions(selectedSubjectId || undefined),
  });

  const activeSuggestions =
    suggestionsData?.suggestions && suggestionsData.suggestions.length > 0
      ? suggestionsData.suggestions
      : SUGGESTED_TOPICS;


  // Search questions query
  const {
    data: searchData,
    isLoading: searching,
    isError,
    error,
  } = useQuery<SearchResponse>({
    queryKey: ["search-pyqs", activeSearch],
    queryFn: () => {
      if (!activeSearch) throw new Error("No active search");
      return searchPYQs({
        query: activeSearch.query,
        subject_id: activeSearch.subjectId || undefined,
        exam_type: activeSearch.examType || undefined,
        min_year: activeSearch.minYear || undefined,
        max_year: activeSearch.maxYear || undefined,
      });
    },
    enabled: Boolean(activeSearch && activeSearch.query.trim().length >= 2),
  });

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;

    setActiveSearch({
      query: query.trim(),
      subjectId: selectedSubjectId,
      examType: examType || undefined,
      minYear: minYear ? parseInt(minYear, 10) : undefined,
      maxYear: maxYear ? parseInt(maxYear, 10) : undefined,
    });
  };

  const handleSuggestionClick = (topic: string) => {
    setQuery(topic);
    setActiveSearch({
      query: topic,
      subjectId: selectedSubjectId,
      examType: examType || undefined,
      minYear: minYear ? parseInt(minYear, 10) : undefined,
      maxYear: maxYear ? parseInt(maxYear, 10) : undefined,
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-500/20">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-slate-900 leading-none">
                PYQ Recommender
              </h1>
              <span className="text-xs text-slate-500 font-medium">
                Academic Exam Question Retrieval
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/admin/login"
              className="inline-flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-slate-600 bg-slate-100 hover:bg-slate-200 hover:text-slate-900 transition"
            >
              <Shield className="w-3.5 h-3.5 text-slate-500" />
              <span>Admin Portal</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12 space-y-8">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Verifiable Citations from Historical University Papers</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">
            Find Previous Year Questions by Topic
          </h2>
          <p className="text-slate-600 text-base md:text-lg">
            Search genuine examination questions across multiple years with exact page provenance and marks allocation.
          </p>
        </div>

        {/* Search & Filter Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-7 space-y-5">
          <form onSubmit={handleSearchSubmit} className="space-y-4">
            {/* Subject Selector & Search Input */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              {/* Subject Selector */}
              <div className="md:col-span-4">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Subject
                </label>
                <select
                  value={selectedSubjectId}
                  onChange={(e) => setSelectedSubjectId(e.target.value)}
                  className="w-full h-12 px-3.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
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

              {/* Natural Language Query Bar */}
              <div className="md:col-span-8">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Topic Query (Natural Language)
                </label>
                <div className="relative flex items-center">
                  <Search className="absolute left-4 w-5 h-5 text-slate-400 pointer-events-none" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. explain banker's algorithm deadlock avoidance"
                    className="w-full h-12 pl-11 pr-28 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                  <button
                    type="submit"
                    disabled={searching || !query.trim()}
                    className="absolute right-1.5 px-4 h-9 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 shadow-sm"
                  >
                    {searching ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <>
                        <span>Search</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Secondary Filters Bar */}
            <div className="pt-2 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 font-medium mb-1">Exam Type</label>
                <div className="flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                  <button
                    type="button"
                    onClick={() => setExamType("")}
                    className={`flex-1 py-1 rounded text-center font-medium transition ${
                      examType === "" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    All
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamType("MIDSEM")}
                    className={`flex-1 py-1 rounded text-center font-medium transition ${
                      examType === "MIDSEM" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Midsem
                  </button>
                  <button
                    type="button"
                    onClick={() => setExamType("ENDSEM")}
                    className={`flex-1 py-1 rounded text-center font-medium transition ${
                      examType === "ENDSEM" ? "bg-white text-blue-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Endsem
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">From Academic Year</label>
                <input
                  type="number"
                  placeholder="e.g. 2020"
                  value={minYear}
                  onChange={(e) => setMinYear(e.target.value)}
                  className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-medium mb-1">To Academic Year</label>
                <input
                  type="number"
                  placeholder="e.g. 2026"
                  value={maxYear}
                  onChange={(e) => setMaxYear(e.target.value)}
                  className="w-full h-8 px-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>
          </form>

          {/* Quick Search Chips */}
          <div className="pt-2">
            <span className="text-xs text-slate-400 font-medium mr-2">Try searching:</span>
            <div className="inline-flex flex-wrap gap-1.5 mt-1">
              {activeSuggestions.map((topic) => (
                <button
                  key={topic}
                  type="button"
                  onClick={() => handleSuggestionClick(topic)}
                  className="px-2.5 py-1 text-xs rounded-full bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-600 border border-slate-200 transition"
                >
                  {topic}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Section */}
        <div className="space-y-4">
          {activeSearch && (
            <div className="flex items-center justify-between px-1">
              <div className="text-sm text-slate-600">
                {searchData?.message ? (
                  <span>{searchData.message}</span>
                ) : (
                  <>
                    Found{" "}
                    <strong className="text-slate-900">
                      {searchData ? searchData.total_results : 0}
                    </strong>{" "}
                    questions for &quot;<span className="font-semibold text-blue-700">{activeSearch.query}</span>&quot;
                  </>
                )}
              </div>
            </div>
          )}

          {/* Loading Skeletons */}
          {searching && (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm animate-pulse space-y-3">
                  <div className="h-5 bg-slate-200 rounded w-1/4" />
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-4 bg-slate-200 rounded w-1/2" />
                </div>
              ))}
            </div>
          )}

          {/* Error Notice */}
          {isError && (
            <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
              <p className="font-semibold">Search request failed</p>
              <p className="mt-1 text-xs">{error instanceof Error ? error.message : "Internal error occurred"}</p>
            </div>
          )}

          {/* Empty State */}
          {!searching && !activeSearch && (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200/80 p-8 space-y-3">
              <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                <HelpCircle className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                Ready to search previous examination papers
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Type an exam topic above or select one of the suggested topics to retrieve relevant historical questions with verified citations.
              </p>
            </div>
          )}

          {/* No Results */}
          {!searching && activeSearch && searchData && searchData.results.length === 0 && (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
              <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No matching questions found</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {searchData.message || "Try broadening your query keywords or adjusting the subject and year filters."}
              </p>
            </div>
          )}


          {/* Question Cards */}
          {!searching &&
            searchData &&
            searchData.results.map((q: Question) => (
              <div
                key={q.id}
                className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 transition duration-150 p-6 sm:p-7 space-y-5"
              >
                {/* Header Metadata Chips */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Question Number Badge */}
                    <span className="px-3.5 py-1 bg-blue-600 text-white font-extrabold text-xs sm:text-sm rounded-lg shadow-sm tracking-wide">
                      {q.question_number}
                    </span>

                    {/* Academic Year & Exam Type Pill */}
                    <span
                      className={`inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-bold rounded-lg border shadow-xs ${
                        q.exam_type === "MIDSEM"
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-purple-50 text-purple-800 border-purple-200"
                      }`}
                    >
                      <Calendar className="w-3.5 h-3.5" />
                      <span>
                        {q.exam_year} {q.exam_type === "MIDSEM" ? "Midsem" : "Endsem"}
                      </span>
                    </span>

                    {/* Subject Tag */}
                    <span className="px-3 py-1 bg-slate-100 text-slate-700 font-semibold text-xs rounded-lg border border-slate-200">
                      {q.subject_name} {q.subject_code ? `(${q.subject_code})` : ""}
                    </span>

                    {/* Topic Tags */}
                    {q.topics && q.topics.length > 0 && q.topics.map((top: string) => (
                      <span
                        key={top}
                        className="px-2.5 py-1 bg-blue-50 text-blue-700 font-medium text-xs rounded-lg border border-blue-200"
                      >
                        {top}
                      </span>
                    ))}
                    {/* Diagram Badge */}
                    {hasDiagramReference(q.question_text) && (
                      <button
                        onClick={() => setInspectQuestionId(q.id)}
                        className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-bold transition shadow-xs"
                        title="Question refers to a diagram, circuit, or figure. Click to inspect original high-resolution paper."
                      >
                        <ImageIcon className="w-3.5 h-3.5 text-amber-600" />
                        <span>Diagram &bull; Inspect in Paper</span>
                      </button>
                    )}
                  </div>

                  {q.marks !== null && q.marks !== undefined && (
                    <div className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-md border border-emerald-200">
                      <Award className="w-3.5 h-3.5" />
                      <span>{q.marks} Marks</span>
                    </div>
                  )}
                </div>

                {/* Formatted Question Content */}
                <div className="py-1">
                  <FormattedQuestionText text={q.question_text} query={activeSearch?.query} />
                </div>

                {/* Footer Citations & Source Action */}
                <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs">
                  <div className="flex items-center space-x-2 text-slate-500">
                    <FileCheck2 className="w-4 h-4 text-emerald-600" />
                    <span>
                      Original Paper:{" "}
                      <strong className="text-slate-700">{q.source_filename}</strong> (Page{" "}
                      {q.page_number}
                      {q.page_end > q.page_number && `-${q.page_end}`})
                    </span>
                  </div>

                  <button
                    onClick={() => setInspectQuestionId(q.id)}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg font-semibold transition"
                  >
                    <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                    <span>View in Paper / Diagram</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </main>

      {/* Source Viewer Modal */}
      <SourceViewerModal
        questionId={inspectQuestionId}
        onClose={() => setInspectQuestionId(null)}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-400">
          PYQ Recommender System &bull; Previous Year Question Knowledge Base with Verifiable Provenance.
        </div>
      </footer>
    </div>
  );
}
