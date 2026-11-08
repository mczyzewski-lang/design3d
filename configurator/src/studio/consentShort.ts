// Skrót długiej treści zgody (bez Reacta — używany także na lekkim landingu).
/** „Wyrażam zgodę na przetwarzanie moich danych (imię, …” → „Wyrażam zgodę na przetwarzanie moich danych…” */
export function consentShort(text: string): string {
  const cuts = [' (', ',', ' i wyrażam', ' oraz', ' przez design3d', ' w celu'].map((c) => text.indexOf(c)).filter((i) => i > 20);
  if (cuts.length) return `${text.slice(0, Math.min(...cuts)).trim()}…`;
  const words = text.split(/\s+/);
  return words.length > 7 ? `${words.slice(0, 7).join(' ')}…` : text;
}
