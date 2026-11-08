// Klient API Stair Studio (serwer Express, /api/studio). Ciasteczka sesji są HttpOnly — wysyłane automatycznie.
import type { Config, Vec3 } from '../engine/types';

export interface VersionInfo { version: number; label: string; created_at: string; updated_at: string }
export interface ProjectDto { id: string; name: string; currentVersion: number; updatedAt: string; config: Config; versions: VersionInfo[]; shareToken?: string | null; contractors?: ContractorDto[]; role?: string }
export interface ContractorDto { first_name: string; last_name: string; email: string; phone: string; first_at: string; last_at: string }
export interface CommentDto { id: number; version: number; author_role: 'owner' | 'contractor'; author_name: string; text: string; pos: Vec3 | null; resolved: boolean; created_at: string }
export interface ShareDto { projectId?: string; name: string; config: Config; currentVersion: number; role: 'owner' | 'contractor' | 'none'; viewer: { name: string } | null; consentText: string; leadsText: string; thumbnail: string | null }
export interface ContractorForm { firstName: string; lastName: string; email: string; phone: string; consent: boolean; leads: boolean; postalCode: string; radiusKm: string }
export interface ProjectListItem { id: string; name: string; current_version: number; updated_at: string }

export class ApiError extends Error {
  readonly status: number;
  readonly errors?: string[];
  constructor(message: string, status: number, errors?: string[]) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

async function call<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`/api/studio${path}`, {
    method,
    credentials: 'same-origin',
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new ApiError(data?.error ?? `Błąd ${res.status}`, res.status, data?.errors);
  return data as T;
}

export const api = {
  createProject: (name: string, config: Config, source?: string) => call<ProjectDto>('/projects', 'POST', { name, config, source }),
  listProjects: () => call<ProjectListItem[]>('/projects'),
  getProject: (id: string) => call<ProjectDto>(`/projects/${id}`),
  getVersion: (id: string, v: number) => call<{ version: number; label: string; config: Config }>(`/projects/${id}/versions/${v}`),
  save: (id: string, config: Config, version: number, name?: string) => call<ProjectDto>(`/projects/${id}`, 'PUT', { config, version, name }),
  saveVersion: (id: string, config: Config, label?: string) => call<ProjectDto>(`/projects/${id}/versions`, 'POST', { config, label }),
  share: (id: string) => call<{ token: string; path: string }>(`/projects/${id}/share`, 'POST'),
  ownerLink: (id: string) => call<{ path: string }>(`/projects/${id}/owner-link`, 'POST'),
  claim: (projectId: string, token: string) => call<{ ok: true }>('/claim', 'POST', { projectId, token }),
  getShare: (token: string, via?: string) => call<ShareDto>(`/shares/${token}${via ? `?via=${via}` : ''}`),
  putThumbnail: (id: string, image: string) => call<{ ok: true }>(`/projects/${id}/thumbnail`, 'PUT', { image }),
  thumbnailUrl: (token: string, v: string) => `/api/studio/shares/${token}/thumbnail?v=${encodeURIComponent(v)}`,
  registerContractor: (token: string, form: ContractorForm, via?: string) =>
    call<{ role: 'contractor'; viewer: { name: string } }>(`/shares/${token}/contractor`, 'POST', { ...form, via }),
  joinAsContractor: (form: Omit<ContractorForm, 'consent'> & { source?: string }) => call<{ ok: true }>('/contractors', 'POST', form),
  quoteRequest: (id: string, form: { name: string; email: string; phone: string; postalCode: string; radiusKm: string; consent: boolean }) =>
    call<{ ok: true; nearby: number }>(`/projects/${id}/quote-request`, 'POST', form),
  me: () => call<{ owner: boolean; contractor: { name: string; email: string } | null; texts: { consent: string; leads: string; quote: string } }>('/me'),
  comments: (ref: { projectId?: string | null; shareToken?: string | null; owner: boolean }) =>
    call<CommentDto[]>(ref.owner && ref.projectId ? `/projects/${ref.projectId}/comments` : `/shares/${ref.shareToken}/comments`),
  addComment: (ref: { projectId?: string | null; shareToken?: string | null; owner: boolean }, text: string, pos: Vec3 | null) =>
    call<CommentDto>(ref.owner && ref.projectId ? `/projects/${ref.projectId}/comments` : `/shares/${ref.shareToken}/comments`, 'POST', { text, pos }),
  resolveComment: (projectId: string, id: number, resolved: boolean) => call<CommentDto[]>(`/projects/${projectId}/comments/${id}`, 'PATCH', { resolved }),
};
