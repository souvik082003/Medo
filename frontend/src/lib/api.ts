"use client";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
  is_active: boolean;
  llm_consent_granted: boolean;
  llm_consent_at?: string | null;
  created_at: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in_minutes: number;
  user: User;
}

export interface JobItem {
  id: string;
  source_name: string;
  title: string;
  company: string;
  location?: string | null;
  region?: string | null;
  description: string;
  salary_raw?: string | null;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string | null;
  salary_min_usd_eq?: number | null;
  job_type: string;
  work_mode: string;
  min_education?: string | null;
  seniority_level?: string | null;
  application_url: string;
  posted_at?: string | null;
  is_expired: boolean;
  current_version: number;
  created_at: string;
}

export interface JobSearchResult {
  job: JobItem;
  dense_score: number;
  bm25_score: number;
  rrf_score: number;
  rerank_score?: number | null;
  final_score: number;
}

export interface ExtractedSkill {
  canonical_name: string;
  slug: string;
  category: string;
  proficiency: string;
  extraction_method: string;
  confidence: number;
  evidence_span: string;
  source_section?: string | null;
}

export interface ResumeVersion {
  id: string;
  version_num: number;
  kind: string;
  filename: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_hash: string;
  is_primary: boolean;
  parsed_sections_json: Record<string, unknown>;
  created_at: string;
}

export interface UserPreferences {
  id: string;
  user_id: string;
  preferred_roles: string[];
  preferred_locations: string[];
  preferred_regions: string[];
  preferred_currency: string;
  min_salary?: number | null;
  work_modes: string[];
  job_types: string[];
  company_sizes: string[];
  exclude_keywords: string[];
  career_goals?: string | null;
  updated_at: string;
}

export interface CandidateProfile {
  id: string;
  user_id: string;
  headline?: string | null;
  summary?: string | null;
  years_experience?: number | null;
  seniority_level?: string | null;
  education_level?: string | null;
  current_location?: string | null;
  work_authorization?: string | null;
  target_roles_json: unknown[];
  completeness_score: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ProfileBundle {
  profile: CandidateProfile | null;
  preferences: UserPreferences | null;
  skills: ExtractedSkill[];
  resumes: ResumeVersion[];
}

export interface ResumeUploadResponse {
  resume: ResumeVersion;
  profile: CandidateProfile;
  extracted_skills: ExtractedSkill[];
  embedding_model: string;
  embedding_dim: number;
}

export interface RecommendationItem {
  job: JobItem;
  semantic_similarity: number;
  compatibility_probability: number;
  ranking_score: number;
  confidence: number;
  strong_matching_skills: string[];
  missing_skills: string[];
  experience_match: Record<string, unknown>;
  location_match: Record<string, unknown>;
  seniority_match: Record<string, unknown>;
  ranking_reasons: string[];
  llm_explanation?: string | null;
  model_version: string;
  training_data_provenance: string;
  computed_at: string;
}

export interface ApplicationItem {
  id: string;
  user_id: string;
  job_id: string;
  resume_version_id?: string | null;
  status: string;
  applied_at?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

export interface AnalyticsData {
  total_jobs: number;
  total_saved: number;
  total_applications: number;
  applications_by_status: Record<string, number>;
  jobs_by_source: Record<string, number>;
  top_candidate_skills: { name: string; category: string; confidence: number }[];
  avg_compatibility_probability?: number | null;
}

const TOKEN_KEY = "nexus_ai_token";
const USER_KEY = "nexus_ai_user";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function isTokenExpired(token: string): boolean {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return false;
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { exp?: number };
    if (typeof payload.exp !== "number") return false;
    return Date.now() >= (payload.exp - 15) * 1000;
  } catch {
    return false;
  }
}

export function getStoredUser(): User | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function setAuthSession(tokenRes: TokenResponse): void {
  localStorage.setItem(TOKEN_KEY, tokenRes.access_token);
  localStorage.setItem(USER_KEY, JSON.stringify(tokenRes.user));
}

export function clearAuthSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const configured = process.env.NEXT_PUBLIC_API_ORIGIN;
  if (configured) return `${configured.replace(/\/$/, "")}${path}`;
  if (typeof window !== "undefined" && window.location.port === "3000") {
    return `${window.location.protocol}//${window.location.hostname}:8000${path}`;
  }
  return path;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }

  const resp = await fetch(resolveApiUrl(path), { ...init, headers });
  const text = await resp.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }

  if (!resp.ok) {
    const errObj = parsed.error as { message?: string; code?: string } | undefined;
    const isAuthAttempt = path.startsWith("/api/v1/auth/login") || path.startsWith("/api/v1/auth/register");
    if (resp.status === 401 && !isAuthAttempt && typeof window !== "undefined") {
      clearAuthSession();
      if (!window.location.pathname.startsWith("/auth")) {
        window.location.replace("/auth?reason=expired");
      }
    }
    throw new Error(errObj?.message || `Request failed (${resp.status})`);
  }
  return parsed as T;
}
