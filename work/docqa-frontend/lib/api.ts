// Dynamically resolve API URL:
// In the browser, use relative paths ("/api/v1") when accessed remotely so that requests
// route through Nginx without CORS errors or localhost connection failures.
export const API_BASE = (function () {
  const envUrl = process.env.NEXT_PUBLIC_API_URL;
  if (typeof window !== "undefined") {
    const isLocalhost =
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (!isLocalhost && envUrl && (envUrl.includes("localhost") || envUrl.includes("127.0.0.1"))) {
      return "";
    }
    if (envUrl && envUrl.trim() !== "") {
      return envUrl.replace(/\/+$/, "");
    }
    return "";
  }
  if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
    return envUrl.replace(/\/+$/, "");
  }
  return "";
})();

export const API_V1 = `${API_BASE}/api/v1`;

// Token & User storage keys
const TOKEN_KEY = "pyq_admin_token";
const USER_KEY = "pyq_admin_user";

export function getAdminToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setAdminToken(token: string): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(TOKEN_KEY, token);
  }
}

export function getAdminUser(): AdminUser | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setAdminUser(user: AdminUser): void {
  if (typeof window !== "undefined") {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
}

export function clearAdminToken(): void {
  if (typeof window !== "undefined") {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  }
}

function getAuthHeaders(): HeadersInit {
  const token = getAdminToken();
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }
  return headers;
}

async function handleResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let errorDetail = `Request failed with status ${res.status}`;
    try {
      const err = await res.json();
      errorDetail = err.detail || err.message || errorDetail;
    } catch {
      // ignore json parse error
    }
    throw new Error(errorDetail);
  }
  return res.json() as Promise<T>;
}

// ----------------- Data Models -----------------

export interface AdminUser {
  id: string;
  username: string;
  role: string;
  is_active: boolean;
  must_change_password: boolean;
  full_name?: string | null;
  email?: string | null;
  last_login_at?: string | null;
  created_at?: string | null;
}

export interface Subject {
  id: string;
  name: string;
  code: string;
  department?: string | null;
  semester?: number | null;
  description?: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface QuestionPaper {
  id: string;
  batch_id: string;
  subject_id: string;
  subject_name?: string | null;
  subject_code?: string | null;
  exam_year: number;
  exam_type: "MIDSEM" | "ENDSEM";
  filename: string;
  page_count: number;
  parser_status: string;
  extraction_status: string;
  indexing_status: string;
  publication_status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
  error_message?: string | null;
  parser_version?: string | null;
  question_count: number;
  created_at: string;
  updated_at: string;
}

export interface Question {
  id: string;
  document_id: string;
  subject_id: string;
  subject_name?: string | null;
  subject_code?: string | null;
  exam_year: number;
  exam_type: string;
  source_filename: string;
  question_number: string;
  parent_question_id?: string | null;
  question_text: string;
  page_number: number;
  page_end: number;
  marks?: number | null;
  topics: string[];
  bbox?: number[] | null;
  review_status: "PENDING" | "APPROVED" | "FLAGGED";
  publication_status: "DRAFT" | "PUBLISHED" | "UNPUBLISHED";
  created_at: string;
  updated_at: string;
}

export interface QuestionSourceContext {
  question_id: string;
  question_number: string;
  document_id: string;
  filename: string;
  page_number: number;
  page_end: number;
  total_pages?: number;
  bbox?: number[] | null;
  exam_year: number;
  exam_type: string;
  subject_name: string;
  file_url: string;
  image_url: string;
}

export interface BatchItem {
  id: string;
  admin_id: string;
  status: "QUEUED" | "PROCESSING" | "COMPLETED" | "FAILED" | "PARTIAL";
  total_files: number;
  processed_files: number;
  failed_files: number;
  created_at: string;
  updated_at: string;
  documents?: QuestionPaper[];
}

export interface DashboardMetrics {
  total_papers: number;
  processed_papers: number;
  processing_papers: number;
  failed_papers: number;
  total_questions: number;
  published_questions: number;
  awaiting_review_questions: number;
  recent_batches: BatchItem[];
}

export interface SearchParams {
  query: string;
  subject_id?: string;
  min_year?: number;
  max_year?: number;
  from_year?: number;
  to_year?: number;
  exam_type?: string;
  page?: number;
  page_size?: number;
}

export interface SearchResponse {
  query: string;
  subject_id?: string | null;
  subject_name?: string | null;
  total_results: number;
  page: number;
  page_size: number;
  results: Question[];
  message?: string | null;
  filters_applied?: {
    subject_id?: string | null;
    subject_name?: string | null;
    from_year?: number | null;
    to_year?: number | null;
    exam_type?: string | null;
  } | null;
  pagination?: {
    page: number;
    page_size: number;
    total_results: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  } | null;
}


// ----------------- Auth & Admin Accounts API -----------------

export async function loginAdmin(username: string, password: string) {
  const res = await fetch(`${API_V1}/admin/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await handleResponse<{
    access_token: string;
    token_type: string;
    user_id: string;
    username: string;
    role: string;
    full_name?: string | null;
    must_change_password: boolean;
  }>(res);
  setAdminToken(data.access_token);
  setAdminUser({
    id: data.user_id,
    username: data.username,
    role: data.role || "admin",
    full_name: data.full_name,
    is_active: true,
    must_change_password: data.must_change_password ?? false,
  });
  return data;
}

export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string,
  confirmPassword: string
): Promise<{ message: string; must_change_password: boolean }> {
  const res = await fetch(`${API_V1}/admin/auth/change-password`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      current_password: currentPassword,
      new_password: newPassword,
      confirm_password: confirmPassword,
    }),
  });
  const data = await handleResponse<{ message: string; must_change_password: boolean }>(res);
  const currentUser = getAdminUser();
  if (currentUser) {
    currentUser.must_change_password = false;
    setAdminUser(currentUser);
  }
  return data;
}

export async function fetchCurrentAdmin(): Promise<AdminUser> {
  const res = await fetch(`${API_V1}/admin/me`, {
    headers: getAuthHeaders(),
  });
  const user = await handleResponse<AdminUser>(res);
  setAdminUser(user);
  return user;
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  const res = await fetch(`${API_V1}/admin/users`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<AdminUser[]>(res);
}

export async function createAdminUser(payload: {
  username: string;
  default_password: string;
  role?: string;
  full_name?: string;
  email?: string;
}): Promise<AdminUser> {
  const res = await fetch(`${API_V1}/admin/users`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AdminUser>(res);
}

export async function updateAdminUser(
  userId: string,
  payload: {
    role?: string;
    is_active?: boolean;
    full_name?: string;
    email?: string;
    reset_password?: string;
  }
): Promise<AdminUser> {
  const res = await fetch(`${API_V1}/admin/users/${userId}`, {
    method: "PATCH",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<AdminUser>(res);
}

export async function deleteAdminUser(userId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_V1}/admin/users/${userId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}


// ----------------- Dashboard & Admin API -----------------

export async function fetchDashboardMetrics(): Promise<DashboardMetrics> {
  const res = await fetch(`${API_V1}/admin/dashboard`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<DashboardMetrics>(res);
}

// ----------------- Subject API -----------------

export async function fetchSubjects(): Promise<Subject[]> {
  const res = await fetch(`${API_V1}/subjects`);
  return handleResponse<Subject[]>(res);
}

export async function fetchAdminSubjects(): Promise<Subject[]> {
  const res = await fetch(`${API_V1}/admin/subjects`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<Subject[]>(res);
}

export async function createSubject(payload: Partial<Subject>): Promise<Subject> {
  const res = await fetch(`${API_V1}/admin/subjects`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<Subject>(res);
}

export async function updateSubject(id: string, payload: Partial<Subject>): Promise<Subject> {
  const res = await fetch(`${API_V1}/admin/subjects/${id}`, {
    method: "PUT",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<Subject>(res);
}

export async function deleteSubjectPermanent(id: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_V1}/admin/subjects/${id}/permanent`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return handleResponse<{ status: string; message: string }>(res);
}

// ----------------- Batch & Ingestion API -----------------

export async function uploadBulkPapers(formData: FormData): Promise<BatchItem> {
  const res = await fetch(`${API_V1}/admin/documents/upload`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getAdminToken()}` },
    body: formData,
  });
  return handleResponse<BatchItem>(res);
}

export async function fetchBatches(skip = 0, limit = 20): Promise<BatchItem[]> {
  const res = await fetch(`${API_V1}/admin/batches?skip=${skip}&limit=${limit}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<BatchItem[]>(res);
}

export async function fetchBatchDetail(id: string): Promise<BatchItem> {
  const res = await fetch(`${API_V1}/admin/batches/${id}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<BatchItem>(res);
}

export async function deleteBatch(batchId: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_V1}/admin/batches/${batchId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return handleResponse<{ status: string; message: string }>(res);
}

export async function retryDocumentProcessing(documentId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_V1}/admin/documents/${documentId}/retry`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

export async function reprocessDocument(documentId: string): Promise<{ message: string }> {
  const res = await fetch(`${API_V1}/admin/documents/${documentId}/reprocess`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return handleResponse<{ message: string }>(res);
}

export async function deleteDocument(documentId: string): Promise<{ status: string; message: string }> {
  const res = await fetch(`${API_V1}/admin/documents/${documentId}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  return handleResponse<{ status: string; message: string }>(res);
}

export async function fetchDocuments(filters?: {
  subject_id?: string;
  exam_year?: number;
  exam_type?: string;
  publication_status?: string;
}): Promise<QuestionPaper[]> {
  const params = new URLSearchParams();
  if (filters?.subject_id) params.append("subject_id", filters.subject_id);
  if (filters?.exam_year) params.append("exam_year", filters.exam_year.toString());
  if (filters?.exam_type) params.append("exam_type", filters.exam_type);
  if (filters?.publication_status) params.append("publication_status", filters.publication_status);
  const res = await fetch(`${API_V1}/admin/documents?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<QuestionPaper[]>(res);
}

// ----------------- Question Bank Admin API -----------------

export interface QuestionFilters {
  document_id?: string;
  subject_id?: string;
  exam_year?: number;
  exam_type?: string;
  publication_status?: string;
  review_status?: string;
  search?: string;
  skip?: number;
  limit?: number;
}

export async function fetchAdminQuestions(filters: QuestionFilters = {}): Promise<Question[]> {
  const params = new URLSearchParams();
  if (filters.document_id) params.append("document_id", filters.document_id);
  if (filters.subject_id) params.append("subject_id", filters.subject_id);
  if (filters.exam_year) params.append("exam_year", filters.exam_year.toString());
  if (filters.exam_type) params.append("exam_type", filters.exam_type);
  if (filters.publication_status) params.append("publication_status", filters.publication_status);
  if (filters.review_status) params.append("review_status", filters.review_status);
  if (filters.search) params.append("search", filters.search);
  if (filters.skip !== undefined) params.append("skip", filters.skip.toString());
  if (filters.limit !== undefined) params.append("limit", filters.limit.toString());

  const res = await fetch(`${API_V1}/admin/questions?${params.toString()}`, {
    headers: getAuthHeaders(),
  });
  return handleResponse<Question[]>(res);
}

export async function updateQuestion(
  id: string,
  updates: Partial<Question> & { expected_updated_at?: string }
): Promise<Question> {
  const res = await fetch(`${API_V1}/admin/questions/${id}`, {
    method: "PATCH",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  return handleResponse<Question>(res);
}

export async function approveQuestion(id: string): Promise<Question> {
  const res = await fetch(`${API_V1}/admin/questions/${id}/approve`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return handleResponse<Question>(res);
}

export async function bulkApproveQuestions(questionIds: string[]): Promise<{ status: string; approved_count: number }> {
  const res = await fetch(`${API_V1}/admin/questions/bulk-approve`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ question_ids: questionIds }),
  });
  return handleResponse(res);
}

export async function approveAllDocumentQuestions(documentId: string): Promise<{ status: string; document_id: string; approved_count: number }> {
  const res = await fetch(`${API_V1}/admin/questions/document/${documentId}/approve-all`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}


export async function setQuestionPublication(id: string, publish: boolean): Promise<Question> {
  const endpoint = publish ? "publish" : "unpublish";
  const res = await fetch(`${API_V1}/admin/questions/${id}/${endpoint}`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return handleResponse<Question>(res);
}

export async function deleteQuestion(id: string): Promise<void> {
  const res = await fetch(`${API_V1}/admin/questions/${id}`, {
    method: "DELETE",
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error(`Failed to delete question with status ${res.status}`);
  }
}

export interface CreateQuestionPayload {
  document_id: string;
  question_number: string;
  question_text: string;
  marks?: number | null;
  page_number?: number;
  topics?: string[];
}

export interface SplitQuestionPart {
  question_number: string;
  question_text: string;
  marks?: number | null;
  topics?: string[];
  page_number?: number;
}

export async function createQuestion(payload: CreateQuestionPayload): Promise<Question> {
  const res = await fetch(`${API_V1}/admin/questions`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse<Question>(res);
}

export async function splitQuestion(questionId: string, parts: SplitQuestionPart[]): Promise<Question[]> {
  const res = await fetch(`${API_V1}/admin/questions/${questionId}/split`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ parts }),
  });
  return handleResponse<Question[]>(res);
}

// ----------------- Public Student Search API -----------------

export async function searchPYQs(params: SearchParams): Promise<SearchResponse> {
  const res = await fetch(`${API_V1}/search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  return handleResponse<SearchResponse>(res);
}

export async function fetchQuestionSource(id: string): Promise<QuestionSourceContext> {
  const res = await fetch(`${API_V1}/questions/${id}/source`);
  return handleResponse<QuestionSourceContext>(res);
}

export interface SearchSuggestionsResponse {
  subject_id?: string | null;
  subject_name?: string | null;
  suggestions: string[];
}

export async function getSearchSuggestions(subject_id?: string): Promise<SearchSuggestionsResponse> {
  const url = subject_id
    ? `${API_V1}/search/suggestions?subject_id=${encodeURIComponent(subject_id)}`
    : `${API_V1}/search/suggestions`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  return handleResponse<SearchSuggestionsResponse>(res);
}

export interface Topic {
  id: string;
  subject_id: string;
  name: string;
  parent_id?: string | null;
  question_count: number;
}

export async function getSubjectTopics(subject_id: string): Promise<Topic[]> {
  const res = await fetch(`${API_V1}/subjects/${encodeURIComponent(subject_id)}/topics`, {
    headers: { Accept: "application/json" },
  });
  return handleResponse<Topic[]>(res);
}

export async function triggerDocumentProcess(docId: string): Promise<any> {
  const res = await fetch(`${API_V1}/admin/documents/${docId}/process`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

export async function triggerBatchProcess(batchId: string): Promise<any> {
  const res = await fetch(`${API_V1}/admin/batches/${batchId}/process`, {
    method: "POST",
    headers: getAuthHeaders(),
  });
  return handleResponse(res);
}

