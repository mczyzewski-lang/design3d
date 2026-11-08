// Klient API Stair Studio (serwer Express, /api/studio). Ciasteczka sesji są HttpOnly — wysyłane automatycznie.
import type { Config, Vec3 } from '../engine/types';

export interface VersionInfo { version: number; label: string; created_at: string; updated_at: string }
export interface ProjectDto { id: string; name: string; currentVersion: number; updatedAt: string; config: Config; versions: VersionInfo[]; shareToken?: string | null; contractors?: ContractorDto[]; role?: string }
export interface ContractorDto { first_name: string; last_name: string; email: string; phone: string; first_at: string; last_at: string }
export interface CommentDto { id: number; version: number; author_role: 'owner' | 'contractor'; author_name: string; text: string; pos: Vec3 | null; resolved: boolean; created_at: string }
export interface ShareDto { projectId?: string; name: string; config: Config; currentVersion: number; role: 'owner' | 'contractor' | 'none'; viewer: { name: string } | null; consentText: string; leadsText: string; thumbnail: string | null }
export interface ContractorForm { fullName: string; companyName: string; email: string; phone: string; consent: boolean; leads: boolean; postalCode: string; radiusKm: string }
export interface QuoteForm { name: string; email: string; phone: string; postalCode: string; radiusKm: string; consent: boolean; contractorIds: number[] }
export interface NearbyContractor { id: number; name: string; place: string; distanceKm: number; radiusKm: number; servesArea: boolean }
export interface NearbyDto { origin: { code: string; place: string; precision: 'exact' | 'near' | 'area' }; radiusKm: number; results: NearbyContractor[] }
export type QuoteStatus = 'new' | 'in_progress' | 'sent' | 'won' | 'lost';
export interface CrmQuote {
  projectId: string; token: string | null; projectName: string; title: string; shape: string; postalCode: string | null;
  owner: { name: string; phone: string | null; email: string | null }; receivedAt: string; lastOpenedAt: string; comments: number;
  status: QuoteStatus; amount: number | null; note: string | null; isNew: boolean; updatedAt: string | null;
  history: CrmHistoryItem[];
}
export interface CrmHistoryItem { at: string; type: string; text: string }
export interface CrmNotification extends CrmHistoryItem { title: string; projectId: string; token: string | null; unread: boolean }
export interface CrmContact { key: string; name: string; phone: string | null; email: string | null; quotes: number; last: string; projectIds: string[] }
export interface CrmMe { firstName: string; lastName: string; companyName: string | null; email: string; phone: string; postalCode: string | null; radiusKm: number | null; leads: boolean; listed: boolean; since: string }
export interface CrmOverview { me: CrmMe; quotes: CrmQuote[]; contacts: CrmContact[]; leadsText: string; unread: number }
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
  quoteRequest: (id: string, form: QuoteForm) =>
    call<{ ok: true; nearby: number; selected: number }>(`/projects/${id}/quote-request`, 'POST', form),
  nearby: (postal: string, radius: number) => call<NearbyDto>(`/contractors/nearby?postal=${encodeURIComponent(postal)}&radius=${radius}`),
  crmOverview: () => call<CrmOverview>('/contractor/overview'),
  crmUpdateMe: (b: { companyName: string; phone: string; postalCode: string; radiusKm: string; leads: boolean }) => call<{ ok: true }>('/contractor/me', 'PATCH', b),
  crmUpdateQuote: (projectId: string, b: { status?: QuoteStatus; amount?: string | number | null; note?: string }) => call<{ ok: true }>(`/contractor/quotes/${projectId}`, 'PUT', b),
  crmNotifications: () => call<{ items: CrmNotification[]; seenAt: string | null }>('/contractor/notifications'),
  crmNotificationsSeen: () => call<{ ok: true }>('/contractor/notifications/seen', 'POST'),
  crmViewed: (projectId: string) => call<{ ok: true }>(`/contractor/quotes/${projectId}/viewed`, 'POST'),
  me: () => call<{ owner: boolean; phone: string | null; person: { firstName: string; lastName: string } | null; smsTest: boolean; contractor: { name: string; email: string } | null; texts: { consent: string; leads: string; quote: string; phone: string } }>('/me'),
  phoneStart: (form: { phone: string; fullName: string; consent: boolean }) => call<{ ok: true; phone: string; test: boolean; testCode?: string }>('/phone/start', 'POST', form),
  loginStart: (role: 'contractor' | 'owner', phone: string) => call<{ ok: true; phone: string; test: boolean; testCode?: string }>('/login/start', 'POST', { role, phone }),
  loginVerify: (role: 'contractor' | 'owner', phone: string, code: string) => call<{ ok: true; role: string; claimed?: number; name?: string }>('/login/verify', 'POST', { role, phone, code }),
  logout: () => call<{ ok: true }>('/logout', 'POST'),
  phoneVerify: (phone: string, code: string) => call<{ ok: true; phone: string; claimed: number }>('/phone/verify', 'POST', { phone, code }),
  comments: (ref: { projectId?: string | null; shareToken?: string | null; owner: boolean }) =>
    call<CommentDto[]>(ref.owner && ref.projectId ? `/projects/${ref.projectId}/comments` : `/shares/${ref.shareToken}/comments`),
  addComment: (ref: { projectId?: string | null; shareToken?: string | null; owner: boolean }, text: string, pos: Vec3 | null) =>
    call<CommentDto>(ref.owner && ref.projectId ? `/projects/${ref.projectId}/comments` : `/shares/${ref.shareToken}/comments`, 'POST', { text, pos }),
  resolveComment: (projectId: string, id: number, resolved: boolean) => call<CommentDto[]>(`/projects/${projectId}/comments/${id}`, 'PATCH', { resolved }),
};
