// Ocena linków tak, jak wybierałby je człowiek szukający kontaktu z firmą.

import { foldPl } from '../util/polish.ts';

export type PageType = 'home' | 'contact' | 'about' | 'offer' | 'gallery' | 'legal' | 'other';

export interface LinkCandidate {
  url: string;
  text: string;
  type: PageType;
  score: number;
}

const RULES: Array<[PageType, number, RegExp]> = [
  ['contact', 100, /(kontakt|contact|napisz-do-nas|dane-kontaktowe|gdzie-jestesmy|lokalizacja|dojazd|skontaktuj|biuro-obslugi)/],
  ['about', 75, /(o-nas|o-firmie|onas|ofirmie|about|kim-jestesmy|historia|nasza-firma|firma$|o-mnie|poznaj-nas)/],
  ['offer', 60, /(wycen|zamow|zapytanie|oferta|oferty|cennik|order|quote|konfigurator|zaprojektuj|kalkulator)/],
  ['gallery', 45, /(galeria|realizacje|portfolio|nasze-prace|projekty|zdjecia|gallery|referencje)/],
  ['other', 35, /(schody|produkty|produkcja|uslugi|balustrad|stairs)/],
  ['legal', 12, /(polityka-prywatnosci|regulamin|rodo|privacy|cookies|nota-prawna|impressum)/],
];

const TEXT_RULES: Array<[PageType, number, RegExp]> = [
  ['contact', 100, /^(kontakt|contact|kontakt z nami|napisz do nas|skontaktuj sie|dane kontaktowe|zadzwon)/],
  ['about', 75, /^(o nas|o firmie|about|kim jestesmy|nasza firma|firma|historia)/],
  ['offer', 60, /(wycena|darmowa wycena|bezplatna wycena|zamow|zapytanie ofertowe|oferta|cennik|konfigurator)/],
  ['gallery', 45, /(galeria|realizacje|portfolio|nasze prace|projekty)/],
  ['other', 35, /(schody|produkty|uslugi|balustrady)/],
  ['legal', 12, /(polityka prywatnosci|regulamin|rodo|cookies)/],
];

const SKIP = /(\/wp-admin|\/wp-login|\/wp-json|\/feed\/?$|\/xmlrpc|\/login|\/logowanie|\/rejestracja|\/koszyk|\/cart|\/checkout|\/moje-konto|\/my-account|\/tag\/|\/author\/|\/category\/|replytocom=|add-to-cart=|\/search|\?s=|\/cdn-cgi\/)/i;
const FILE_EXT = /\.(pdf|jpe?g|png|gif|webp|svg|zip|rar|7z|docx?|xlsx?|pptx?|mp4|mp3|avi|mov|dwg|xml|txt|ics|css|js)(\?|$)/i;
const FOREIGN_LANG = /^\/(en|de|ru|uk|ua|fr|it|es|cs|sk|nl|no|sv|da)(\/|$)/i;

export function shouldSkipUrl(url: string): boolean {
  return SKIP.test(url) || FILE_EXT.test(url);
}

export function classifyLink(url: string, text: string): { type: PageType; score: number } {
  let path = '';
  try {
    const u = new URL(url);
    path = foldPl(decodeURIComponent(u.pathname + u.search));
  } catch {
    path = foldPl(url);
  }
  const t = foldPl(text.replace(/\s+/g, ' ').trim()).slice(0, 80);
  let best: { type: PageType; score: number } = { type: 'other', score: 5 };
  for (const [type, score, re] of RULES) {
    if (re.test(path) && score > best.score) best = { type, score };
  }
  for (const [type, score, re] of TEXT_RULES) {
    if (re.test(t) && score + 2 > best.score) best = { type, score: score + 2 };
  }
  const depth = path.split('/').filter(Boolean).length;
  let score = best.score - Math.max(0, depth - 1) * 4;
  if (FOREIGN_LANG.test(path)) score -= 40;
  if (path === '/' || path === '') score = 0;
  return { type: best.type, score };
}

/** Typowe ścieżki stron kontaktowych sprawdzane, gdy na stronie nie ma linku do kontaktu. */
export const FALLBACK_CONTACT_PATHS = ['/kontakt', '/contact', '/kontakt.html'];
