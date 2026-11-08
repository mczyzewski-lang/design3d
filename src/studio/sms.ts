// Wysyłka SMS (kody weryfikacyjne). Bramka: SMSAPI.pl — ustaw SMSAPI_TOKEN (i opcjonalnie SMSAPI_FROM, nazwa nadawcy).
// Bez tokenu działa tryb testowy: SMS nie jest wysyłany, kod wraca w odpowiedzi API i jest pokazywany na ekranie.

export interface SmsResult { sent: boolean; demo: boolean; error?: string }

export function smsConfigured(): boolean {
  return !!process.env.SMSAPI_TOKEN;
}

export async function sendSms(to: string, message: string): Promise<SmsResult> {
  const token = process.env.SMSAPI_TOKEN;
  if (!token) {
    console.log(`[sms:test] ${to}: ${message}`);
    return { sent: false, demo: true };
  }
  const body = new URLSearchParams({ to: to.replace(/^\+/, ''), message, format: 'json', encoding: 'utf-8' });
  if (process.env.SMSAPI_FROM) body.set('from', process.env.SMSAPI_FROM);
  try {
    const res = await fetch(process.env.SMSAPI_URL || 'https://api.smsapi.pl/sms.do', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: number; message?: string };
    if (!res.ok || data.error) return { sent: false, demo: false, error: data.message ?? `HTTP ${res.status}` };
    return { sent: true, demo: false };
  } catch (e) {
    return { sent: false, demo: false, error: (e as Error).message };
  }
}
