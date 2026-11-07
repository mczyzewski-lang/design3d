# design3d.pl

Repozytorium zawiera dwie niezależne części serwowane przez jeden serwer Express:

| Część | Trasa | Kod |
|---|---|---|
| **Stair Studio** — publiczny parametryczny konfigurator 3D schodów stalowych (strona główna) | `/` → `/konfigurator/` | `configurator/` (osobna aplikacja React + Vite) |
| **Lead Discovery** — panel administracyjny do researchu firm | `/admin/` | `src/`, `public/admin/` |

```bash
npm install
```

```bash
npm run build      # buduje konfigurator (configurator/dist)
```

```bash
npm start          # http://localhost:3000/  (PORT z env)
```

## Stair Studio — konfigurator 3D schodów

Parametryczny konfigurator schodów stalowych na wymiar z drewnianymi stopnicami i balustradami stalowymi lub szklanymi. Odpowiada na dwa pytania: jak schody wyglądają we wnętrzu i czy konkretne schody zmieszczą się w przestrzeni. Wszystkie teksty po polsku, jednostki w UI: cm, wewnętrznie: metry. **Narzędzie koncepcyjne** — nie zatwierdza konstrukcji statycznie ani zgodności z przepisami.

**Integracja.** Istniejący projekt to Node 22 + Express bez Reacta/Vite, więc konfigurator jest osobną aplikacją Vite (`base: '/konfigurator/'`) w `configurator/` z własnym `package.json` (React 19, three.js + React Three Fiber + Drei, Zustand, Tailwind 4, Motion, lucide-react, Vitest). Express serwuje `configurator/dist` pod `/konfigurator/`, a `/` przekierowuje na konfigurator. Zależności serwera i panelu Lead Discovery nie zostały zmienione.

```
configurator/src/
  engine/      czysta logika (bez React/three, testowana w Node): typy, katalog, obliczenia, układ I/L/U,
               otwór i prześwit, ścieżki balustrad, walidacja, auto-dopasowanie, wymiary, zestawienie, memo
  three/       renderowanie: geometria proceduralna scalana per materiał (geom/), materiały i tekstury
               generowane na <canvas>, pokój, kamery, wymiary, konflikty, etykiety DOM
  store/       Zustand + hooki pochodne (layout liczony tylko przy zmianie pokoju/schodów)
  ui/          panel z analizą i 8 sekcjami, paski, miniatury SVG, eksport
```

- Kształty I, L (90°), U (180°) budowane od zera w układzie lokalnym (u = prawa ręka, v = kierunek wejścia), potem rotacja wg kierunku wejścia i wyrównanie w pokoju. Ciągłość: góra biegu 1 = spocznik = dół biegu 2, ostatni stopień na poziomie stropu.
- Silnik: liczba stopni (h w 15–20 cm), podział, Blondel, kąt, otwór automatyczny (prześwit < 205 cm + ostatni bieg; krawędź wyjścia na linii ostatniego stopnia), prześwit, walidacja z przyczyną i sugestią (sugestie klikalne), status, „Dopasuj automatycznie” (szybki filtr analityczny + pełna walidacja najlepszych; brak rozwiązania → komunikat i kształty, które się zmieszczą).
- 5 konstrukcji stalowych o różnej geometrii (belka centralna, dwa policzki, zygzak, gięta blacha, rama spawana ze słupami pośrednimi), spocznik zawsze z ramą: samonośny (belki biegów ciągłe pod spocznikiem), 4 słupy, rama + 2 słupy, do ściany.
- 7 gatunków drewna i 7 typów balustrad, pochwyt przyścienny, balustrada spocznika i otworu; kolory RAL/własny, 4 wykończenia; LED 2700/4000 K; dzień/noc.
- 5 trybów kamery (perspektywa, z góry — kamera ortogonalna z wymiarami rzutu, z boku — ortogonalna elewacja z wymiarami pionowymi, przekrój, poziom oczu), widoczność ścian (auto per klatka, wszystkie, półprzezroczyste, wybrane, przekrój 105 cm), czerwone bryły kolizji i brakującego prześwitu.
- Zapis w localStorage, import/eksport JSON (konfiguracja + wyniki + zestawienie ilościowe bez cen), zrzut PNG.

Testy i sprawdzenie w przeglądarce:

```bash
npm run test:configurator
```

```bash
node configurator/scripts/browser-check.mjs http://localhost:3000/konfigurator/ ./browser-check
```

Testy Vitest (64) obejmują kryteria A–H ze specyfikacji, ciągłość L/U, prześwit przy ręcznym otworze, auto-dopasowanie (rozwiązanie / brak / inny kształt), konfigurację domyślną (20 × 17,5 cm, 10 + 10, spocznik 175 cm, Blondel 63, „Mieści się”) oraz test regresyjny (raycast), że stal nigdzie nie przebija stopnic.

**Railway.** `railway.json` ustawia `buildCommand: npm run build` (instaluje i buduje `configurator/`) i `startCommand: npm start`; healthcheck `/healthz`. Serwer nasłuchuje na `process.env.PORT`. Skrypt startowy ma flagi `--experimental-strip-types --experimental-sqlite`, więc działa na każdym Node ≥ 22.12 (`.node-version`: 22). Baza SQLite panelu Lead Discovery domyślnie leży w `./data` — na Railway warto podpiąć wolumen i ustawić `DATABASE_PATH` oraz `ADMIN_PASSWORD`.

---

# Lead Discovery — panel administracyjny

Moduł do wyszukiwania, skanowania i kwalifikowania polskich firm z wybranej branży (pierwsza branża: **producenci schodów**).
Najważniejsza funkcja: znajdowanie **prawdziwych adresów e-mail opublikowanych na oficjalnych stronach firm** razem z dokładnym URL podstrony, na której je znaleziono.

> Moduł służy do researchu i budowy bazy kontaktów. **Nie wysyła żadnych wiadomości**, nie generuje ani nie zgaduje adresów, nie kupuje baz, nie omija zabezpieczeń stron.

## Szybki start

```bash
npm install
```

```bash
cp .env.example .env   # ustaw co najmniej ADMIN_PASSWORD
```

```bash
npm start              # panel: http://localhost:3000/admin/
```

Wymagania: Node.js ≥ 22.18 (natywne uruchamianie TypeScript i wbudowany SQLite — bez kroku budowania i bez natywnych modułów).
Opcjonalnie Playwright (renderowanie stron JS): `npm install playwright && npx playwright install chromium`. Bez niego crawler działa w trybie samego HTML.

Scenariusz w panelu: **+ Nowy projekt wyszukiwania** → szablon „Producenci schodów — Polska” → docelowa liczba firm (np. 3000) → **Utwórz i rozpocznij** → obserwacja postępu → **Firmy** (sortowanie po Lead Score) → klik w firmę → **Otwórz źródło e-maila** → eksport **CSV/XLSX**.

Bez płatnych usług: wybierz źródło „Tylko import CSV” i wklej listę stron (kolumny `nazwa`, `strona`, `miasto`, `nip` — nagłówki PL/EN, separator `;` lub `,`).

Szybki test z linii poleceń (wyniki trafiają do tej samej bazy co panel):

```bash
npm run scan -- lista.csv --pages 8 --out wynik.csv
```

## Plan techniczny (architektura)

Repozytorium było puste, więc stack dobrano pod wymagania: jeden proces Node.js, zero zewnętrznej infrastruktury do podstawowego działania.

| Obszar | Rozwiązanie |
|---|---|
| Serwer / API | Express, `src/app.ts`, `src/api/routes.ts` (pod `/api/admin/lead-discovery`), HTTP Basic Auth |
| Baza danych | SQLite (`node:sqlite`, tryb WAL), schemat: `src/db/schema.sql` |
| Kolejki | Trwała kolejka w tabeli `jobs` (`src/queue/`): osobne kolejki `discovery`, `crawl`, `analysis`; atomowe pobieranie zadań, retry z exponential backoff, pauza/wznowienie, odzyskiwanie po restarcie |
| Crawling HTML | undici (proxy z `HTTPS_PROXY`), limit globalny + odstęp per host, `Retry-After`, robots.txt (`robots-parser`), cheerio |
| Renderowanie JS | Playwright — tylko gdy strona wygląda na zależną od JS; blokowane obrazy/fonty/media |
| Odkrywanie domen | Brave Search API, Google Programmable Search (klucze w `.env`), import CSV, ustalanie strony dla firm podanych z samej nazwy |
| Analiza | Heurystyka (zawsze, bez kosztów) + opcjonalnie Claude (structured JSON) w osobnej kolejce, w ramach budżetu |
| Panel | SPA w czystym JS (`public/admin/`), bez kroku budowania |
| Eksport | CSV (UTF-8 z BOM, `;`, ochrona przed formułami) i XLSX (exceljs) |

### Model danych

- `search_projects` — projekty wyszukiwania (frazy, miasta, limity, dostawca, **limit budżetu**, koszt).
- `companies` — firma (nazwa, NIP, strona, główny e-mail + źródło, telefon, miasto, województwo, kategoria, specjalizacja, Lead Score, konfigurator, status skanu, analiza, **zgoda marketingowa — domyślnie brak**, **sprzeciw**, `merged_into_id`).
- `domains` — wiele domen na firmę (przekierowania, status, robots).
- `company_locations` — oddziały (jedna domena może reprezentować kilka lokalizacji).
- `contacts` + `contact_sightings` — e-maile/telefony/formularze: wartość, najlepszy URL źródła, sposób znalezienia, kategoria, pewność, data weryfikacji oraz **wszystkie miejsca wystąpienia**.
- `sources` — pochodzenie danych (wynik wyszukiwania + zapytanie, import CSV, skan, scalenie).
- `pages` — cache przeskanowanych stron (wyekstrahowane dane, nie surowy HTML).
- `discovery_queries`, `jobs`, `error_log`, `api_usage` — wyszukiwanie, kolejka, monitoring błędów, koszty.
- `suppressions`, `privacy_log` — RODO: lista wykluczeń (hashe SHA-256) i rejestr czynności.

### Jak crawler szuka kontaktu (`src/crawler/scanCompany.ts`)

1. robots.txt (brak zgody → status „robots.txt zabrania”, nic więcej nie pobieramy).
2. Strona główna i stopka (mailto, tekst, JSON-LD, zamaskowane adresy, `data-cfemail`); przekierowanie na inną domenę → podpięcie/scalenie domen.
3. Linki oceniane jak przez człowieka: **Kontakt** → **O nas/O firmie** → **zamówienia/wycena/oferta** → galeria → pozostałe (tylko gdy nadal brak e-maila). Brak linku do kontaktu → próba `/kontakt`, `/contact`, `/kontakt.html`.
4. Playwright tylko gdy treść powstaje w JS (pusta strona z dużą liczbą skryptów, widget formularza bez treści).
5. Każdy adres: kategoria (oferty/zamówienia, ogólny, klienci, indywidualny, reklamacje, rekrutacja, księgowość, wsparcie, IOD, twórca strony, no-reply), pewność, kontekst, URL i data.
6. Wybór głównego adresu: oferta/zamówienia/wycena → ogólny (`biuro@`, `kontakt@`, `office@`) → inny do zapytań klientów → indywidualny tylko gdy wskazany jako kontakt biznesowy. Reklamacje/rekrutacja/księgowość/wsparcie tylko gdy nie ma lepszego; IOD, agencja i no-reply nigdy.
7. Brak e-maila, ale jest formularz → status **„Tylko formularz”** z URL formularza.

### Deduplikacja

Po domenie rejestrowalnej (`www.` i subdomeny → jedna domena), po przekierowaniu na znaną domenę, po NIP (z walidacją sumy kontrolnej), po wspólnym głównym adresie e-mail. Scalony rekord zachowuje wszystkie domeny, kontakty, źródła i oddziały; w statystykach widać „odkryte” i „unikalne”.

### Lead Score (0–100)

Liczone deterministycznie (`src/analysis/score.ts`) z wyniku analizy — najwyżej: producent schodów na wymiar z własną działającą stroną, znalezionym e-mailem, galerią i wyceną online, **bez konfiguratora**; konfigurator 3D obniża wynik o 30 pkt. Rozbicie punktacji widać w szczegółach firmy.

### Analiza AI

Gdy ustawiono `ANTHROPIC_API_KEY`, projekt ma włączoną analizę AI i **ustawiony limit budżetu**, każda zeskanowana firma trafia do osobnej kolejki `analysis`. Model zwraca JSON zgodny ze schematem (`src/analysis/types.ts`): kategoria, rodzaje schodów, realizacje na zamówienie, wizualizacje, konfigurator (brak/prosty/3D), galeria, wycena online, potencjał konfiguratora 3D, pewność, uzasadnienie i URL źródłowe (filtrowane do faktycznie przeskanowanych podstron). Domyślny model: `claude-opus-5-5` z `effort: low` (zmienne `ANTHROPIC_MODEL`, `ANTHROPIC_EFFORT`); włączony jest serwerowy fallback przy odmowie (`fallbacks: "default"`). Koszt jest szacowany przed wywołaniem i rejestrowany po nim.

### Wydajność i automatyzacja

- `CRAWL_CONCURRENCY` firm równolegle, globalnie max 16 żądań, `PER_HOST_DELAY_MS` per host (Crawl-delay z robots.txt ma pierwszeństwo).
- Retry: pojedyncze żądanie 3× z backoffem; zadanie do 4 prób z backoffem 30 s → 6 h; długi `Retry-After` przenosi zadanie w czasie.
- Pauza projektu lub pojedynczego zadania: zadanie kończy się na najbliższym punkcie kontrolnym (między podstronami), strony i kontakty są już zapisane; po wznowieniu cache stron (`PAGE_CACHE_HOURS`) eliminuje ponowne pobieranie.
- Restart procesu: zadania „w toku” wracają do kolejki.
- Harmonogram: ponowna weryfikacja kontaktów co `REVERIFY_DAYS` (adresy, których już nie ma, są oznaczane jako nieaktualne), retencja co 24 h, zamykanie ukończonych projektów.
- Płatne zapytania (wyszukiwarka, AI) wymagają ustawionego limitu budżetu w projekcie; limit 0 = brak płatnych wywołań.

## Prywatność i zgodność (RODO)

- Brak funkcji mailingu i automatycznej wysyłki.
- Znalezienie publicznego adresu ≠ zgoda marketingowa (domyślnie „brak potwierdzonej zgody”; zmiana wymaga notatki i trafia do rejestru).
- Zbierane są tylko dane istotne dla celu; dla każdego kontaktu zapisywane jest źródło i czas pozyskania/weryfikacji.
- **Sprzeciw**: usuwa dane kontaktowe, blokuje skanowanie, wyklucza z eksportu, a identyfikatory (domena, e-mail, NIP) trafiają na listę wykluczeń jako hash.
- **Usunięcie**: kasuje firmę ze wszystkimi powiązaniami; zostaje wyłącznie hash na liście wykluczeń, by nie zebrać danych ponownie.
- **Retencja**: `RETENTION_DAYS` od ostatniej weryfikacji.
- **Obowiązek informacyjny (art. 14)**: gotowa klauzula w zakładce *Prywatność / RODO* (do przekazania najpóźniej przy pierwszym kontakcie). Treść klauzuli to szablon — warto, by zweryfikował ją prawnik.
- Crawler identyfikuje się własnym User-Agentem, przestrzega robots.txt, limitów i odpowiedzi serwerów; CAPTCHA/challenge → status „Zablokowane”, bez prób obejścia. Dekodowanie `data-cfemail` odpowiada temu, co przeglądarka robi dla każdego odwiedzającego.
- Brak OCR adresów z obrazów.

## Testy

```bash
npm test
```

```bash
npm run typecheck
```

Testy działają wyłącznie na lokalnych fixture'ach HTML (`test/fixtures/sites/*.test`, serwowanych przez `test/helpers/fixtureServer.ts`), bez zależności od zewnętrznych stron. Mock API wyszukiwarki i Claude pozwala testować discovery i analizę bez kosztów.

Pokryte scenariusze (`test/e2e.test.ts`, `test/unit.test.ts`): rozpoznanie podstrony Kontakt, prawdziwy e-mail z dokładnym URL (zamaskowany `[at]`, mailto, stopka, JSON-LD, Cloudflare), wybór adresu ofertowego zamiast `praca@`/`reklamacje@`/IOD/agencji, firma bez e-maila (tylko formularz / brak kontaktu), strona JS (Playwright), robots.txt (`Disallow: /` i ścieżki), blokada anty-botowa, przekierowanie domeny i ten sam NIP (deduplikacja), producent vs firma budowlana vs hurtownia, konfigurator obniża score, pauza i wznowienie bez ponownego pobierania stron, limit budżetu wyszukiwarki i AI, filtrowanie katalogów/social media, ustalanie strony z samej nazwy, sprzeciw i usunięcie (lista wykluczeń), odzyskanie zadań po restarcie, API z logowaniem, eksport CSV/XLSX z prawdziwymi rekordami.

Przegląd panelu w przeglądarce na fixture'ach (zrzuty ekranu do wskazanego katalogu):

```bash
node --disable-warning=ExperimentalWarning test/ui-walkthrough.ts ./zrzuty
```

## Konfiguracja

Wszystkie klucze i ustawienia są w zmiennych środowiskowych — patrz `.env.example`. Klucze API nigdy nie trafiają do przeglądarki (panel widzi tylko, czy dany dostawca jest skonfigurowany).

## Ograniczenia MVP / dalsze kroki

- Wyszukiwarki: Brave i Google CSE. Kolejne legalne źródła (np. CEIDG/KRS po kodach PKD) można dodać jako nowego dostawcę w `src/discovery/providers.ts`.
- Kraj: Polska (normalizacja telefonów, NIP, województwa).
- SQLite wystarcza dla dziesiątek tysięcy firm w jednym procesie; przy wielu instancjach workerów warto przenieść schemat na PostgreSQL.
