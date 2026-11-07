// Darmowa, deterministyczna klasyfikacja na podstawie treści strony.
// Działa zawsze (bez kluczy API). AI — jeśli włączone — może ją nadpisać.

import { foldPl } from '../util/polish.ts';
import type { Analysis, CompanyCategory, PageForAnalysis } from './types.ts';

const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;

const STAIR_TYPES: Array<[string, RegExp]> = [
  ['drewniane', /schod\w* drewnian|drewnian\w* schod|z drewna|debow\w* schod|jesionow/],
  ['stalowe', /schod\w* stalow|stalow\w* schod|konstrukcj\w* stalow|schod\w* metalow/],
  ['samonośne', /samonosn/],
  ['dywanowe', /dywanow/],
  ['zabiegowe', /zabiegow/],
  ['policzkowe', /policzkow/],
  ['wspornikowe', /wspornikow|wiszac\w* schod|lewitujac/],
  ['betonowe', /schod\w* betonow|betonow\w* schod|oblicowani\w* schod|okladzin\w* schod/],
  ['kręcone', /kreco|spiraln|slimakow/],
  ['szklane', /schod\w* szklan|szklan\w* stopni/],
  ['ażurowe', /azurow/],
  ['strychowe', /strychow/],
  ['modułowe', /modulow\w* schod/],
  ['zewnętrzne', /schod\w* zewnetrzn/],
];

export function heuristicAnalysis(pages: PageForAnalysis[]): Analysis {
  const all = pages.map((p) => `${p.title}\n${p.headings.join('\n')}\n${p.text}`).join('\n');
  const t = foldPl(all);
  const head = foldPl(pages.map((p) => `${p.title} ${p.headings.join(' ')}`).join(' '));
  const home = pages.find((p) => p.type === 'home');
  const homeHead = foldPl(home ? `${home.title} ${home.headings.slice(0, 8).join(' ')}` : '');

  const stairsBody = count(t, /schod/g);
  const stairsHead = count(head, /schod/g);
  const stairsFocus = count(homeHead, /schod/g) > 0;

  const manuf = count(t, /(producent|produkujemy|produkcj|wytwarzamy|wytworni|wlasn\w* produkcj|zaklad\w* produkcyjn|stolarni|park maszynow|maszyn\w* cnc|\bcnc\b|warsztat|wykonujemy schod|projektujemy i wykonujemy|wykonawstwo schod|tworzymy schody)/g);
  const install = count(t, /(montaz|montujemy|instalacj|monter|zabudow\w* schod)/g);
  const custom = count(t, /(na wymiar|na zamowienie|indywidualn\w* (projekt|zamowien|potrzeb)|wedlug projektu|dopasowan\w* do|projekt indywidualny|kazde schody projektujemy)/g);
  const wholesale = count(t, /(hurtowni|hurtow|dystrybutor|dystrybucj|importer|sprzedaz hurtow|dla hurtowni|sklep internetowy|do koszyka|dodaj do koszyka|cena brutto|w magazynie)/g);
  const construction = count(t, /(uslugi budowlan|firma budowlan|generalny wykonawc|budow\w* dom|remont|wykonczen\w* wnetrz|elewacj|dach|kostk\w* brukow|instalacj\w* (elektryczn|hydrauliczn)|stan surowy|docieplen|tynk|glazur|posadzk)/g);
  const subcontractor = count(t, /(podwykonawc|montujemy schody (innych|producent)|montaz schodow (zakupionych|gotowych))/g);

  const stair_types = STAIR_TYPES.filter(([, re]) => re.test(t)).map(([n]) => n);

  const configLinks = pages.flatMap((p) => p.signals?.configuratorLinks ?? []);
  const configScripts = pages.flatMap((p) => p.signals?.configuratorScripts ?? []);
  const configText = /(konfigurator|zaprojektuj (swoje )?schody online|kreator schodow)/.test(t);
  const has3d = configScripts.length > 0 || pages.some((p) => (p.signals?.iframes ?? []).some((s) => /(sketchfab|roomle|configurator|konfigurator|3d)/i.test(s)));
  const configurator_quality: Analysis['configurator_quality'] = has3d && (configText || configLinks.length) ? 'advanced_3d' : configLinks.length || configText ? 'basic' : 'none';

  const has_gallery = pages.some((p) => p.type === 'gallery') || /(galeria|realizacje|nasze realizacje|portfolio)/.test(t);
  const online_quote = /(wycen\w* online|bezplatn\w* wycen|darmow\w* wycen|zapytanie ofertowe|formularz wyceny|wyslij zapytanie|zapytaj o wycen|wycena w \d+|popros o wycen|wycena)/.test(t) || pages.some((p) => p.hasContactForm);
  const has_own_visualizations = /(wizualizacj|projekt 3d|projekty 3d|render|model 3d|projekt schodow)/.test(t);

  let category: CompanyCategory;
  let confidence = 0.55;
  const stairsStrong = stairsHead >= 2 || stairsFocus || stairsBody >= 8;
  // firma budowlana zwykle wspomina o schodach raz, jako o jednej z wielu usług
  const stairsAny = stairsBody >= 2 || (stairsBody >= 1 && construction >= 3);

  if (!stairsAny) {
    category = 'unrelated';
    confidence = 0.75;
  } else if (wholesale >= 4 && wholesale > manuf * 1.5) {
    category = 'wholesale';
  } else if (stairsStrong && manuf >= 2) {
    category = install >= 1 ? 'manufacturer_installer' : 'manufacturer';
    confidence = Math.min(0.9, 0.6 + manuf * 0.04);
  } else if (stairsStrong && (install >= 1 || subcontractor >= 1) && manuf === 0) {
    category = 'installer';
  } else if (construction >= 4 && !stairsStrong) {
    category = 'construction';
    confidence = 0.65;
  } else if (stairsStrong && custom >= 1) {
    category = 'manufacturer_installer';
    confidence = 0.5;
  } else if (!stairsStrong && construction >= 2) {
    category = 'construction';
  } else {
    category = 'unknown';
    confidence = 0.35;
  }

  const potential: Analysis['configurator_3d_potential'] =
    ['manufacturer', 'manufacturer_installer'].includes(category) && configurator_quality !== 'advanced_3d'
      ? (custom > 0 ? 'high' : 'medium')
      : category === 'installer' || category === 'construction' ? 'low' : configurator_quality === 'advanced_3d' ? 'low' : 'low';

  const reasons: string[] = [];
  reasons.push(`Wzmianki o schodach: ${stairsBody} (w nagłówkach: ${stairsHead}).`);
  if (manuf) reasons.push(`Sygnały własnej produkcji: ${manuf}.`);
  if (install) reasons.push(`Montaż: ${install}.`);
  if (custom) reasons.push('Realizacje na wymiar/zamówienie.');
  if (wholesale >= 2) reasons.push(`Sygnały handlu/hurtu: ${wholesale}.`);
  if (construction >= 2) reasons.push(`Usługi budowlane: ${construction}.`);
  if (configurator_quality !== 'none') reasons.push(`Konfigurator: ${configurator_quality}.`);

  return {
    category,
    stair_types,
    custom_made: custom > 0,
    has_own_visualizations,
    has_online_configurator: configurator_quality !== 'none',
    configurator_quality,
    has_gallery,
    online_quote,
    configurator_3d_potential: potential,
    confidence: Math.round(confidence * 100) / 100,
    reasoning: `[heurystyka] ${reasons.join(' ')}`,
    source_urls: pages.map((p) => p.url).slice(0, 8),
  };
}
