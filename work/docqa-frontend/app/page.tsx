"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  API_BASE,
  fetchSubjects,
  searchPYQs,
  getSearchSuggestions,
  solveQuestionAI,
  chatWithPYQAssistant,
  fetchSubjectAnalytics,
  fetchProfessorSlides,
  Question,
  SearchResponse,
  Subject,
  SolveQuestionResponse,
  PYQChatResponse,
  SubjectAnalyticsResponse,
  SlideItem,
  ProfessorSlidesItem,
  getSlideDownloadUrl,
} from "../lib/api";

import { SourceViewerModal } from "../components/SourceViewerModal";
import { SlideViewerModal } from "../components/SlideViewerModal";
import {
  Search,
  BookOpen,
  Calendar,
  FileCheck2,
  ExternalLink,
  ChevronRight,
  Shield,
  Sparkles,
  HelpCircle,
  Award,
  Image as ImageIcon,
  MessageSquare,
  BarChart3,
  Presentation,
  Download,
  Eye,
  User,
  GraduationCap,
  Layers,
  Repeat,
} from "lucide-react";
import {
  FormattedQuestionContent,
  hasDiagramReference,
} from "../components/FormattedQuestionContent";

const SUGGESTED_TOPICS = [
  "Linked list reversal and circular list",
  "Explain Q1 from 2024 midsem",
  "Banker's Algorithm deadlock avoidance",
  "QuickSort average and worst-case complexity",
  "CPU scheduling preemptive vs non-preemptive",
  "B-Trees and AVL rotations",
  "SQL normalization 3NF and BCNF",
];

type PortalTab = "search" | "slides" | "chat" | "analytics";

function FormattedQuestionText({ text }: { text: string; query?: string }) {
  return <FormattedQuestionContent text={text} />;
}

export default function StudentPortalPage() {
  const [activeTab, setActiveTab] = useState<PortalTab>("search");
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

  // AI Step-by-Step Solution state per question card
  const [solutionsMap, setSolutionsMap] = useState<Record<string, SolveQuestionResponse>>({});
  const [solvingId, setSolvingId] = useState<string | null>(null);

  // Slides State
  const [selectedProfessorName, setSelectedProfessorName] = useState<string>("");
  const [slidesSearch, setSlidesSearch] = useState<string>("");
  const [inspectSlide, setInspectSlide] = useState<SlideItem | null>(null);

  // AI Chat state
  const [chatInput, setChatInput] = useState<string>("");
  const [chatLoading, setChatLoading] = useState<boolean>(false);
  const [chatHistory, setChatHistory] = useState<
    { role: "user" | "assistant"; text: string; data?: PYQChatResponse }[]
  >([
    {
      role: "assistant",
      text: "Welcome to QueryQP AI Assistant! Ask me to solve any KIIT past paper question (e.g. 'Explain Banker's algorithm from 2024 Midsem' or 'Show 3NF and BCNF normalization questions') and I will cite the exact paper, year, and page.",
    },
  ]);

  // Analytics & Score Predictor state
  const [checkedTopics, setCheckedTopics] = useState<Record<string, boolean>>({});

  // Fetch subjects list
  const { data: subjects = [] } = useQuery<Subject[]>({
    queryKey: ["subjects"],
    queryFn: fetchSubjects,
  });

  const effectiveAnalyticsSubjectId =
    selectedSubjectId || (subjects.length > 0 ? subjects[0].id : "");

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

  // Subject Analytics query
  const { data: analyticsData, isLoading: loadingAnalytics } = useQuery<SubjectAnalyticsResponse>({
    queryKey: ["subject-analytics", effectiveAnalyticsSubjectId],
    queryFn: () => fetchSubjectAnalytics(effectiveAnalyticsSubjectId),
    enabled: Boolean(effectiveAnalyticsSubjectId && activeTab === "analytics"),
  });

  // Slides Query
  const { data: slidesResponse, isLoading: loadingSlides } = useQuery({
    queryKey: ["professor-slides", selectedSubjectId, slidesSearch],
    queryFn: () => fetchProfessorSlides(selectedSubjectId || undefined, slidesSearch || undefined),
    enabled: activeTab === "slides",
  });

  // Ensure professors are in Alphabetical Order
  const professorsList: ProfessorSlidesItem[] = (slidesResponse?.professors || []).slice().sort(
    (a, b) => a.professor_name.localeCompare(b.professor_name)
  );

  const effectiveSelectedProfessor =
    selectedProfessorName && professorsList.some((p) => p.professor_name === selectedProfessorName)
      ? selectedProfessorName
      : professorsList[0]?.professor_name || "";

  const activeProfessorData = professorsList.find(
    (p) => p.professor_name === effectiveSelectedProfessor
  );

  // Pre-select top 2 topics when analytics loads
  useEffect(() => {
    if (analyticsData && analyticsData.topics.length > 0 && Object.keys(checkedTopics).length === 0) {
      const initial: Record<string, boolean> = {};
      analyticsData.topics.slice(0, 2).forEach((t) => {
        initial[t.topic_name] = true;
      });
      setCheckedTopics(initial);
    }
  }, [analyticsData]);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!query.trim()) return;
    setActiveTab("search");
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
    setActiveTab("search");
    setActiveSearch({
      query: topic,
      subjectId: selectedSubjectId,
      examType: examType || undefined,
      minYear: minYear ? parseInt(minYear, 10) : undefined,
      maxYear: maxYear ? parseInt(maxYear, 10) : undefined,
    });
  };

  const handleSolveQuestion = async (questionId: string) => {
    if (solutionsMap[questionId]) {
      const copy = { ...solutionsMap };
      delete copy[questionId];
      setSolutionsMap(copy);
      return;
    }
    setSolvingId(questionId);
    try {
      const sol = await solveQuestionAI(questionId);
      setSolutionsMap((prev) => ({ ...prev, [questionId]: sol }));
    } catch {
      // ignore error
    } finally {
      setSolvingId(null);
    }
  };

  const handleSendChat = async (customMessage?: string) => {
    const msg = (customMessage ?? chatInput).trim();
    if (!msg || chatLoading) return;
    setChatInput("");
    setChatHistory((prev) => [...prev, { role: "user", text: msg }]);
    setChatLoading(true);
    try {
      const res = await chatWithPYQAssistant({
        message: msg,
        subject_id: selectedSubjectId || undefined,
        exam_type: examType || undefined,
      });
      setChatHistory((prev) => [
        ...prev,
        { role: "assistant", text: res.answer, data: res },
      ]);
    } catch (err) {
      setChatHistory((prev) => [
        ...prev,
        {
          role: "assistant",
          text: err instanceof Error ? err.message : "Unable to reach PYQ AI Assistant.",
        },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  // Calculate predicted score from checked topics
  const totalCoveredWeight = analyticsData
    ? analyticsData.topics.reduce(
        (acc, t) => acc + (checkedTopics[t.topic_name] ? t.weightage_percent : 0),
        0
      )
    : 0;
  const clampedCoverage = Math.min(100, Math.round(totalCoveredWeight));
  const predictedMidsem = Math.round((clampedCoverage / 100) * 20);
  const predictedEndsem = Math.round((clampedCoverage / 100) * 50);

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
                QueryQP Intelligence
              </h1>
              <span className="text-xs text-slate-500 font-medium">
                KIIT PYQ Recommender, Lecture Slides &amp; AI Solver
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
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
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
        {/* Hero Section */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-medium">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Okapi BM25 + BGE Hybrid Search &bull; Professor Lecture Slides &bull; AI Step-by-Step Solver</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-extrabold tracking-tight text-slate-900">
            University Past Papers &amp; Professor Lecture Slides
          </h2>
          <p className="text-slate-600 text-sm md:text-base">
            Search verified previous year questions, access topic-wise professor presentation slides, get grounded AI step-by-step solutions, and discover syllabus topic exam weightage.
          </p>
        </div>

        {/* 4-Tab Feature Switcher: Search PYQs -> Slides -> AI Assistant -> Discover & Score Predictor */}
        <div className="flex flex-wrap items-center justify-center gap-2 bg-white p-2 rounded-2xl border border-slate-200 shadow-xs max-w-3xl mx-auto">
          {[
            { id: "search", label: "Search PYQs", icon: Search },
            { id: "slides", label: "Professor Slides", icon: Presentation },
            { id: "chat", label: "AI Assistant", icon: MessageSquare },
            { id: "analytics", label: "Discover & Score Predictor", icon: BarChart3 },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id as PortalTab)}
                className={`inline-flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
                  isActive
                    ? "bg-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <Icon className="w-4 h-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Global Subject Filter Bar for Chat & Analytics */}
        {(activeTab === "chat" || activeTab === "analytics") && (
          <div className="bg-white rounded-2xl border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-4 shadow-xs">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Active Course Subject:
              </span>
              <select
                value={effectiveAnalyticsSubjectId}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value);
                  setCheckedTopics({});
                }}
                className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code ? `[${s.code}] ` : ""}
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-slate-500">
              All answers, solutions, and topic weightages are strictly grounded in reviewed university papers.
            </div>
          </div>
        )}

        {/* ==================== TAB 1: HYBRID SEARCH ==================== */}
        {activeTab === "search" && (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-7 space-y-5">
              <form onSubmit={handleSearchSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
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

                  <div className="md:col-span-8">
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5 uppercase tracking-wider">
                      Topic or Question Query (Auto-Detects Year, Session & Q-No)
                    </label>
                    <div className="relative flex items-center">
                      <Search className="absolute left-4 w-5 h-5 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="e.g. explain banker's algorithm from 2024 midsem or Q1(a)"
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
                        questions for &quot;
                        <span className="font-semibold text-blue-700">{activeSearch.query}</span>&quot;
                      </>
                    )}
                  </div>
                </div>
              )}

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

              {isError && (
                <div className="p-6 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  <p className="font-semibold">Search request failed</p>
                  <p className="mt-1 text-xs">{error instanceof Error ? error.message : "Internal error occurred"}</p>
                </div>
              )}

              {!searching && !activeSearch && (
                <div className="text-center py-14 bg-white rounded-2xl border border-slate-200/80 p-8 space-y-3">
                  <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">
                    Ready to search previous examination papers
                  </h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    Search by topic or past question number above. You can also explore lecture presentation slides by university professors in the &ldquo;Professor Slides&rdquo; tab.
                  </p>
                </div>
              )}

              {!searching && activeSearch && searchData && searchData.results.length === 0 && (
                <div className="text-center py-14 bg-white rounded-2xl border border-slate-200 p-8 space-y-3">
                  <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto">
                    <Search className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-bold text-slate-800">No matching questions found</h3>
                  <p className="text-xs text-slate-500 max-w-md mx-auto">
                    {searchData.message || "Try broadening your query keywords or adjusting the subject and year filters."}
                  </p>
                </div>
              )}

              {!searching &&
                searchData &&
                searchData.results.map((q: Question) => {
                  return (
                    <div
                      key={q.id}
                      className="group bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 transition duration-150 p-6 sm:p-7 space-y-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-3.5 py-1 bg-blue-600 text-white font-extrabold text-xs sm:text-sm rounded-lg shadow-sm tracking-wide">
                            {q.question_number}
                          </span>

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

                          {hasDiagramReference(q.question_text) && (
                            <button
                              onClick={() => setInspectQuestionId(q.id)}
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 rounded-lg text-xs font-bold transition shadow-xs"
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

                      <div className="py-1">
                        <FormattedQuestionText text={q.question_text} query={activeSearch?.query} />
                      </div>

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

                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setInspectQuestionId(q.id)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-lg font-semibold transition"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-blue-600" />
                            <span>View in Paper / Diagram</span>
                            <ExternalLink className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}

        {/* ==================== TAB 2: PROFESSOR LECTURE SLIDES (NEW) ==================== */}
        {activeTab === "slides" && (
          <div className="space-y-4">
            {/* Top Control Bar - Space-Efficient Subject Selector & Search */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Subject Dropdown & Quick Badges */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500 whitespace-nowrap">
                      Select Subject:
                    </span>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => {
                        setSelectedSubjectId(e.target.value);
                        setSelectedProfessorName("");
                      }}
                      className="h-10 px-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500 min-w-[220px]"
                    >
                      <option value="">All Subjects (Curriculum-wide)</option>
                      {subjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code ? `[${s.code}] ` : ""}
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Quick Subject Chips */}
                  <div className="hidden sm:flex items-center gap-1.5 flex-wrap">
                    {subjects.slice(0, 4).map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() => {
                          setSelectedSubjectId(s.id === selectedSubjectId ? "" : s.id);
                          setSelectedProfessorName("");
                        }}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium transition ${
                          selectedSubjectId === s.id
                            ? "bg-indigo-600 text-white shadow-xs"
                            : "bg-slate-100 hover:bg-slate-200 text-slate-600"
                        }`}
                      >
                        {s.code || s.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter input */}
                <div className="relative min-w-[220px] md:w-72">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter professor, topic, slides..."
                    value={slidesSearch}
                    onChange={(e) => setSlidesSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Content: Split Layout (Professors on Left, Topic Slides on Right) */}
            {loadingSlides ? (
              <div className="p-12 text-center text-xs text-slate-500 flex flex-col items-center justify-center gap-2 bg-white rounded-2xl border border-slate-200">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <span>Loading university professor lecture slides...</span>
              </div>
            ) : professorsList.length === 0 ? (
              <div className="p-12 text-center bg-white rounded-2xl border border-slate-200 space-y-3">
                <Presentation className="w-12 h-12 text-slate-300 mx-auto" />
                <h4 className="font-bold text-slate-800">No slides found for this subject</h4>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  No slides match the selected subject or search query. Choose another subject or upload slides via the Admin Portal.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left: Alphabetical Professor List (Column 4 of 12) */}
                <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      University Professors ({professorsList.length})
                    </span>
                    <span className="text-[11px] text-indigo-600 font-semibold">
                      Alphabetical Order (A &rarr; Z)
                    </span>
                  </div>

                  <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1">
                    {professorsList.map((prof) => {
                      const isSelected = effectiveSelectedProfessor === prof.professor_name;
                      return (
                        <button
                          key={prof.professor_name}
                          type="button"
                          onClick={() => setSelectedProfessorName(prof.professor_name)}
                          className={`w-full text-left p-3 rounded-xl border transition flex items-center justify-between gap-2.5 ${
                            isSelected
                              ? "bg-indigo-50/80 border-indigo-300 ring-1 ring-indigo-400/40 text-slate-900"
                              : "bg-slate-50/60 hover:bg-slate-100/80 border-slate-200 text-slate-700"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs shrink-0 ${
                                isSelected
                                  ? "bg-indigo-600 text-white"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {prof.professor_name
                                .replace(/^(Dr\.|Prof\.|Mr\.|Ms\.)\s*/i, "")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-xs sm:text-sm truncate leading-tight">
                                {prof.professor_name}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                {prof.professor_title || "University Faculty"}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full bg-white border border-slate-200 text-slate-600 shadow-2xs">
                              {prof.total_slides} slides
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Selected Professor's Topic-wise Slides (Column 8 of 12) */}
                <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-5">
                  {activeProfessorData ? (
                    <>
                      {/* Professor Profile Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                            <GraduationCap className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-slate-900 leading-tight">
                              {activeProfessorData.professor_name}
                            </h3>
                            <p className="text-xs text-slate-500">
                              {activeProfessorData.professor_title || "University Faculty"} &bull;{" "}
                              <span className="font-medium text-indigo-600">
                                {activeProfessorData.total_slides} Lecture Presentation(s)
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="text-xs text-slate-400 font-medium">
                          Topic-wise Slides Directory
                        </div>
                      </div>

                      {/* Topic Groups */}
                      <div className="space-y-6">
                        {activeProfessorData.topics.map((group) => (
                          <div key={group.topic_name} className="space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
                              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                                {group.topic_name}
                              </h4>
                              <span className="text-[11px] px-2 py-0.2 rounded-full bg-slate-100 text-slate-500 font-medium">
                                {group.slides.length} {group.slides.length === 1 ? "deck" : "decks"}
                              </span>
                            </div>

                            {/* Slides Grid - Space-efficient cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {group.slides.map((slide) => (
                                <div
                                  key={slide.id}
                                  className="p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-xs transition bg-slate-50/50 flex flex-col justify-between gap-3"
                                >
                                  <div className="space-y-1.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="uppercase font-mono font-bold text-[10px] px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                                        {slide.file_type}
                                      </span>
                                      {slide.academic_year && (
                                        <span className="text-[10px] font-medium text-slate-400">
                                          {slide.semester ? `${slide.semester} • ` : ""}{slide.academic_year}
                                        </span>
                                      )}
                                    </div>
                                    <h5 className="font-semibold text-xs sm:text-sm text-slate-900 line-clamp-2 leading-snug">
                                      {slide.title}
                                    </h5>
                                    {slide.description && (
                                      <p className="text-[11px] text-slate-500 line-clamp-2">
                                        {slide.description}
                                      </p>
                                    )}
                                  </div>

                                  <div className="pt-2 border-t border-slate-200/80 flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-slate-400">
                                      {slide.download_count} downloads
                                    </span>

                                    <div className="flex items-center gap-1.5">
                                      {/* View button - Opens in browser PDF viewer with download button */}
                                      <button
                                        type="button"
                                        onClick={() => setInspectSlide(slide)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-2xs transition"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>View</span>
                                      </button>

                                      {/* Download button */}
                                      <a
                                        href={getSlideDownloadUrl(slide.id)}
                                        download
                                        className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 transition"
                                        title="Download Slide"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </a>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="py-12 text-center text-xs text-slate-500">
                      Select a professor from the list to view topic slides.
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== TAB 3: AI PYQ CHAT ASSISTANT ==================== */}
        {activeTab === "chat" && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[540px]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-blue-600 text-white rounded-xl">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Grounded KIIT PYQ AI Assistant
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ask naturally about any year, session, or syllabus topic — every answer cites the exact paper and page.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6 space-y-4 overflow-y-auto max-h-[480px]">
              {chatHistory.map((item, idx) => (
                <div
                  key={idx}
                  className={`flex ${item.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-3xl rounded-2xl p-4 text-xs sm:text-sm space-y-3 ${
                      item.role === "user"
                        ? "bg-blue-600 text-white"
                        : "bg-slate-50 border border-slate-200 text-slate-800"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{item.text}</p>

                    {item.data && item.data.citations.length > 0 && (
                      <div className="pt-2 border-t border-slate-200 space-y-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 block">
                          Verified Source Citations ({item.data.repeat_summary}):
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {item.data.citations.map((cit) => (
                            <button
                              key={cit.question_id}
                              type="button"
                              onClick={() => setInspectQuestionId(cit.question_id)}
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-white hover:bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-xs font-semibold shadow-2xs transition"
                            >
                              <FileCheck2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>
                                {cit.subject_code} {cit.exam_year} {cit.exam_type} &bull; {cit.question_number} (Page {cit.page_number})
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.data && item.data.suggested_followups.length > 0 && (
                      <div className="pt-1 flex flex-wrap gap-1.5">
                        {item.data.suggested_followups.map((fup, fIdx) => (
                          <button
                            key={fIdx}
                            type="button"
                            onClick={() => handleSendChat(fup)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-full text-[11px] font-medium border border-blue-200 transition"
                          >
                            {fup}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="text-xs text-slate-500 flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  <span>Searching published question bank and assembling cited answer...</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                placeholder="Ask e.g. 'Solve Q1 from 2024 midsem and tell me if it repeats'..."
                className="flex-1 h-11 px-4 bg-white border border-slate-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => handleSendChat()}
                disabled={chatLoading || !chatInput.trim()}
                className="h-11 px-5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl text-xs font-bold transition"
              >
                Send
              </button>
            </div>
          </div>
        )}

        {/* ==================== TAB 4: TOPIC WEIGHTAGE & SCORE PREDICTOR ==================== */}
        {activeTab === "analytics" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left Column: Topic Weightage Bars */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Syllabus Topic Weightage & Exam Frequency
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ranked by historical mark contribution across published question papers.
                  </p>
                </div>
                {analyticsData && (
                  <span className="px-3 py-1 bg-blue-50 text-blue-700 font-bold text-xs rounded-lg border border-blue-200">
                    {analyticsData.subject_code} &bull; {analyticsData.total_published_questions} Questions Indexed
                  </span>
                )}
              </div>

              {loadingAnalytics && (
                <div className="py-12 text-center text-xs text-slate-500">
                  Calculating syllabus weightage distribution...
                </div>
              )}

              {analyticsData && (
                <div className="space-y-4">
                  {analyticsData.topics.map((top) => {
                    const checked = Boolean(checkedTopics[top.topic_name]);
                    return (
                      <div
                        key={top.topic_name}
                        onClick={() =>
                          setCheckedTopics((prev) => ({
                            ...prev,
                            [top.topic_name]: !prev[top.topic_name],
                          }))
                        }
                        className={`p-3.5 rounded-xl border transition cursor-pointer ${
                          checked
                            ? "bg-blue-50/40 border-blue-300"
                            : "bg-slate-50/60 border-slate-200 hover:border-slate-300"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              className="w-4 h-4 text-blue-600 rounded border-slate-300"
                            />
                            <span className="font-bold text-sm text-slate-900">
                              {top.topic_name}
                            </span>
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                                top.priority_tier === "HIGH YIELD"
                                  ? "bg-rose-100 text-rose-800"
                                  : top.priority_tier === "CORE"
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {top.priority_tier}
                            </span>
                          </div>
                          <div className="text-xs font-bold text-blue-700">
                            {top.weightage_percent}% Weightage ({top.total_marks}M)
                          </div>
                        </div>

                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(6, top.weightage_percent * 2.2))}%` }}
                          />
                        </div>

                        {top.years_asked.length > 0 && (
                          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                            <span>Asked in: {top.years_asked.join(", ")}</span>
                            <span>{top.question_count} Past Question(s)</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right Column: Interactive Exam Score Predictor */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6 h-fit">
              <div className="border-b border-slate-100 pb-4">
                <h3 className="text-base font-bold text-slate-900">
                  Interactive Exam Score Predictor
                </h3>
                <p className="text-xs text-slate-500">
                  Tick the topics on the left that you have prepared. QueryQP weighs each topic by past exam frequency to estimate your score.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-center space-y-1">
                  <span className="text-[11px] font-bold uppercase text-amber-800">
                    Predicted Midsem
                  </span>
                  <div className="text-3xl font-extrabold text-amber-900">
                    {predictedMidsem} <span className="text-base font-semibold">/ 20</span>
                  </div>
                  <span className="text-[11px] text-amber-700 block">Marks Estimate</span>
                </div>

                <div className="p-4 rounded-2xl bg-purple-50 border border-purple-200 text-center space-y-1">
                  <span className="text-[11px] font-bold uppercase text-purple-800">
                    Predicted Endsem
                  </span>
                  <div className="text-3xl font-extrabold text-purple-900">
                    {predictedEndsem} <span className="text-base font-semibold">/ 50</span>
                  </div>
                  <span className="text-[11px] text-purple-700 block">Marks Estimate</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Historical Syllabus Weightage Covered</span>
                  <span className="text-blue-700">{clampedCoverage}%</span>
                </div>
                <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${clampedCoverage}%` }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 pt-1">
                  Focusing on HIGH YIELD topics first maximizes marks per hour of study.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!analyticsData) return;
                    const all: Record<string, boolean> = {};
                    analyticsData.topics.forEach((t) => (all[t.topic_name] = true));
                    setCheckedTopics(all);
                  }}
                  className="flex-1 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                >
                  Select All Topics
                </button>
                <button
                  type="button"
                  onClick={() => setCheckedTopics({})}
                  className="flex-1 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Source Viewer Modal */}
      <SourceViewerModal
        questionId={inspectQuestionId}
        onClose={() => setInspectQuestionId(null)}
      />

      {/* Slide Viewer Modal */}
      <SlideViewerModal
        slide={inspectSlide}
        onClose={() => setInspectSlide(null)}
      />

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-slate-400">
          QueryQP &bull; Previous Year Question Recommender, Lecture Slides &amp; AI Exam-Prep Suite &bull; School of Computer Engineering, KIIT University.
        </div>
      </footer>
    </div>
  );
}
