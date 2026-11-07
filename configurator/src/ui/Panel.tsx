// Prawy panel: karta analizy + zwijane sekcje 1–8.
import { useMemo, useState } from 'react';
import { ArrowRight, Braces } from 'lucide-react';
import { ENTRY_LABEL, FINISHES, LANDING_SUPPORTS, RAILINGS, SHAPE_LABEL, STEEL_PRESETS, STRUCTURES, SUPPORT_TAG_LABEL, WALL_LABEL, WOODS, railingSpec, structureSpec } from '../engine/catalog';
import { cm } from '../engine/validate';
import { quantities } from '../engine/quantities';
import type { EntryDir, SideMode, WallKey } from '../engine/types';
import { useConfig, useSolved, useStore } from '../store/store';
import { woodSwatch } from '../three/woodCanvas';
import { AnalysisCard } from './AnalysisCard';
import { Field, Section, Segmented, SliderField, Thumb, Toggle } from './controls';
import { RailingThumb, ShapeThumb, StructureThumb } from './thumbs';
import { downloadJson, exportPayload } from './fileOps';

// domyślny profil i rozstaw przy zmianie typu balustrady
const RAIL_DEFAULTS: Partial<Record<string, { profile: number; spacing: number }>> = {
  verticalBars: { profile: 0.012, spacing: 0.11 },
  flatBars: { profile: 0.04, spacing: 0.12 },
  horizontalBars: { profile: 0.012, spacing: 0.11 },
};

const ARROW_ROT: Record<EntryDir, number> = { back: -90, front: 90, left: 180, right: 0 };

export function Panel() {
  const [open, setOpen] = useState<number>(1);
  const t = (i: number) => setOpen(open === i ? 0 : i);
  return (
    <aside className="flex h-full flex-col overflow-y-auto scrollbar-thin bg-panel" data-testid="panel">
      <AnalysisCard />
      <Section index={1} title="Typ schodów" open={open === 1} onToggle={() => t(1)}><TypeSection /></Section>
      <Section index={2} title="Wymiary przestrzeni" open={open === 2} onToggle={() => t(2)}><DimensionsSection /></Section>
      <Section index={3} title="Konstrukcja stalowa" open={open === 3} onToggle={() => t(3)}><StructureSection /></Section>
      <Section index={4} title="Stopnice drewniane" open={open === 4} onToggle={() => t(4)}><TreadsSection /></Section>
      <Section index={5} title="Balustrady" open={open === 5} onToggle={() => t(5)}><RailingSection /></Section>
      <Section index={6} title="Kolory i materiały" open={open === 6} onToggle={() => t(6)}><ColorsSection /></Section>
      <Section index={7} title="Oświetlenie" open={open === 7} onToggle={() => t(7)}><LightingSection /></Section>
      <Section index={8} title="Podsumowanie" open={open === 8} onToggle={() => t(8)}><SummarySection /></Section>
      <p className="px-4 py-4 text-[11px] leading-snug text-muted">Stair Studio to narzędzie koncepcyjne. Wyniki nie są projektem konstrukcyjnym ani potwierdzeniem zgodności z przepisami.</p>
    </aside>
  );
}

function TypeSection() {
  const c = useConfig();
  const setStairs = useStore((s) => s.setStairs);
  const s = c.stairs;
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {(['I', 'L', 'U'] as const).map((sh) => (
          <Thumb key={sh} testId={`shape-${sh}`} active={s.shape === sh} onClick={() => setStairs({ shape: sh })} label={SHAPE_LABEL[sh].split(' (')[0]} sub={sh}>
            <ShapeThumb shape={sh} />
          </Thumb>
        ))}
      </div>
      {s.shape !== 'I' && (
        <Field label={s.shape === 'L' ? 'Skręt' : 'Zawrót'}>
          <Segmented value={s.turn} onChange={(v) => setStairs({ turn: v })} options={[{ value: 'left', label: 'W lewo' }, { value: 'right', label: 'W prawo' }]} />
        </Field>
      )}
      <Field label="Kierunek wejścia">
        <Segmented value={s.entry} onChange={(v) => setStairs({ entry: v })} options={(['back', 'front', 'left', 'right'] as EntryDir[]).map((e) => ({
          value: e, title: ENTRY_LABEL[e], label: <span className="inline-flex items-center gap-1"><ArrowRight size={13} style={{ transform: `rotate(${ARROW_ROT[e]}deg)` }} />{ENTRY_LABEL[e].replace('do ', '').replace('w ', '')}</span>,
        }))} size="sm" />
      </Field>
      <Field label="Położenie w szerokości (X)">
        <Segmented value={s.alignX} onChange={(v) => setStairs({ alignX: v })} size="sm" options={[{ value: 'left', label: 'Lewo' }, { value: 'center', label: 'Środek' }, { value: 'right', label: 'Prawo' }, { value: 'manual', label: 'Ręcznie' }]} />
      </Field>
      {s.alignX === 'manual' && <SliderField label="Odległość od lewej ściany" value={s.manualX} onChange={(v) => setStairs({ manualX: v })} min={-100} max={c.room.width * 100} />}
      <Field label="Położenie w głębokości (Z)">
        <Segmented value={s.alignZ} onChange={(v) => setStairs({ alignZ: v })} size="sm" options={[{ value: 'back', label: 'Tył' }, { value: 'center', label: 'Środek' }, { value: 'front', label: 'Przód' }, { value: 'manual', label: 'Ręcznie' }]} />
      </Field>
      {s.alignZ === 'manual' && <SliderField label="Odległość od tylnej ściany" value={s.manualZ} onChange={(v) => setStairs({ manualZ: v })} min={-100} max={c.room.depth * 100} />}
      <SliderField label="Odstęp od ścian" value={s.wallGap} onChange={(v) => setStairs({ wallGap: v })} min={0} max={60} />
    </div>
  );
}

function DimensionsSection() {
  const c = useConfig();
  const solved = useSolved();
  const setRoom = useStore((s) => s.setRoom);
  const setStairs = useStore((s) => s.setStairs);
  const { room, stairs: s } = c;
  const N = solved.calc.risers;
  return (
    <div>
      <div className="mb-1 mt-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Pomieszczenie</div>
      <SliderField testId="f-height" label="Wysokość kondygnacji" value={room.height} onChange={(v) => setRoom({ height: v })} min={250} max={450} />
      <SliderField testId="f-width" label="Szerokość" value={room.width} onChange={(v) => setRoom({ width: v })} min={150} max={600} />
      <SliderField testId="f-depth" label="Głębokość" value={room.depth} onChange={(v) => setRoom({ depth: v })} min={200} max={900} />
      <SliderField label="Grubość stropu" value={room.slabThickness} onChange={(v) => setRoom({ slabThickness: v })} min={15} max={45} />
      <SliderField label="Grubość ścian" value={room.wallThickness} onChange={(v) => setRoom({ wallThickness: v })} min={10} max={50} />
      <Field label="Ściany (obecne konstrukcyjnie)">
        <div className="grid grid-cols-4 gap-1">
          {(['back', 'left', 'right', 'front'] as WallKey[]).map((k) => (
            <button key={k} type="button" onClick={() => setRoom({ walls: { ...room.walls, [k]: !room.walls[k] } })} className={`rounded-md border px-1 py-1 text-[11.5px] ${room.walls[k] ? 'border-ink/70 bg-ink text-white' : 'border-line text-muted'}`}>
              {WALL_LABEL[k]}
            </button>
          ))}
        </div>
      </Field>
      <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Schody</div>
      <SliderField testId="f-runwidth" label="Szerokość biegu" value={s.width} onChange={(v) => setStairs({ width: v })} min={80} max={130} />
      <SliderField testId="f-going" label="Głębokość stopnia (krok)" value={s.going} onChange={(v) => setStairs({ going: v })} min={22} max={34} step={0.5} />
      <SliderField label="Grubość stopnicy" value={s.treadThickness} onChange={(v) => setStairs({ treadThickness: v })} min={3} max={8} step={0.5} />
      <SliderField label="Nosek" value={s.nosing} onChange={(v) => setStairs({ nosing: v })} min={0} max={4} step={0.5} />
      <Field label="Liczba stopni">
        <Segmented value={s.stepsMode} onChange={(v) => setStairs({ stepsMode: v, manualSteps: N })} options={[{ value: 'auto', label: `Automatycznie (${N})` }, { value: 'manual', label: 'Ręcznie' }]} />
      </Field>
      {s.stepsMode === 'auto' ? (
        <SliderField label="Preferowana wysokość stopnia" value={s.preferredRiser} onChange={(v) => setStairs({ preferredRiser: v })} min={15} max={19.5} step={0.5} />
      ) : (
        <SliderField label="Liczba stopni" value={s.manualSteps} onChange={(v) => setStairs({ manualSteps: Math.round(v) })} min={s.shape === 'I' ? 2 : 4} max={34} scale={1} unit="szt." />
      )}
      {s.shape !== 'I' && (
        <>
          <Field label={`Podział stopni (${solved.calc.flights[0].risers} + ${solved.calc.flights[1].risers})`}>
            <Segmented value={s.splitMode} onChange={(v) => setStairs({ splitMode: v, manualSplit: solved.calc.flights[0].risers })} options={[{ value: 'auto', label: 'Automatycznie' }, { value: 'manual', label: 'Ręcznie' }]} />
          </Field>
          {s.splitMode === 'manual' && <SliderField label="Stopnie w biegu 1" value={s.manualSplit} onChange={(v) => setStairs({ manualSplit: Math.round(v) })} min={2} max={N - 2} scale={1} unit="szt." />}
          <SliderField label="Głębokość spocznika" value={s.landingDepth} onChange={(v) => setStairs({ landingDepth: v })} min={60} max={200} hint={s.shape === 'L' ? 'Dla L co najmniej szerokość biegu.' : undefined} />
          {s.shape === 'L' && <SliderField label="Szerokość spocznika (wzdłuż biegu 2)" value={s.landingWidth} onChange={(v) => setStairs({ landingWidth: v })} min={80} max={200} />}
          {s.shape === 'U' && <SliderField testId="f-gap" label="Odstęp między biegami" value={s.gap} onChange={(v) => setStairs({ gap: v })} min={6} max={80} />}
        </>
      )}
      <Field label="Otwór w stropie">
        <Segmented value={s.opening.mode} onChange={(v) => setStairs({ opening: { ...s.opening, mode: v, length: solved.opening.length, width: solved.opening.width } })} options={[{ value: 'auto', label: 'Automatycznie' }, { value: 'manual', label: 'Ręcznie' }]} />
      </Field>
      {s.opening.mode === 'manual' ? (
        <>
          <SliderField label="Długość otworu" value={s.opening.length} onChange={(v) => setStairs({ opening: { ...s.opening, length: v } })} min={60} max={900} />
          <SliderField label="Szerokość otworu" value={s.opening.width} onChange={(v) => setStairs({ opening: { ...s.opening, width: v } })} min={60} max={600} />
        </>
      ) : (
        <p className="text-[11.5px] text-muted">Otwór {cm(solved.opening.length)} × {cm(solved.opening.width)} cm — obejmuje strefę z prześwitem &lt; 205 cm i cały ostatni bieg.</p>
      )}
    </div>
  );
}

function StructureSection() {
  const c = useConfig();
  const setStructure = useStore((s) => s.setStructure);
  const st = c.structure;
  const spec = structureSpec(st.type);
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {STRUCTURES.map((x) => (
          <Thumb key={x.key} testId={`structure-${x.key}`} active={st.type === x.key} onClick={() => setStructure({ type: x.key })} label={`${x.short}. ${x.label}`} sub={SUPPORT_TAG_LABEL[x.tag]}>
            <StructureThumb type={x.key} />
          </Thumb>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-muted">{spec.description}</p>
      {spec.closedRisersAllowed && <Toggle label="Zamknięte podstopnice" checked={st.closedRisers} onChange={(v) => setStructure({ closedRisers: v })} />}
      {c.stairs.shape !== 'I' && (
        <Field label="Podparcie spocznika">
          <div className="grid grid-cols-2 gap-1">
            {LANDING_SUPPORTS.map((l) => (
              <button key={l.key} type="button" data-testid={`support-${l.key}`} onClick={() => setStructure({ landingSupport: l.key })} className={`rounded-md border px-2 py-1.5 text-[11.5px] ${st.landingSupport === l.key ? 'border-oak bg-oak-soft/60' : 'border-line'}`}>{l.label}</button>
            ))}
          </div>
        </Field>
      )}
    </div>
  );
}

function TreadsSection() {
  const c = useConfig();
  const setTreads = useStore((s) => s.setTreads);
  const setStairs = useStore((s) => s.setStairs);
  const setLighting = useStore((s) => s.setLighting);
  const swatches = useMemo(() => Object.fromEntries(WOODS.map((w) => [w.key, woodSwatch(w.key)])), []);
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {WOODS.map((w) => (
          <button key={w.key} type="button" data-testid={`wood-${w.key}`} onClick={() => setTreads({ wood: w.key })} className={`flex flex-col items-center gap-1 rounded-lg p-1 ${c.treads.wood === w.key ? 'ring-2 ring-oak' : ''}`} title={w.label}>
            <img src={swatches[w.key]} alt={w.label} className="h-9 w-full rounded-md object-cover" />
            <span className="text-center text-[10px] leading-tight">{w.label}</span>
          </button>
        ))}
      </div>
      <SliderField label="Grubość stopnicy" value={c.stairs.treadThickness} onChange={(v) => setStairs({ treadThickness: v })} min={3} max={8} step={0.5} />
      <SliderField label="Nosek" value={c.stairs.nosing} onChange={(v) => setStairs({ nosing: v })} min={0} max={4} step={0.5} />
      <Field label="Krawędź">
        <Segmented value={c.treads.edge} onChange={(v) => setTreads({ edge: v })} options={[{ value: 'square', label: 'Prosta' }, { value: 'rounded', label: 'Zaokrąglona' }]} />
      </Field>
      <Toggle label="Taśma LED pod noskiem" checked={c.lighting.led} onChange={(v) => setLighting({ led: v })} />
    </div>
  );
}

function RailingSection() {
  const c = useConfig();
  const setRailing = useStore((s) => s.setRailing);
  const r = c.railing;
  const spec = railingSpec(r.type);
  const isI = c.stairs.shape === 'I';
  const sideOpts: Array<{ value: SideMode; label: string }> = [{ value: 'balustrade', label: 'Balustrada' }, { value: 'wallHandrail', label: 'Pochwyt przyścienny' }, { value: 'none', label: 'Brak' }];
  return (
    <div>
      <div className="grid grid-cols-4 gap-2">
        {RAILINGS.map((x) => (
          <Thumb key={x.key} testId={`railing-${x.key}`} active={r.type === x.key} onClick={() => setRailing({ type: x.key, ...(RAIL_DEFAULTS[x.key] ?? {}) })} label={x.label}>
            <RailingThumb type={x.key} />
          </Thumb>
        ))}
      </div>
      <SliderField label="Wysokość" value={r.height} onChange={(v) => setRailing({ height: v })} min={80} max={120} />
      {spec.hasSpacing && (
        <>
          <SliderField label={r.type === 'flatBars' ? 'Szerokość płaskownika' : 'Średnica pręta'} value={r.profile} onChange={(v) => setRailing({ profile: v })} min={r.type === 'flatBars' ? 20 : 10} max={r.type === 'flatBars' ? 60 : 25} scale={1000} unit="mm" />
          <SliderField label={r.type === 'horizontalBars' ? 'Rozstaw prętów (pionowo)' : 'Rozstaw osiowy'} value={r.spacing} onChange={(v) => setRailing({ spacing: v })} min={6} max={20} step={0.5} />
        </>
      )}
      {r.type === 'glass' && (
        <Field label="Grubość szkła VSG">
          <Segmented value={r.glassThickness} onChange={(v) => setRailing({ glassThickness: v })} size="sm" options={[{ value: 0.0128, label: '12,8' }, { value: 0.0168, label: '16,8' }, { value: 0.0176, label: '17,5' }, { value: 0.0215, label: '21,5' }]} />
        </Field>
      )}
      <Field label="Pochwyt">
        <Segmented value={r.handrail} onChange={(v) => setRailing({ handrail: v })} options={[{ value: 'round', label: 'Okrągły' }, { value: 'rect', label: 'Prostokątny' }, { value: 'flat', label: 'Płaski' }]} />
        <div className="mt-1.5"><Segmented value={r.handrailMaterial} onChange={(v) => setRailing({ handrailMaterial: v })} options={[{ value: 'steel', label: 'Stal' }, { value: 'wood', label: 'Drewno (jak stopnice)' }]} /></div>
      </Field>
      <Field label={isI ? 'Strona lewa' : 'Strona zewnętrzna'}>
        <Segmented value={r.outer} onChange={(v) => setRailing({ outer: v })} size="sm" options={sideOpts} />
      </Field>
      <Field label={isI ? 'Strona prawa' : 'Strona wewnętrzna'}>
        <Segmented value={r.inner} onChange={(v) => setRailing({ inner: v })} size="sm" options={sideOpts} />
      </Field>
      {!isI && <Toggle label="Balustrada wokół spocznika" checked={r.landing} onChange={(v) => setRailing({ landing: v })} />}
      <Toggle label="Balustrada przy otworze w stropie" checked={r.opening} onChange={(v) => setRailing({ opening: v })} />
    </div>
  );
}

function ColorsSection() {
  const c = useConfig();
  const setSteel = useStore((s) => s.setSteel);
  const setRailing = useStore((s) => s.setRailing);
  const st = c.steel;
  return (
    <div>
      <Field label="Kolor stali">
        <div className="flex flex-wrap items-center gap-2">
          {STEEL_PRESETS.map((p) => (
            <button key={p.key} type="button" title={`${p.label}${p.ral ? ' ' + p.ral : ''}`} data-testid={`steel-${p.key}`} onClick={() => setSteel({ preset: p.key, color: p.color, finish: p.finish })}
              className={`h-8 w-8 rounded-full border border-black/10 ${st.preset === p.key ? 'ring-2 ring-oak ring-offset-2' : ''}`}
              style={{ background: p.finish === 'brushed' ? `linear-gradient(135deg, #d9dcde, ${p.color}, #8f9396)` : p.finish === 'metallic' ? `linear-gradient(135deg, #e8dcc1, ${p.color})` : p.color }} />
          ))}
          <label className={`relative h-8 w-8 cursor-pointer overflow-hidden rounded-full border border-black/10 ${st.preset === 'custom' ? 'ring-2 ring-oak ring-offset-2' : ''}`} title="Własny kolor" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
            <input type="color" className="absolute inset-0 opacity-0" value={st.color} onChange={(e) => setSteel({ preset: 'custom', color: e.target.value })} />
          </label>
        </div>
        <div className="mt-1 text-[11px] text-muted">{STEEL_PRESETS.find((p) => p.key === st.preset)?.label ?? 'Własny kolor'} {STEEL_PRESETS.find((p) => p.key === st.preset)?.ral ?? st.color}</div>
      </Field>
      <Field label="Wykończenie">
        <Segmented value={st.finish} onChange={(v) => setSteel({ finish: v })} size="sm" options={FINISHES.map((f) => ({ value: f.key, label: f.label }))} />
      </Field>
      <Toggle label="Balustrada w osobnym kolorze" checked={c.railing.separateColor} onChange={(v) => setRailing({ separateColor: v })} />
      {c.railing.separateColor && (
        <Field label="Kolor balustrady">
          <div className="flex items-center gap-2">
            {STEEL_PRESETS.map((p) => (
              <button key={p.key} type="button" title={p.label} onClick={() => setRailing({ color: p.color })} className={`h-6 w-6 rounded-full border border-black/10 ${c.railing.color === p.color ? 'ring-2 ring-oak ring-offset-1' : ''}`} style={{ background: p.color }} />
            ))}
            <input type="color" value={c.railing.color} onChange={(e) => setRailing({ color: e.target.value })} className="h-6 w-8" />
          </div>
        </Field>
      )}
    </div>
  );
}

function LightingSection() {
  const c = useConfig();
  const setLighting = useStore((s) => s.setLighting);
  const L = c.lighting;
  return (
    <div>
      <Field label="Pora">
        <Segmented value={L.night ? 'night' : 'day'} onChange={(v) => setLighting({ night: v === 'night' })} options={[{ value: 'day', label: 'Dzień' }, { value: 'night', label: 'Noc' }]} />
      </Field>
      <Toggle label="Taśma LED pod stopniami" checked={L.led} onChange={(v) => setLighting({ led: v })} />
      <Field label="Barwa LED">
        <Segmented value={L.ledTemp} onChange={(v) => setLighting({ ledTemp: v })} options={[{ value: 2700, label: 'Ciepła 2700 K' }, { value: 4000, label: 'Neutralna 4000 K' }]} />
      </Field>
      <SliderField label="Jasność LED" value={L.ledBrightness} onChange={(v) => setLighting({ ledBrightness: v })} min={0} max={100} unit="%" />
    </div>
  );
}

function SummarySection() {
  const c = useConfig();
  const s = useSolved();
  const q = useMemo(() => quantities(c, s), [c, s]);
  const fp = s.layout.footprint;
  const rows: Array<[string, string]> = [
    ['Kształt', `${SHAPE_LABEL[c.stairs.shape]}${c.stairs.shape !== 'I' ? `, ${c.stairs.turn === 'left' ? 'w lewo' : 'w prawo'}` : ''}`],
    ['Kondygnacja', `${cm(c.room.height)} cm`],
    ['Pomieszczenie', `${cm(c.room.width)} × ${cm(c.room.depth)} cm`],
    ['Liczba stopni', `${s.calc.risers} × ${cm(s.calc.rise)} cm`],
    ['Podział', s.calc.flights.map((f) => f.risers).join(' + ')],
    ['Krok / głębokość stopnicy', `${cm(s.calc.going)} / ${cm(s.calc.treadDepth)} cm`],
    ['2h + s', `${cm(s.calc.blondel)} cm`],
    ['Nachylenie', `${s.calc.angleDeg.toFixed(1).replace('.', ',')}°`],
    ['Biegi', s.calc.flights.map((f, i) => `${i + 1}: ${f.treads} stopnic, ${cm(f.length)} cm`).join('; ')],
    ...(s.calc.landingHeight !== null ? [['Spocznik', `na ${cm(s.calc.landingHeight)} cm, ${cm(s.layout.landing!.rect.maxX - s.layout.landing!.rect.minX)} × ${cm(s.layout.landing!.rect.maxZ - s.layout.landing!.rect.minZ)} cm`] as [string, string]] : []),
    ['Rzut całkowity', `${cm(fp.maxX - fp.minX)} × ${cm(fp.maxZ - fp.minZ)} cm`],
    ['Odstępy (L/P/T/P)', `${cm(s.fit.gaps.left)} / ${cm(s.fit.gaps.right)} / ${cm(s.fit.gaps.back)} / ${cm(s.fit.gaps.front)} cm`],
    ['Otwór w stropie', `${cm(s.opening.length)} × ${cm(s.opening.width)} cm`],
    ['Min. prześwit', Number.isFinite(s.opening.minHeadroom) ? `${cm(s.opening.minHeadroom)} cm` : '—'],
    ['Wyjście na piętro', s.exitDirLabel],
    ['Konstrukcja', `${structureSpec(c.structure.type).label}${c.stairs.shape !== 'I' ? `, spocznik: ${LANDING_SUPPORTS.find((l) => l.key === c.structure.landingSupport)!.label.toLowerCase()}` : ''}`],
    ['Stopnice', WOODS.find((w) => w.key === c.treads.wood)!.label],
    ['Stal', `${STEEL_PRESETS.find((p) => p.key === c.steel.preset)?.label ?? c.steel.color}, ${FINISHES.find((f) => f.key === c.steel.finish)!.label.toLowerCase()}`],
    ['Balustrada', `${railingSpec(c.railing.type).label}, ${cm(c.railing.height)} cm`],
  ];
  return (
    <div data-testid="summary">
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-line/70 last:border-0"><td className="py-1 pr-2 text-muted">{k}</td><td className="py-1 text-right tabular-nums">{v}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Zestawienie ilościowe (bez cen)</div>
      <table className="mt-1 w-full text-[12px]">
        <tbody>
          {q.map((it, i) => (
            <tr key={i} className="border-b border-line/70 last:border-0"><td className="py-1 pr-2">{it.name}</td><td className="whitespace-nowrap py-1 text-right tabular-nums">{String(it.qty).replace('.', ',')} {it.unit}</td></tr>
          ))}
        </tbody>
      </table>
      <button type="button" onClick={() => downloadJson(exportPayload(c), 'stair-studio.json')} className="mt-3 flex items-center gap-2 rounded-lg border border-line px-3 py-1.5 text-[12px] hover:border-oak">
        <Braces size={14} /> Eksportuj JSON
      </button>
    </div>
  );
}
