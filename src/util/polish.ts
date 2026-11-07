// Dane i narzędzia specyficzne dla Polski.

export const VOIVODESHIPS = [
  'dolnośląskie', 'kujawsko-pomorskie', 'lubelskie', 'lubuskie', 'łódzkie', 'małopolskie',
  'mazowieckie', 'opolskie', 'podkarpackie', 'podlaskie', 'pomorskie', 'śląskie',
  'świętokrzyskie', 'warmińsko-mazurskie', 'wielkopolskie', 'zachodniopomorskie',
] as const;

/** Miasta używane do generowania zapytań oraz rozpoznawania lokalizacji: [nazwa, województwo]. */
export const CITIES: Array<[string, string]> = [
  ['Warszawa', 'mazowieckie'], ['Kraków', 'małopolskie'], ['Łódź', 'łódzkie'], ['Wrocław', 'dolnośląskie'],
  ['Poznań', 'wielkopolskie'], ['Gdańsk', 'pomorskie'], ['Szczecin', 'zachodniopomorskie'],
  ['Bydgoszcz', 'kujawsko-pomorskie'], ['Lublin', 'lubelskie'], ['Białystok', 'podlaskie'],
  ['Katowice', 'śląskie'], ['Gdynia', 'pomorskie'], ['Częstochowa', 'śląskie'], ['Radom', 'mazowieckie'],
  ['Toruń', 'kujawsko-pomorskie'], ['Sosnowiec', 'śląskie'], ['Rzeszów', 'podkarpackie'], ['Kielce', 'świętokrzyskie'],
  ['Gliwice', 'śląskie'], ['Olsztyn', 'warmińsko-mazurskie'], ['Zabrze', 'śląskie'], ['Bielsko-Biała', 'śląskie'],
  ['Bytom', 'śląskie'], ['Zielona Góra', 'lubuskie'], ['Rybnik', 'śląskie'], ['Ruda Śląska', 'śląskie'],
  ['Opole', 'opolskie'], ['Tychy', 'śląskie'], ['Gorzów Wielkopolski', 'lubuskie'], ['Elbląg', 'warmińsko-mazurskie'],
  ['Płock', 'mazowieckie'], ['Dąbrowa Górnicza', 'śląskie'], ['Wałbrzych', 'dolnośląskie'], ['Włocławek', 'kujawsko-pomorskie'],
  ['Tarnów', 'małopolskie'], ['Chorzów', 'śląskie'], ['Koszalin', 'zachodniopomorskie'], ['Kalisz', 'wielkopolskie'],
  ['Legnica', 'dolnośląskie'], ['Grudziądz', 'kujawsko-pomorskie'], ['Jaworzno', 'śląskie'], ['Słupsk', 'pomorskie'],
  ['Jastrzębie-Zdrój', 'śląskie'], ['Nowy Sącz', 'małopolskie'], ['Jelenia Góra', 'dolnośląskie'], ['Siedlce', 'mazowieckie'],
  ['Mysłowice', 'śląskie'], ['Konin', 'wielkopolskie'], ['Piła', 'wielkopolskie'], ['Piotrków Trybunalski', 'łódzkie'],
  ['Inowrocław', 'kujawsko-pomorskie'], ['Lubin', 'dolnośląskie'], ['Ostrów Wielkopolski', 'wielkopolskie'],
  ['Suwałki', 'podlaskie'], ['Stargard', 'zachodniopomorskie'], ['Gniezno', 'wielkopolskie'], ['Ostrowiec Świętokrzyski', 'świętokrzyskie'],
  ['Siemianowice Śląskie', 'śląskie'], ['Głogów', 'dolnośląskie'], ['Pabianice', 'łódzkie'], ['Leszno', 'wielkopolskie'],
  ['Żory', 'śląskie'], ['Zamość', 'lubelskie'], ['Pruszków', 'mazowieckie'], ['Łomża', 'podlaskie'], ['Ełk', 'warmińsko-mazurskie'],
  ['Tomaszów Mazowiecki', 'łódzkie'], ['Chełm', 'lubelskie'], ['Mielec', 'podkarpackie'], ['Kędzierzyn-Koźle', 'opolskie'],
  ['Przemyśl', 'podkarpackie'], ['Stalowa Wola', 'podkarpackie'], ['Tczew', 'pomorskie'], ['Biała Podlaska', 'lubelskie'],
  ['Bełchatów', 'łódzkie'], ['Świdnica', 'dolnośląskie'], ['Będzin', 'śląskie'], ['Zgierz', 'łódzkie'], ['Piekary Śląskie', 'śląskie'],
  ['Racibórz', 'śląskie'], ['Legionowo', 'mazowieckie'], ['Ostrołęka', 'mazowieckie'], ['Świętochłowice', 'śląskie'],
  ['Wejherowo', 'pomorskie'], ['Zawiercie', 'śląskie'], ['Starachowice', 'świętokrzyskie'], ['Skierniewice', 'łódzkie'],
  ['Kutno', 'łódzkie'], ['Nowy Targ', 'małopolskie'], ['Krosno', 'podkarpackie'], ['Sanok', 'podkarpackie'], ['Oświęcim', 'małopolskie'],
  ['Wadowice', 'małopolskie'], ['Zakopane', 'małopolskie'], ['Myślenice', 'małopolskie'], ['Limanowa', 'małopolskie'],
  ['Września', 'wielkopolskie'], ['Śrem', 'wielkopolskie'], ['Swarzędz', 'wielkopolskie'], ['Luboń', 'wielkopolskie'],
  ['Sopot', 'pomorskie'], ['Kościerzyna', 'pomorskie'], ['Bolesławiec', 'dolnośląskie'], ['Oleśnica', 'dolnośląskie'],
];

const CITY_INDEX = new Map(CITIES.map(([c, v]) => [foldPl(c), v]));

/** Przybliżone mapowanie 2 pierwszych cyfr kodu pocztowego na województwo (prefiksy niejednoznaczne pominięto). */
const POSTAL_PREFIX: Record<string, string> = {};
const ranges: Array<[number, number, string]> = [
  [0, 9, 'mazowieckie'], [10, 14, 'warmińsko-mazurskie'], [15, 18, 'podlaskie'], [20, 24, 'lubelskie'],
  [25, 25, 'świętokrzyskie'], [28, 29, 'świętokrzyskie'], [30, 33, 'małopolskie'], [35, 38, 'podkarpackie'],
  [40, 44, 'śląskie'], [45, 49, 'opolskie'], [50, 59, 'dolnośląskie'], [60, 64, 'wielkopolskie'], [65, 68, 'lubuskie'],
  [70, 75, 'zachodniopomorskie'], [78, 78, 'zachodniopomorskie'], [80, 84, 'pomorskie'], [85, 88, 'kujawsko-pomorskie'],
  [90, 99, 'łódzkie'],
];
for (const [a, b, v] of ranges) for (let i = a; i <= b; i++) POSTAL_PREFIX[String(i).padStart(2, '0')] = v;

export function foldPl(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ł/g, 'l')
    .trim();
}

export function voivodeshipFor(city: string | null | undefined, postalCode?: string | null): string | null {
  if (city) {
    const v = CITY_INDEX.get(foldPl(city));
    if (v) return v;
  }
  if (postalCode && /^\d{2}-\d{3}$/.test(postalCode)) return POSTAL_PREFIX[postalCode.slice(0, 2)] ?? null;
  return null;
}

/** Walidacja NIP (suma kontrolna). Zwraca 10 cyfr lub null. */
export function normalizeNip(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const d = raw.replace(/^PL/i, '').replace(/[^\d]/g, '');
  if (d.length !== 10) return null;
  if (/^(\d)\1{9}$/.test(d)) return null;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const sum = w.reduce((acc, wi, i) => acc + wi * Number(d[i]), 0) % 11;
  if (sum === 10 || sum !== Number(d[9])) return null;
  return d;
}

const MOBILE_PREFIXES = new Set(['45', '50', '51', '53', '57', '60', '66', '69', '72', '73', '78', '79', '88']);

/** Normalizuje polski numer telefonu do "+48 XXX XXX XXX". */
export function normalizePlPhone(raw: string): string | null {
  let d = raw.replace(/[^\d+]/g, '');
  if (d.startsWith('00')) d = '+' + d.slice(2);
  if (d.startsWith('+')) {
    if (!d.startsWith('+48')) return null; // tylko PL w MVP
    d = d.slice(3);
  } else if (d.startsWith('48') && d.length === 11) {
    d = d.slice(2);
  }
  d = d.replace(/^0(?=\d{9}$)/, '');
  if (!/^\d{9}$/.test(d)) return null;
  if (/^(\d)\1{8}$/.test(d)) return null;
  if (!/^[1-9]/.test(d)) return null;
  if (MOBILE_PREFIXES.has(d.slice(0, 2))) return `+48 ${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return `+48 ${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 7)} ${d.slice(7)}`;
}
