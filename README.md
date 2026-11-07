# design3d.pl — panel administracyjny: Lead Discovery

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
