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
import { LogoMark } from "../components/brand/LogoMark";
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
    <div className="min-h-screen bg-ground flex flex-col font-sans">
      {/* Top Navigation */}
      <header className="sticky top-0 z-40 border-b border-line bg-ground/85 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <LogoMark className="h-9 w-9 shrink-0" />
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-ink leading-none">
                QueryQP Intelligence
              </h1>
              <span className="text-xs text-ink-faint font-medium">
                KIIT PYQ Recommender, Lecture Slides &amp; AI Solver
              </span>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <Link
              href="/admin/login"
              className="inline-flex items-center space-x-1.5 text-xs font-semibold px-3.5 py-2 rounded-full text-ink-soft border border-line hover:border-line-strong hover:bg-raised hover:text-ink transition"
            >
              <Shield className="w-3.5 h-3.5 text-ink-faint" />
              <span>Admin Portal</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-7">
        {/* Hero Section */}
        <div className="relative isolate max-w-4xl pt-6 pb-10 space-y-4">
          <div aria-hidden className="ruled absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2" />
          <h2 className="text-4xl md:text-6xl font-semibold tracking-[-0.035em] leading-[1.04] text-ink text-balance">
            University Past Papers &amp; Professor Lecture Slides
          </h2>
          <p className="max-w-[60ch] text-base md:text-lg leading-relaxed text-ink-muted">
            Search verified previous year questions, access topic-wise professor presentation slides, get grounded AI step-by-step solutions, and discover syllabus topic exam weightage.
          </p>
          <p className="text-sm text-ink-faint">
            Okapi BM25 + BGE hybrid search, professor lecture slides and an AI step-by-step solver.
          </p>
        </div>

        {/* 4-Tab Feature Switcher: Search PYQs -> Slides -> AI Assistant -> Discover & Score Predictor */}
        <div className="flex flex-wrap items-center gap-1.5 w-fit max-w-full rounded-full border border-line bg-surface p-1.5">
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
                className={`inline-flex items-center space-x-2 px-4 py-2 rounded-full text-xs sm:text-sm font-semibold transition ${
                  isActive
                    ? "bg-primary text-ground"
                    : "text-ink-muted hover:bg-raised hover:text-ink"
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
          <div className="bg-surface rounded-2xl border border-line p-4 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <span className="text-xs font-semibold text-ink-muted">
                Active Course Subject:
              </span>
              <select
                value={effectiveAnalyticsSubjectId}
                onChange={(e) => {
                  setSelectedSubjectId(e.target.value);
                  setCheckedTopics({});
                }}
                className="h-10 px-3 bg-ground border border-line rounded-xl text-sm font-semibold text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code ? `[${s.code}] ` : ""}
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="text-xs text-ink-muted">
              All answers, solutions, and topic weightages are strictly grounded in reviewed university papers.
            </div>
          </div>
        )}

        {/* ==================== TAB 1: HYBRID SEARCH ==================== */}
        {activeTab === "search" && (
          <>
            <div className="bg-surface rounded-2xl border border-line p-5 md:p-7 space-y-5">
              <form onSubmit={handleSearchSubmit} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                  <div className="md:col-span-4">
                    <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                      Subject
                    </label>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(e.target.value)}
                      className="w-full h-12 px-3.5 bg-ground border border-line rounded-xl text-sm font-medium text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary transition"
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
                    <label className="block text-xs font-semibold text-ink-soft mb-1.5">
                      Topic or Question Query (Auto-Detects Year, Session & Q-No)
                    </label>
                    <div className="relative flex items-center">
                      <Search className="absolute left-4 w-5 h-5 text-ink-faint pointer-events-none" />
                      <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="e.g. explain banker's algorithm from 2024 midsem or Q1(a)"
                        className="w-full h-12 pl-11 pr-28 bg-ground border border-line rounded-xl text-sm text-ink placeholder-ink-faint focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary transition"
                      />
                      <button
                        type="submit"
                        disabled={searching || !query.trim()}
                        className="absolute right-1.5 px-4 h-9 bg-primary hover:bg-primary-hover disabled:bg-ink-dim text-ground rounded-lg text-xs font-semibold transition flex items-center space-x-1.5"
                      >
                        {searching ? (
                          <div className="w-4 h-4 border-2 border-ground border-t-transparent rounded-full animate-spin" />
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
                <div className="pt-2 border-t border-line-soft grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block text-ink-muted font-medium mb-1">Exam Type</label>
                    <div className="flex rounded-lg border border-line bg-ground p-1">
                      <button
                        type="button"
                        onClick={() => setExamType("")}
                        className={`flex-1 py-1 rounded text-center font-medium transition ${
                          examType === "" ? "bg-surface text-primary" : "text-ink-soft hover:text-ink"
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setExamType("MIDSEM")}
                        className={`flex-1 py-1 rounded text-center font-medium transition ${
                          examType === "MIDSEM" ? "bg-surface text-primary" : "text-ink-soft hover:text-ink"
                        }`}
                      >
                        Midsem
                      </button>
                      <button
                        type="button"
                        onClick={() => setExamType("ENDSEM")}
                        className={`flex-1 py-1 rounded text-center font-medium transition ${
                          examType === "ENDSEM" ? "bg-surface text-primary" : "text-ink-soft hover:text-ink"
                        }`}
                      >
                        Endsem
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-ink-muted font-medium mb-1">From Academic Year</label>
                    <input
                      type="number"
                      placeholder="e.g. 2020"
                      value={minYear}
                      onChange={(e) => setMinYear(e.target.value)}
                      className="w-full h-8 px-2.5 bg-ground border border-line rounded-lg text-xs text-ink focus:bg-raised focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>

                  <div>
                    <label className="block text-ink-muted font-medium mb-1">To Academic Year</label>
                    <input
                      type="number"
                      placeholder="e.g. 2026"
                      value={maxYear}
                      onChange={(e) => setMaxYear(e.target.value)}
                      className="w-full h-8 px-2.5 bg-ground border border-line rounded-lg text-xs text-ink focus:bg-raised focus:outline-none focus:ring-1 focus:ring-primary"
                    />
                  </div>
                </div>
              </form>

              {/* Quick Search Chips */}
              <div className="pt-2">
                <span className="text-xs text-ink-faint font-medium mr-2">Try searching:</span>
                <div className="inline-flex flex-wrap gap-1.5 mt-1">
                  {activeSuggestions.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => handleSuggestionClick(topic)}
                      className="px-2.5 py-1 text-xs rounded-full bg-raised hover:bg-primary/10 hover:text-primary text-ink-soft border border-line transition"
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
                  <div className="text-sm text-ink-soft">
                    {searchData?.message ? (
                      <span>{searchData.message}</span>
                    ) : (
                      <>
                        Found{" "}
                        <strong className="text-ink">
                          {searchData ? searchData.total_results : 0}
                        </strong>{" "}
                        questions for &quot;
                        <span className="font-semibold text-primary">{activeSearch.query}</span>&quot;
                      </>
                    )}
                  </div>
                </div>
              )}

              {searching && (
                <div className="space-y-4">
                  {[1, 2, 3].map((i) => (
                    <div key={i} className="p-6 bg-surface rounded-xl border border-line animate-pulse space-y-3">
                      <div className="h-5 bg-lift rounded w-1/4" />
                      <div className="h-4 bg-lift rounded w-3/4" />
                      <div className="h-4 bg-lift rounded w-1/2" />
                    </div>
                  ))}
                </div>
              )}

              {isError && (
                <div className="p-6 bg-red-500/10 border border-red-500/25 rounded-xl text-red-300 text-sm">
                  <p className="font-semibold">Search request failed</p>
                  <p className="mt-1 text-xs">{error instanceof Error ? error.message : "Internal error occurred"}</p>
                </div>
              )}

              {!searching && !activeSearch && (
                <div className="text-center py-14 bg-surface rounded-2xl border border-line/80 p-8 space-y-3">
                  <div className="w-12 h-12 bg-raised text-ink-soft rounded-full flex items-center justify-center mx-auto">
                    <HelpCircle className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-ink">
                    Ready to search previous examination papers
                  </h3>
                  <p className="text-xs text-ink-muted max-w-md mx-auto">
                    Search by topic or past question number above. You can also explore lecture presentation slides by university professors in the &ldquo;Professor Slides&rdquo; tab.
                  </p>
                </div>
              )}

              {!searching && activeSearch && searchData && searchData.results.length === 0 && (
                <div className="text-center py-14 bg-surface rounded-2xl border border-line p-8 space-y-3">
                  <div className="w-12 h-12 bg-amber-500/10 text-amber-400 rounded-full flex items-center justify-center mx-auto">
                    <Search className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-ink">No matching questions found</h3>
                  <p className="text-xs text-ink-muted max-w-md mx-auto">
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
                      className="group bg-surface rounded-2xl border border-line hover:hover:border-primary transition duration-150 p-6 sm:p-7 space-y-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-3.5 py-1 bg-primary/10 text-primary border border-primary/30 font-semibold text-xs sm:text-sm rounded-lg">
                            {q.question_number}
                          </span>

                          <span
                            className={`inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-lg border ${
                              q.exam_type === "MIDSEM"
                                ? "bg-amber-500/10 text-amber-300 border-amber-500/25"
                                : "bg-raised text-ink-soft border-line-strong"
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
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-amber-500/10 text-amber-300 hover:bg-amber-500/15 border border-amber-500/25 rounded-lg text-xs font-semibold transition"
                            >
                              <ImageIcon className="w-3.5 h-3.5 text-amber-400" />
                              <span>Diagram &bull; Inspect in Paper</span>
                            </button>
                          )}
                        </div>

                        {q.marks !== null && q.marks !== undefined && (
                          <div className="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-500/10 text-emerald-300 text-xs font-semibold rounded-md border border-emerald-500/25">
                            <Award className="w-3.5 h-3.5" />
                            <span>{q.marks} Marks</span>
                          </div>
                        )}
                      </div>

                      <div className="py-1">
                        <FormattedQuestionText text={q.question_text} query={activeSearch?.query} />
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-line-soft text-xs">
                        <div className="flex items-center space-x-2 text-ink-muted">
                          <FileCheck2 className="w-4 h-4 text-emerald-400" />
                          <span>
                            Original Paper:{" "}
                            <strong className="text-ink-soft">{q.source_filename}</strong> (Page{" "}
                            {q.page_number}
                            {q.page_end > q.page_number && `-${q.page_end}`})
                          </span>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => setInspectQuestionId(q.id)}
                            className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-raised hover:bg-primary/10 text-ink-soft hover:text-primary rounded-lg font-semibold transition"
                          >
                            <ImageIcon className="w-3.5 h-3.5 text-primary" />
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
            <div className="bg-surface rounded-2xl border border-line p-4 space-y-3">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                {/* Subject Dropdown & Quick Badges */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-ink-muted whitespace-nowrap">
                      Select Subject:
                    </span>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => {
                        setSelectedSubjectId(e.target.value);
                        setSelectedProfessorName("");
                      }}
                      className="h-10 px-3 bg-ground border border-line rounded-xl text-sm font-semibold text-ink focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary min-w-[220px]"
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
                            ? "bg-primary text-ground"
                            : "bg-raised hover:bg-line-strong text-ink-soft"
                        }`}
                      >
                        {s.code || s.name}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Filter input */}
                <div className="relative min-w-[220px] md:w-72">
                  <Search className="w-4 h-4 text-ink-faint absolute left-3 top-3 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter professor, topic, slides..."
                    value={slidesSearch}
                    onChange={(e) => setSlidesSearch(e.target.value)}
                    className="w-full h-10 pl-9 pr-3 bg-ground border border-line rounded-xl text-xs text-ink placeholder-ink-faint focus:bg-raised focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>
            </div>

            {/* Content: Split Layout (Professors on Left, Topic Slides on Right) */}
            {loadingSlides ? (
              <div className="p-12 text-center text-xs text-ink-muted flex flex-col items-center justify-center gap-2 bg-surface rounded-2xl border border-line">
                <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                <span>Loading university professor lecture slides...</span>
              </div>
            ) : professorsList.length === 0 ? (
              <div className="p-12 text-center bg-surface rounded-2xl border border-line space-y-3">
                <Presentation className="w-12 h-12 text-ink-dim mx-auto" />
                <h4 className="font-semibold text-ink">No slides found for this subject</h4>
                <p className="text-xs text-ink-muted max-w-md mx-auto">
                  No slides match the selected subject or search query. Choose another subject or upload slides via the Admin Portal.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                {/* Left: Alphabetical Professor List (Column 4 of 12) */}
                <div className="lg:col-span-4 bg-surface rounded-2xl border border-line p-4 space-y-3">
                  <div className="flex items-center justify-between pb-2 border-b border-line-soft">
                    <span className="text-xs font-semibold text-ink-muted">
                      University Professors ({professorsList.length})
                    </span>
                    <span className="text-[11px] text-primary font-semibold">
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
                              ? "bg-primary/10 border-primary/50 ring-1 ring-primary/40 text-ink"
                              : "bg-ground/60 hover:bg-lift/80 border-line text-ink-soft"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-9 h-9 rounded-xl flex items-center justify-center font-semibold text-xs shrink-0 ${
                                isSelected
                                  ? "bg-primary text-ground"
                                  : "bg-lift text-ink-soft"
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
                              <div className="text-[11px] text-ink-muted truncate mt-0.5">
                                {prof.professor_title || "University Faculty"}
                              </div>
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <span className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full bg-surface border border-line text-ink-soft shadow-2xs">
                              {prof.total_slides} slides
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Right: Selected Professor's Topic-wise Slides (Column 8 of 12) */}
                <div className="lg:col-span-8 bg-surface rounded-2xl border border-line p-5 space-y-5">
                  {activeProfessorData ? (
                    <>
                      {/* Professor Profile Header */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-line-soft">
                        <div className="flex items-center gap-3">
                          <div className="w-11 h-11 rounded-2xl bg-primary text-ground flex items-center justify-center font-semibold text-sm">
                            <GraduationCap className="w-6 h-6" />
                          </div>
                          <div>
                            <h3 className="text-base font-semibold text-ink leading-tight">
                              {activeProfessorData.professor_name}
                            </h3>
                            <p className="text-xs text-ink-muted">
                              {activeProfessorData.professor_title || "University Faculty"} &bull;{" "}
                              <span className="font-medium text-primary">
                                {activeProfessorData.total_slides} Lecture Presentation(s)
                              </span>
                            </p>
                          </div>
                        </div>

                        <div className="text-xs text-ink-faint font-medium">
                          Topic-wise Slides Directory
                        </div>
                      </div>

                      {/* Topic Groups */}
                      <div className="space-y-6">
                        {activeProfessorData.topics.map((group) => (
                          <div key={group.topic_name} className="space-y-3">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full bg-primary" />
                              <h4 className="text-xs font-semibold text-ink">
                                {group.topic_name}
                              </h4>
                              <span className="text-[11px] px-2 py-0.2 rounded-full bg-raised text-ink-muted font-medium">
                                {group.slides.length} {group.slides.length === 1 ? "deck" : "decks"}
                              </span>
                            </div>

                            {/* Slides Grid - Space-efficient cards */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {group.slides.map((slide) => (
                                <div
                                  key={slide.id}
                                  className="p-3.5 rounded-xl border border-line hover:border-primary/50 hover:transition bg-ground/50 flex flex-col justify-between gap-3"
                                >
                                  <div className="space-y-1.5">
                                    <div className="flex items-start justify-between gap-2">
                                      <span className="font-mono font-semibold text-[10px] px-1.5 py-0.5 rounded bg-raised text-ink-soft border border-line-strong">
                                        {slide.file_type}
                                      </span>
                                      {slide.academic_year && (
                                        <span className="text-[10px] font-medium text-ink-faint">
                                          {slide.semester ? `${slide.semester} • ` : ""}{slide.academic_year}
                                        </span>
                                      )}
                                    </div>
                                    <h5 className="font-semibold text-xs sm:text-sm text-ink line-clamp-2 leading-snug">
                                      {slide.title}
                                    </h5>
                                    {slide.description && (
                                      <p className="text-[11px] text-ink-muted line-clamp-2">
                                        {slide.description}
                                      </p>
                                    )}
                                  </div>

                                  <div className="pt-2 border-t border-line/80 flex items-center justify-between gap-2">
                                    <span className="text-[11px] text-ink-faint">
                                      {slide.download_count} downloads
                                    </span>

                                    <div className="flex items-center gap-1.5">
                                      {/* View button - Opens in browser PDF viewer with download button */}
                                      <button
                                        type="button"
                                        onClick={() => setInspectSlide(slide)}
                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary hover:bg-primary-hover text-ground shadow-2xs transition"
                                      >
                                        <Eye className="w-3.5 h-3.5" />
                                        <span>View</span>
                                      </button>

                                      {/* Download button */}
                                      <a
                                        href={getSlideDownloadUrl(slide.id)}
                                        download
                                        className="p-1.5 rounded-lg text-ink-soft hover:text-primary hover:bg-primary/10 border border-line transition"
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
                    <div className="py-12 text-center text-xs text-ink-muted">
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
          <div className="bg-surface rounded-2xl border border-line overflow-hidden flex flex-col min-h-[540px]">
            <div className="px-6 py-4 bg-ground border-b border-line flex items-center justify-between">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-primary text-ground rounded-xl">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Grounded KIIT PYQ AI Assistant
                  </h3>
                  <p className="text-xs text-ink-muted">
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
                        ? "bg-primary text-ground"
                        : "bg-ground border border-line text-ink"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{item.text}</p>

                    {item.data && item.data.citations.length > 0 && (
                      <div className="pt-2 border-t border-line space-y-2">
                        <span className="text-[11px] font-semibold text-ink-muted block">
                          Verified Source Citations ({item.data.repeat_summary}):
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {item.data.citations.map((cit) => (
                            <button
                              key={cit.question_id}
                              type="button"
                              onClick={() => setInspectQuestionId(cit.question_id)}
                              className="inline-flex items-center space-x-1.5 px-2.5 py-1 bg-surface hover:bg-primary/10 text-primary border border-primary/30 rounded-lg text-xs font-semibold shadow-2xs transition"
                            >
                              <FileCheck2 className="w-3.5 h-3.5 text-emerald-400" />
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
                            className="px-2.5 py-1 bg-primary/10 hover:bg-primary/15 text-primary rounded-full text-[11px] font-medium border border-primary/30 transition"
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
                <div className="text-xs text-ink-muted flex items-center space-x-2">
                  <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span>Searching published question bank and assembling cited answer...</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-ground border-t border-line flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSendChat()}
                placeholder="Ask e.g. 'Solve Q1 from 2024 midsem and tell me if it repeats'..."
                className="flex-1 h-11 px-4 bg-surface border border-line-strong rounded-xl text-sm text-ink focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <button
                type="button"
                onClick={() => handleSendChat()}
                disabled={chatLoading || !chatInput.trim()}
                className="h-11 px-5 bg-primary hover:bg-primary-hover disabled:bg-ink-dim text-ground rounded-xl text-xs font-semibold transition"
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
            <div className="lg:col-span-7 bg-surface rounded-2xl border border-line p-6 space-y-5">
              <div className="flex items-center justify-between border-b border-line-soft pb-4">
                <div>
                  <h3 className="text-base font-semibold text-ink">
                    Syllabus Topic Weightage & Exam Frequency
                  </h3>
                  <p className="text-xs text-ink-muted">
                    Ranked by historical mark contribution across published question papers.
                  </p>
                </div>
                {analyticsData && (
                  <span className="px-3 py-1 bg-raised text-ink-soft font-semibold text-xs rounded-lg border border-line-strong">
                    {analyticsData.subject_code} &bull; {analyticsData.total_published_questions} Questions Indexed
                  </span>
                )}
              </div>

              {loadingAnalytics && (
                <div className="py-12 text-center text-xs text-ink-muted">
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
                            ? "bg-primary/10 border-primary/50"
                            : "bg-ground/60 border-line hover:border-line-strong"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-1.5">
                          <div className="flex items-center space-x-2.5">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {}}
                              className="w-4 h-4 text-primary rounded border-line-strong"
                            />
                            <span className="font-semibold text-sm text-ink">
                              {top.topic_name}
                            </span>
                            <span
                              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                top.priority_tier === "HIGH YIELD"
                                  ? "bg-rose-500/15 text-rose-300"
                                  : top.priority_tier === "CORE"
                                  ? "bg-amber-500/15 text-amber-300"
                                  : "bg-lift text-ink-soft"
                              }`}
                            >
                              {top.priority_tier}
                            </span>
                          </div>
                          <div className="text-xs font-semibold text-primary">
                            {top.weightage_percent}% Weightage ({top.total_marks}M)
                          </div>
                        </div>

                        <div className="w-full h-2 bg-lift rounded-full overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full transition-all duration-300"
                            style={{ width: `${Math.min(100, Math.max(6, top.weightage_percent * 2.2))}%` }}
                          />
                        </div>

                        {top.years_asked.length > 0 && (
                          <div className="mt-2 flex items-center justify-between text-[11px] text-ink-muted">
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
            <div className="lg:col-span-5 bg-surface rounded-2xl border border-line p-6 space-y-6 h-fit">
              <div className="border-b border-line-soft pb-4">
                <h3 className="text-base font-semibold text-ink">
                  Interactive Exam Score Predictor
                </h3>
                <p className="text-xs text-ink-muted">
                  Tick the topics on the left that you have prepared. QueryQP weighs each topic by past exam frequency to estimate your score.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 text-center space-y-1">
                  <span className="text-[11px] font-semibold text-amber-300">
                    Predicted Midsem
                  </span>
                  <div className="text-3xl font-semibold text-amber-300">
                    {predictedMidsem} <span className="text-base font-semibold">/ 20</span>
                  </div>
                  <span className="text-[11px] text-amber-300 block">Marks Estimate</span>
                </div>

                <div className="p-4 rounded-2xl bg-raised border border-line-strong text-center space-y-1">
                  <span className="text-[11px] font-semibold text-primary">
                    Predicted Endsem
                  </span>
                  <div className="text-3xl font-semibold text-primary">
                    {predictedEndsem} <span className="text-base font-semibold">/ 50</span>
                  </div>
                  <span className="text-[11px] text-primary block">Marks Estimate</span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-ground border border-line space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold text-ink-soft">
                  <span>Historical Syllabus Weightage Covered</span>
                  <span className="text-primary">{clampedCoverage}%</span>
                </div>
                <div className="w-full h-3 bg-lift rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                    style={{ width: `${clampedCoverage}%` }}
                  />
                </div>
                <p className="text-[11px] text-ink-muted pt-1">
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
                  className="flex-1 py-2 text-xs font-semibold bg-raised hover:bg-line-strong text-ink-soft rounded-xl transition"
                >
                  Select All Topics
                </button>
                <button
                  type="button"
                  onClick={() => setCheckedTopics({})}
                  className="flex-1 py-2 text-xs font-semibold bg-raised hover:bg-line-strong text-ink-soft rounded-xl transition"
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
      <footer className="mt-auto border-t border-line bg-surface py-6">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-xs text-ink-faint">
          QueryQP &bull; Previous Year Question Recommender, Lecture Slides &amp; AI Exam-Prep Suite &bull; School of Computer Engineering, KIIT University.
        </div>
      </footer>
    </div>
  );
}
