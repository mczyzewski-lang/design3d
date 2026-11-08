// Prawy panel: karta analizy, potem „Wygląd” (same kliknięcia, duży efekt) i „Parametry” (wymiary).
import { useMemo, useState, type ReactNode } from 'react';
import { ArrowRight } from 'lucide-react';
import { STEP_STYLES, stepStyleOf, ENTRY_LABEL, FINISHES, GLASS_MOUNTS, GLASS_TINTS, GLASS_TOPS, RISER_FINISHES, LANDING_SUPPORTS, RAILINGS, SHAPE_LABEL, STEEL_PRESETS, STRUCTURES, SUPPORT_TAG_LABEL, WALL_LABEL, WOODS, railingSpec, structureMaterial, structureSpec } from '../engine/catalog';
import { cm } from '../engine/validate';
import { quantities } from '../engine/quantities';
import type { EntryDir, SideMode, WallKey } from '../engine/types';
import { useConfig, useSolved, useStore } from '../store/store';
import { woodSwatch } from '../three/woodCanvas';
import { AnalysisCard } from './AnalysisCard';
import { CommentsCard, FindContractorCard } from '../studio/StudioUI';
import { Choices, Field, GroupLabel, Section, Segmented, SliderField, Thumb, Toggle } from './controls';
import { LED_MODES } from '../engine/led';
import { RailingThumb, ShapeThumb, StepStyleThumb, StructureThumb } from './thumbs';

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
  const c = useConfig();
  const S = (i: number, title: string, el: ReactNode, value?: string, testId?: string) => (
    <Section index={i} title={title} open={open === i} onToggle={() => t(i)} value={value} testId={testId}>{el}</Section>
  );
  const style = stepStyleOf(c);
  return (
    <aside className="flex flex-col bg-panel scrollbar-thin md:h-full md:overflow-y-auto" data-testid="panel">
      <AnalysisCard />
      <FindContractorCard />
      <CommentsCard />
      <GroupLabel hint="Wyklikaj wygląd — bez wpisywania wymiarów">Wygląd schodów</GroupLabel>
      {S(1, 'Typ schodów', <ShapeSection />, `${SHAPE_LABEL[c.stairs.shape].split(' (')[0]}${c.stairs.turnType === 'winders' && c.stairs.shape !== 'I' && c.stairs.shape !== 'S' ? ', zabiegowe' : ''}`, 'sec-shape')}
      {S(2, 'Konstrukcja', <StructureSection />, c.stairs.shape === 'S' ? 'kolumna centralna' : structureSpec(c.structure.type).label, 'sec-structure')}
      {S(3, 'Styl stopni', <StepStyleSection />, c.stairs.shape === 'S' ? 'ażurowe' : STEP_STYLES.find((x) => x.key === style)?.label, 'sec-steps')}
      {S(4, 'Kolor stopni', <WoodSection />, WOODS.find((w) => w.key === c.treads.wood)?.label, 'sec-wood')}
      {S(5, 'Balustrada', <RailingLookSection />, railingSpec(c.railing.type).label, 'sec-railing')}
      {S(6, 'Kolor stali i wykończeń', <SteelSection />, STEEL_PRESETS.find((p) => p.key === c.steel.preset)?.label ?? 'własny kolor', 'sec-steel')}
      {S(7, 'Oświetlenie', <LightingSection />, c.lighting.led ? `LED ${LED_MODES.find((m) => m.key === c.lighting.ledMode)?.label.toLowerCase() ?? ''}` : 'bez LED', 'sec-light')}
      <GroupLabel hint="Dokładne wymiary — gdy znasz swoje pomieszczenie">Parametry</GroupLabel>
      {S(8, 'Wymiary klatki schodowej', <RoomSection />, `${cm(c.room.width)} × ${cm(c.room.depth)}, h ${cm(c.room.height)} cm`, 'sec-room')}
      {S(9, 'Wymiary schodów i stopni', <StairDimsSection />, undefined, 'sec-dims')}
      {S(10, 'Wymiary balustrady', <RailingDimsSection />, `${cm(c.railing.height)} cm`, 'sec-railing-dims')}
      {S(11, 'Podsumowanie', <SummarySection />, undefined, 'sec-summary')}
      <p className="px-4 py-4 text-[11px] leading-snug text-muted">Stair Studio to narzędzie koncepcyjne. Wyniki nie są projektem konstrukcyjnym ani potwierdzeniem zgodności z przepisami.</p>
    </aside>
  );
}

// ---------------- WYGLĄD ----------------

function ShapeSection() {
  const c = useConfig();
  const chooseShape = useStore((s) => s.chooseShape);
  const setStairs = useStore((s) => s.setStairs);
  const s = c.stairs;
  return (
    <div>
      <Choices cols={4} item="md" testId="choices-shape">
        {(['I', 'L', 'U', 'S'] as const).map((sh) => (
          <Thumb key={sh} testId={`shape-${sh}`} active={s.shape === sh} onClick={() => chooseShape(sh)} label={SHAPE_LABEL[sh].split(' (')[0]} sub={sh === 'S' ? 'spiralne' : sh}>
            <ShapeThumb shape={sh} />
          </Thumb>
        ))}
      </Choices>
      {(s.shape === 'L' || s.shape === 'U') && (
        <Field label="Zakręt">
          <Segmented value={s.turnType} onChange={(v) => chooseShape(s.shape, v)} options={[{ value: 'landing', label: 'Spocznik' }, { value: 'winders', label: 'Stopnie zabiegowe' }]} />
        </Field>
      )}
      {s.shape !== 'I' && (
        <Field label={s.shape === 'L' ? 'Skręt' : s.shape === 'U' ? 'Zawrót' : 'Kierunek obrotu'}>
          <Segmented value={s.turn} onChange={(v) => setStairs({ turn: v })} options={s.shape === 'S'
            ? [{ value: 'left', label: 'Przeciwnie do wskazówek' }, { value: 'right', label: 'Zgodnie ze wskazówkami' }]
            : [{ value: 'left', label: 'W lewo' }, { value: 'right', label: 'W prawo' }]} size={s.shape === 'S' ? 'sm' : 'md'} />
        </Field>
      )}
      <p className="mt-1 text-[11px] text-muted">Po zmianie układu liczba stopni, krok i położenie dopasowują się automatycznie.</p>
    </div>
  );
}

function StructureSection() {
  const c = useConfig();
  const setStructure = useStore((s) => s.setStructure);
  const st = c.structure;
  const spec = structureSpec(st.type);
  if (c.stairs.shape === 'S') return <p className="text-[12px] text-muted">Schody kręcone mają własną konstrukcję: kolumnę centralną Ø120 mm, stopnie na tulejach dystansowych i ramionach oraz górny podest.</p>;
  return (
    <div>
      <Choices cols={3} item="lg" testId="choices-structure">
        {STRUCTURES.map((x) => (
          <Thumb key={x.key} testId={`structure-${x.key}`} active={st.type === x.key} onClick={() => setStructure({ type: x.key })} label={x.label} sub={SUPPORT_TAG_LABEL[x.tag]}>
            <StructureThumb type={x.key} />
          </Thumb>
        ))}
      </Choices>
      <p className="mt-2 text-[11.5px] text-muted">{spec.description}</p>
      {(c.stairs.shape === 'L' || c.stairs.shape === 'U') && c.stairs.turnType === 'landing' && (
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

/** Etykiety stylu stopni dopasowane do materiału konstrukcji (beton nie bywa ażurowy). */
function stepLabel(k: string, label: string, mat: string): string {
  if (mat === 'concrete' && k === 'open') return 'Czoła betonowe';
  return label;
}
function stepHint(k: string, hint: string, mat: string): string {
  if (mat === 'concrete' && k === 'open') return 'Stopnice na betonowych stopniach, czoła stopni betonowe (do malowania lub tynku).';
  if (mat === 'concrete' && k === 'closedFront') return 'Czoła betonowych stopni obłożone podstopnicami.';
  if (mat === 'wood' && k === 'open') return 'Otwarte — bez podstopnic, widoczne policzki drewniane.';
  return hint;
}

function StepStyleSection() {
  const c = useConfig();
  const setTreads = useStore((s) => s.setTreads);
  const setStructure = useStore((s) => s.setStructure);
  const style = stepStyleOf(c);
  const mat = structureMaterial(c.structure.type);
  if (c.stairs.shape === 'S') return <p className="text-[12px] text-muted">Schody kręcone mają stopnie ażurowe — klinowe stopnice na tulejach.</p>;
  return (
    <div>
      <Choices cols={2} item="xl" testId="choices-steps">
        {STEP_STYLES.map((st) => (
          <button key={st.key} type="button" data-testid={`step-${st.key}`} title={stepHint(st.key, st.hint, mat)} onClick={() => { setTreads({ style: st.key }); setStructure({ closedRisers: false }); }}
            className={`flex items-center gap-2 rounded-lg border px-2 py-2 text-left text-[11.5px] leading-tight ${style === st.key ? 'border-oak bg-oak-soft/60' : 'border-line bg-white'}`}>
            <StepStyleThumb style={st.key} material={mat} />{stepLabel(st.key, st.label, mat)}
          </button>
        ))}
      </Choices>
      <p className="mt-1.5 text-[11px] text-muted">{stepHint(style, STEP_STYLES.find((x) => x.key === style)!.hint, mat)}</p>
      {(style === 'closedFront' || style === 'boxed' || style === 'solid') && (
        <Field label={style === 'closedFront' ? 'Wykończenie podstopnic' : 'Wykończenie zabudowy'}>
          <Segmented value={c.structure.riserFinish} onChange={(v) => setStructure({ riserFinish: v })} size="sm" options={RISER_FINISHES.map((r) => ({ value: r.key, label: r.label }))} />
        </Field>
      )}
    </div>
  );
}

function WoodSection() {
  const c = useConfig();
  const setTreads = useStore((s) => s.setTreads);
  const swatches = useMemo(() => Object.fromEntries(WOODS.map((w) => [w.key, woodSwatch(w.key)])), []);
  return (
    <div>
      <Choices cols={4} item="sm" testId="choices-wood">
        {WOODS.map((w) => (
          <button key={w.key} type="button" data-testid={`wood-${w.key}`} onClick={() => setTreads({ wood: w.key })} className={`flex flex-col items-center gap-1 rounded-lg p-1 ${c.treads.wood === w.key ? 'ring-2 ring-oak' : ''}`} title={w.label}>
            <img src={swatches[w.key]} alt={w.label} className="h-10 w-full rounded-md object-cover" />
            <span className="text-center text-[10px] leading-tight">{w.label}</span>
          </button>
        ))}
      </Choices>
      <Field label="Krawędź stopnicy">
        <Segmented value={c.treads.edge} onChange={(v) => setTreads({ edge: v })} options={[{ value: 'square', label: 'Prosta' }, { value: 'rounded', label: 'Zaokrąglona' }]} />
      </Field>
    </div>
  );
}

function SteelSwatches({ value, onPick, testPrefix, small = false }: { value: string; onPick: (p: (typeof STEEL_PRESETS)[number]) => void; testPrefix?: string; small?: boolean }) {
  const size = small ? 'h-7 w-7' : 'h-9 w-9';
  return (
    <>
      {STEEL_PRESETS.map((p) => (
        <button key={p.key} type="button" title={`${p.label}${p.ral ? ' ' + p.ral : ''}`} data-testid={testPrefix ? `${testPrefix}-${p.key}` : undefined} onClick={() => onPick(p)}
          className={`${size} shrink-0 rounded-full border border-black/10 ${value === p.key ? 'ring-2 ring-oak ring-offset-2' : ''}`}
          style={{ background: p.finish === 'brushed' ? `linear-gradient(135deg, #d9dcde, ${p.color}, #8f9396)` : p.finish === 'metallic' ? `linear-gradient(135deg, #e8dcc1, ${p.color})` : p.color }} />
      ))}
    </>
  );
}

function RailingLookSection() {
  const c = useConfig();
  const setRailing = useStore((s) => s.setRailing);
  const r = c.railing;
  return (
    <div>
      <Choices cols={4} item="md" testId="choices-railing">
        {RAILINGS.map((x) => (
          <Thumb key={x.key} testId={`railing-${x.key}`} active={r.type === x.key} onClick={() => setRailing({ type: x.key, ...(RAIL_DEFAULTS[x.key] ?? {}) })} label={x.label}>
            <RailingThumb type={x.key} />
          </Thumb>
        ))}
      </Choices>
      {r.type === 'glass' ? (
        <>
          <Field label="Rodzaj szkła">
            <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 choices md:mx-0 md:flex-wrap md:px-0">
              {GLASS_TINTS.map((g) => (
                <button key={g.key} type="button" data-testid={`glass-tint-${g.key}`} onClick={() => setRailing({ glassTint: g.key })} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] ${r.glassTint === g.key ? 'border-oak bg-oak-soft/60' : 'border-line bg-white'}`}>
                  <span className="h-3.5 w-3.5 rounded-full border border-black/10" style={{ background: g.color, opacity: Math.max(0.5, g.opacity + 0.4) }} />{g.label}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Górna krawędź">
            <Segmented value={r.glassTop} onChange={(v) => setRailing({ glassTop: v })} size="sm" options={GLASS_TOPS.map((g) => ({ value: g.key, label: g.label }))} />
            {r.glassTop === 'woodCap' && <p className="mt-1 text-[11px] text-muted">Pochwyt z tego samego drewna co stopnice ({WOODS.find((w) => w.key === c.treads.wood)!.label.toLowerCase()}).</p>}
          </Field>
          <Field label="Mocowanie szkła">
            <div className="grid grid-cols-3 gap-1">
              {GLASS_MOUNTS.map((g) => (
                <button key={g.key} type="button" title={g.hint} data-testid={`glass-mount-${g.key}`} onClick={() => setRailing({ glassMount: g.key })} className={`rounded-md border px-1.5 py-1.5 text-[11px] leading-tight ${r.glassMount === g.key ? 'border-oak bg-oak-soft/60' : 'border-line'}`}>{g.label}</button>
              ))}
            </div>
          </Field>
        </>
      ) : (
        <>
          <Field label="Kolor balustrady">
            <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 pt-1 choices md:mx-0 md:flex-wrap md:px-0">
              <button type="button" data-testid="railing-color-same" onClick={() => setRailing({ separateColor: false })}
                className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${!r.separateColor ? 'border-oak bg-oak-soft/60' : 'border-line bg-white'}`}>jak konstrukcja</button>
              <SteelSwatches small value={r.separateColor ? STEEL_PRESETS.find((p) => p.color === r.color)?.key ?? '' : ''} onPick={(p) => setRailing({ separateColor: true, color: p.color })} testPrefix="railing-color" />
            </div>
          </Field>
          <Field label="Pochwyt">
            <Segmented value={r.handrail} onChange={(v) => setRailing({ handrail: v })} options={[{ value: 'round', label: 'Okrągły' }, { value: 'rect', label: 'Prostokątny' }, { value: 'flat', label: 'Płaski' }]} />
            <div className="mt-1.5"><Segmented value={r.handrailMaterial} onChange={(v) => setRailing({ handrailMaterial: v })} options={[{ value: 'steel', label: 'Stal' }, { value: 'wood', label: 'Drewno (jak stopnice)' }]} /></div>
          </Field>
        </>
      )}
    </div>
  );
}

function SteelSection() {
  const c = useConfig();
  const setSteel = useStore((s) => s.setSteel);
  const st = c.steel;
  const mat = structureMaterial(c.structure.type);
  return (
    <div>
      {mat !== 'steel' && c.stairs.shape !== 'S' && <p className="mb-1 text-[11px] text-muted">Konstrukcja {mat === 'wood' ? 'drewniana' : 'żelbetowa'} — kolor dotyczy balustrady, pochwytów i elementów stalowych.</p>}
      <div className="-mx-4 flex items-center gap-2.5 overflow-x-auto px-4 pb-1.5 pt-1.5 choices md:mx-0 md:flex-wrap md:px-0">
        <SteelSwatches value={st.preset} onPick={(p) => setSteel({ preset: p.key, color: p.color, finish: p.finish })} testPrefix="steel" />
        <label className={`relative h-9 w-9 shrink-0 cursor-pointer overflow-hidden rounded-full border border-black/10 ${st.preset === 'custom' ? 'ring-2 ring-oak ring-offset-2' : ''}`} title="Własny kolor" style={{ background: 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}>
          <input type="color" className="absolute inset-0 opacity-0" value={st.color} onChange={(e) => setSteel({ preset: 'custom', color: e.target.value })} />
        </label>
      </div>
      <div className="mt-1 text-[11px] text-muted">{STEEL_PRESETS.find((p) => p.key === st.preset)?.label ?? 'Własny kolor'} {STEEL_PRESETS.find((p) => p.key === st.preset)?.ral ?? st.color}</div>
      <Field label="Wykończenie">
        <Segmented value={st.finish} onChange={(v) => setSteel({ finish: v })} size="sm" options={FINISHES.map((f) => ({ value: f.key, label: f.label }))} />
      </Field>
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
      <Toggle label="Oświetlenie LED schodów" checked={L.led} onChange={(v) => setLighting({ led: v })} />
      {L.led && c.stairs.shape !== 'S' && (
        <Field label="Rodzaj oświetlenia">
          <Segmented value={L.ledMode} onChange={(v) => setLighting({ ledMode: v })} size="sm" options={LED_MODES.map((m) => ({ value: m.key, label: <span data-testid={`led-${m.key}`}>{m.label}</span>, title: m.hint }))} />
          <p className="mt-1 text-[11px] text-muted">{LED_MODES.find((m) => m.key === L.ledMode)?.hint}</p>
        </Field>
      )}
      {L.led && (
        <>
          <Field label="Barwa LED">
            <Segmented value={L.ledTemp} onChange={(v) => setLighting({ ledTemp: v })} options={[{ value: 2700, label: 'Ciepła 2700 K' }, { value: 4000, label: 'Neutralna 4000 K' }]} />
          </Field>
          <SliderField label="Jasność LED" value={L.ledBrightness} onChange={(v) => setLighting({ ledBrightness: v })} min={0} max={100} unit="%" />
        </>
      )}
    </div>
  );
}

// ---------------- PARAMETRY ----------------

function RoomSection() {
  const c = useConfig();
  const solved = useSolved();
  const setRoom = useStore((s) => s.setRoom);
  const setStairs = useStore((s) => s.setStairs);
  const { room, stairs: s } = c;
  return (
    <div>
      <SliderField testId="f-height" label="Wysokość kondygnacji" value={room.height} onChange={(v) => setRoom({ height: v })} min={250} max={450} />
      <SliderField testId="f-width" label="Szerokość pomieszczenia" value={room.width} onChange={(v) => setRoom({ width: v })} min={150} max={600} />
      <SliderField testId="f-depth" label="Głębokość pomieszczenia" value={room.depth} onChange={(v) => setRoom({ depth: v })} min={200} max={900} />
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
      <div className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">Położenie schodów</div>
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
      <SliderField testId="f-wallgap" label={s.wallGapSplit ? 'Odstęp od ściany tylnej / przedniej' : 'Odstęp od ścian'} value={s.wallGap} onChange={(v) => setStairs(s.wallGapSplit ? { wallGap: v } : { wallGap: v, wallGapLeft: v, wallGapRight: v })} min={0} max={60} />
      <Toggle label="Osobny odstęp z lewej i z prawej" checked={s.wallGapSplit} onChange={(v) => setStairs(v ? { wallGapSplit: true, wallGapLeft: s.wallGap, wallGapRight: s.wallGap } : { wallGapSplit: false })} />
      {s.wallGapSplit && (
        <>
          <SliderField testId="f-wallgap-left" label="Odstęp od lewej ściany" value={s.wallGapLeft} onChange={(v) => setStairs({ wallGapLeft: v })} min={0} max={100} hint={s.alignX === 'right' ? 'Przy położeniu „Prawo” liczy się odstęp od prawej ściany.' : undefined} />
          <SliderField testId="f-wallgap-right" label="Odstęp od prawej ściany" value={s.wallGapRight} onChange={(v) => setStairs({ wallGapRight: v })} min={0} max={100} hint={s.alignX === 'left' ? 'Przy położeniu „Lewo” liczy się odstęp od lewej ściany.' : s.alignX === 'center' ? 'Przy „Środku” schody są wyśrodkowane między odstępami.' : undefined} />
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

function StairDimsSection() {
  const c = useConfig();
  const solved = useSolved();
  const setStairs = useStore((s) => s.setStairs);
  const s = c.stairs;
  const N = solved.calc.risers;
  return (
    <div>
      {s.shape === 'S' ? (
        <>
          <SliderField testId="f-diameter" label="Średnica schodów kręconych" value={s.spiralDiameter} onChange={(v) => setStairs({ spiralDiameter: v })} min={120} max={260} step={5} hint="Kolumna centralna Ø12 cm, górny podest w ćwiartce otworu." />
          <SliderField testId="f-going" label="Docelowy krok na linii chodu" value={s.going} onChange={(v) => setStairs({ going: v })} min={18} max={32} step={0.5} hint={`Faktyczny krok ${cm(solved.calc.going)} cm — kąt dobrany tak, by obrót kończył się na podeście (wielokrotność 90°).`} />
        </>
      ) : (
        <>
          <SliderField testId="f-runwidth" label="Szerokość biegu" value={s.width} onChange={(v) => setStairs({ width: v })} min={80} max={130} />
          <SliderField testId="f-going" label="Głębokość stopnia (krok)" value={s.going} onChange={(v) => setStairs({ going: v })} min={22} max={34} step={0.5} />
        </>
      )}
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
      {(s.shape === 'L' || s.shape === 'U') && (
        <>
          {s.turnType === 'winders' && (
            <SliderField label="Liczba stopni zabiegowych" value={s.winders} onChange={(v) => setStairs({ winders: Math.round(v) })} min={s.shape === 'L' ? 2 : 4} max={s.shape === 'L' ? 4 : 7} scale={1} unit="szt." />
          )}
          <Field label={`Podział stopni (${solved.calc.flights[0].risers} + ${solved.calc.flights[1].risers}${solved.calc.winders ? ` + ${solved.calc.winders} zabiegowe` : ''})`}>
            <Segmented value={s.splitMode} onChange={(v) => setStairs({ splitMode: v, manualSplit: solved.calc.flights[0].risers })} options={[{ value: 'auto', label: 'Automatycznie' }, { value: 'manual', label: 'Ręcznie' }]} />
          </Field>
          {s.splitMode === 'manual' && <SliderField label="Stopnie w biegu 1" value={s.manualSplit} onChange={(v) => setStairs({ manualSplit: Math.round(v) })} min={2} max={N - 2 - solved.calc.winders} scale={1} unit="szt." />}
          {s.turnType !== 'winders' && <SliderField label="Głębokość spocznika" value={s.landingDepth} onChange={(v) => setStairs({ landingDepth: v })} min={60} max={200} hint={s.shape === 'L' ? 'Dla L co najmniej szerokość biegu.' : undefined} />}
          {s.shape === 'U' && s.turnType === 'winders' && <SliderField label="Głębokość zakrętu" value={s.landingDepth} onChange={(v) => setStairs({ landingDepth: v })} min={70} max={160} />}
          {s.shape === 'L' && s.turnType !== 'winders' && <SliderField label="Szerokość spocznika (wzdłuż biegu 2)" value={s.landingWidth} onChange={(v) => setStairs({ landingWidth: v })} min={80} max={200} />}
          {s.shape === 'U' && <SliderField testId="f-gap" label="Odstęp między biegami" value={s.gap} onChange={(v) => setStairs({ gap: v })} min={6} max={80} />}
        </>
      )}
    </div>
  );
}

function RailingDimsSection() {
  const c = useConfig();
  const setRailing = useStore((s) => s.setRailing);
  const r = c.railing;
  const spec = railingSpec(r.type);
  const isI = c.stairs.shape === 'I';
  const isS = c.stairs.shape === 'S';
  const sideOpts: Array<{ value: SideMode; label: string }> = [{ value: 'balustrade', label: 'Balustrada' }, { value: 'wallHandrail', label: 'Pochwyt przyścienny' }, { value: 'none', label: 'Brak' }];
  return (
    <div>
      <SliderField label="Wysokość balustrady" value={r.height} onChange={(v) => setRailing({ height: v })} min={80} max={120} />
      {spec.hasSpacing && (
        <>
          <SliderField label={r.type === 'flatBars' ? 'Szerokość płaskownika' : 'Średnica pręta'} value={r.profile} onChange={(v) => setRailing({ profile: v })} min={r.type === 'flatBars' ? 20 : 10} max={r.type === 'flatBars' ? 60 : 25} scale={1000} unit="mm" />
          <SliderField label={r.type === 'horizontalBars' ? 'Rozstaw prętów (pionowo)' : 'Rozstaw osiowy'} value={r.spacing} onChange={(v) => setRailing({ spacing: v })} min={6} max={20} step={0.5} />
        </>
      )}
      {r.type === 'glass' && (
        <Field label="Grubość szkła VSG (mm)">
          <Segmented value={r.glassThickness} onChange={(v) => setRailing({ glassThickness: v })} size="sm" options={[{ value: 0.0128, label: '12,8' }, { value: 0.0168, label: '16,8' }, { value: 0.0176, label: '17,5' }, { value: 0.0215, label: '21,5' }]} />
        </Field>
      )}
      <Field label={isI ? 'Strona lewa' : isS ? 'Balustrada spiralna' : 'Strona zewnętrzna'}>
        <Segmented value={r.outer} onChange={(v) => setRailing({ outer: v })} size="sm" options={isS ? sideOpts.filter((o) => o.value !== 'wallHandrail') : sideOpts} />
      </Field>
      {!isS && <Field label={isI ? 'Strona prawa' : 'Strona wewnętrzna'}>
        <Segmented value={r.inner} onChange={(v) => setRailing({ inner: v })} size="sm" options={sideOpts} />
      </Field>}
      {!isI && !isS && c.stairs.turnType === 'landing' && <Toggle label="Balustrada wokół spocznika" checked={r.landing} onChange={(v) => setRailing({ landing: v })} />}
      <Toggle label="Balustrada przy otworze w stropie" checked={r.opening} onChange={(v) => setRailing({ opening: v })} />
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
    ...(s.layout.spiral ? [
      ['Średnica', `${cm(s.layout.spiral.radius * 2)} cm (stopień ${cm(s.calc.spiral!.treadWidth)} cm)`],
      ['Obrót', `${Math.round((s.layout.spiral.sweep * 180) / Math.PI)}°, ${c.stairs.turn === 'right' ? 'zgodnie' : 'przeciwnie'} do ruchu wskazówek`],
      ['Prześwit nad spiralą', `${cm(s.layout.spiral.selfHeadroom)} cm`],
    ] as Array<[string, string]> : [['Podział', s.calc.flights.map((f) => f.risers).join(' + ') + (s.calc.winders ? ` + ${s.calc.winders} zabiegowe` : '')] as [string, string]]),
    ...(s.layout.winder ? [['Stopnie zabiegowe', `${s.layout.winder.treads.length} szt., krok na linii chodu ${cm(s.layout.winder.walkGoing)} cm`] as [string, string]] : []),
    [s.layout.spiral ? 'Krok na linii chodu / stopnica' : 'Krok / głębokość stopnicy', `${cm(s.calc.going)} / ${cm(s.calc.treadDepth)} cm`],
    ['2h + s', `${cm(s.calc.blondel)} cm`],
    ['Nachylenie', `${s.calc.angleDeg.toFixed(1).replace('.', ',')}°`],
    ...(s.layout.spiral ? [] : [['Biegi', s.calc.flights.map((f, i) => `${i + 1}: ${f.treads} stopnic, ${cm(f.length)} cm`).join('; ')] as [string, string]]),
    ...(s.calc.landingHeight !== null ? [['Spocznik', `na ${cm(s.calc.landingHeight)} cm, ${cm(s.layout.landing!.rect.maxX - s.layout.landing!.rect.minX)} × ${cm(s.layout.landing!.rect.maxZ - s.layout.landing!.rect.minZ)} cm`] as [string, string]] : []),
    ['Rzut całkowity', `${cm(fp.maxX - fp.minX)} × ${cm(fp.maxZ - fp.minZ)} cm`],
    ['Odstępy (L/P/T/P)', `${cm(s.fit.gaps.left)} / ${cm(s.fit.gaps.right)} / ${cm(s.fit.gaps.back)} / ${cm(s.fit.gaps.front)} cm`],
    ['Otwór w stropie', `${cm(s.opening.length)} × ${cm(s.opening.width)} cm`],
    ['Min. prześwit', Number.isFinite(s.opening.minHeadroom) ? `${cm(s.opening.minHeadroom)} cm` : '—'],
    ['Wyjście na piętro', s.exitDirLabel],
    ['Konstrukcja', s.layout.spiral ? 'Kolumna centralna Ø120 mm, stopnie na tulejach' : `${structureSpec(c.structure.type).label}${s.layout.landing ? `, spocznik: ${LANDING_SUPPORTS.find((l) => l.key === c.structure.landingSupport)!.label.toLowerCase()}` : ''}${c.structure.closedRisers ? `, podstopnice: ${RISER_FINISHES.find((r) => r.key === c.structure.riserFinish)!.label.toLowerCase()}` : ''}`],
    ['Stopnice', WOODS.find((w) => w.key === c.treads.wood)!.label],
    ['Stal', `${STEEL_PRESETS.find((p) => p.key === c.steel.preset)?.label ?? c.steel.color}, ${FINISHES.find((f) => f.key === c.steel.finish)!.label.toLowerCase()}`],
    ['Balustrada', `${railingSpec(c.railing.type).label}, ${cm(c.railing.height)} cm${c.railing.type === 'glass' ? ` — ${GLASS_TINTS.find((g) => g.key === c.railing.glassTint)!.label.toLowerCase()}, ${GLASS_MOUNTS.find((g) => g.key === c.railing.glassMount)!.label.toLowerCase()}, ${GLASS_TOPS.find((g) => g.key === c.railing.glassTop)!.label.toLowerCase()}` : ''}`],
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
    </div>
  );
}
