// Miniatury SVG: kształty schodów (rzut), konstrukcje (elewacja), balustrady.
import type { RailingType, Shape, StepStyle, StructureType } from '../engine/types';

const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };

export function ShapeThumb({ shape }: { shape: Shape }) {
  const steps = (x: number, y: number, w: number, n: number, dy: number) => Array.from({ length: n }, (_, i) => <line key={i} x1={x} x2={x + w} y1={y + i * dy} y2={y + i * dy} {...S} strokeWidth={0.9} opacity={0.55} />);
  return (
    <svg viewBox="0 0 60 44" className="h-full w-full">
      {shape === 'I' && (<><rect x="23" y="4" width="14" height="36" rx="1" {...S} />{steps(23, 8, 14, 8, 4)}</>)}
      {shape === 'L' && (<><path d="M16 40 V8 H48 V20 H28 V40 Z" {...S} />{steps(16, 24, 12, 4, 4)}<rect x="16" y="8" width="12" height="12" fill="currentColor" opacity="0.12" /></>)}
      {shape === 'S' && (<><circle cx="30" cy="22" r="17" {...S} /><circle cx="30" cy="22" r="2.6" fill="currentColor" />{Array.from({ length: 10 }, (_, i) => { const a = (i / 10) * Math.PI * 1.75 + Math.PI; return <line key={i} x1={30 + 2.6 * Math.cos(a)} y1={22 + 2.6 * Math.sin(a)} x2={30 + 17 * Math.cos(a)} y2={22 + 17 * Math.sin(a)} {...S} strokeWidth={0.9} opacity={0.6} />; })}<path d="M30 22 L47 22 L47 5 L30 5 Z" fill="currentColor" opacity="0.12" /></>)}
      {shape === 'U' && (<><path d="M14 40 V6 H46 V40 H34 V18 H26 V40 Z" {...S} />{steps(14, 22, 12, 5, 4)}{steps(34, 22, 12, 5, 4)}<rect x="14" y="6" width="32" height="12" fill="currentColor" opacity="0.12" /></>)}
    </svg>
  );
}

export function StructureThumb({ type }: { type: StructureType }) {
  const treads = Array.from({ length: 5 }, (_, i) => <rect key={i} x={8 + i * 9} y={36 - i * 6.5} width="10" height="2.4" rx="0.6" fill="#b8874f" />);
  return (
    <svg viewBox="0 0 64 44" className="h-full w-full">
      {treads}
      {type === 'centralBeam' && (<><line x1="10" y1="42" x2="54" y2="12" {...S} strokeWidth={4.2} />{[0, 1, 2, 3, 4].map((i) => <line key={i} x1={13 + i * 9} y1={38 - i * 6.5} x2={13 + i * 9} y2={40.5 - i * 6.1} {...S} strokeWidth={1.2} />)}</>)}
      {type === 'sideStringers' && <path d="M6 42 L56 8 L56 15 L12 42 Z" fill="currentColor" opacity="0.85" />}
      {type === 'zigzag' && <path d="M8 42 V38.4 H17 V31.9 H26 V25.4 H35 V18.9 H44 V12.4 H53 V16 L14 42 Z" fill="currentColor" opacity="0.85" />}
      {type === 'bentPlate' && <path d="M8 42 V38.4 H17 V31.9 H26 V25.4 H35 V18.9 H44 V12.4 H54" {...S} strokeWidth={2.2} />}
      {type === 'woodStringers' && <path d="M6 42 L56 8 L56 17 L14 42 Z" fill="#9c7444" />}
      {type === 'concrete' && <path d="M8 42 V38.4 H17 V31.9 H26 V25.4 H35 V18.9 H44 V12.4 H54 V20 L22 42 Z" fill="#a9a6a0" stroke="#7d7a75" strokeWidth="0.8" />}
      {type === 'weldedFrame' && (<><line x1="8" y1="42" x2="54" y2="14" {...S} strokeWidth={2.6} />{[0, 1, 2, 3, 4].map((i) => <rect key={i} x={9 + i * 9} y={38.4 - i * 6.5} width="8" height="2" {...S} strokeWidth={1} />)}<line x1="31" y1="28" x2="31" y2="42" {...S} strokeWidth={1.6} /></>)}
    </svg>
  );
}

export function RailingThumb({ type }: { type: RailingType }) {
  const frame = <><line x1="6" y1="8" x2="58" y2="8" {...S} strokeWidth={2.4} /><line x1="6" y1="8" x2="6" y2="40" {...S} /><line x1="58" y1="8" x2="58" y2="40" {...S} /></>;
  return (
    <svg viewBox="0 0 64 44" className="h-full w-full">
      {frame}
      {type === 'verticalBars' && (<><line x1="6" y1="36" x2="58" y2="36" {...S} />{Array.from({ length: 9 }, (_, i) => <line key={i} x1={11 + i * 5.3} x2={11 + i * 5.3} y1="9" y2="36" {...S} strokeWidth={0.9} />)}</>)}
      {type === 'flatBars' && (<><line x1="6" y1="36" x2="58" y2="36" {...S} />{Array.from({ length: 6 }, (_, i) => <rect key={i} x={10 + i * 8} y="9" width="3" height="27" fill="currentColor" />)}</>)}
      {type === 'horizontalBars' && Array.from({ length: 5 }, (_, i) => <line key={i} x1="6" x2="58" y1={14 + i * 5.5} y2={14 + i * 5.5} {...S} strokeWidth={1} />)}
      {type === 'perforated' && (<><rect x="9" y="11" width="46" height="26" {...S} strokeWidth={1} />{Array.from({ length: 40 }, (_, i) => <circle key={i} cx={12 + (i % 10) * 4.5} cy={14 + Math.floor(i / 10) * 6} r="1.2" fill="currentColor" />)}</>)}
      {type === 'mesh' && (<><rect x="9" y="11" width="46" height="26" {...S} strokeWidth={1} /><path d="M9 24 L15 11 L21 24 L27 11 L33 24 L39 11 L45 24 L51 11 L55 20 M9 24 L15 37 L21 24 L27 37 L33 24 L39 37 L45 24 L51 37 L55 28" {...S} strokeWidth={0.9} /></>)}
      {type === 'solid' && <rect x="9" y="11" width="46" height="26" fill="currentColor" opacity="0.85" />}
      {type === 'glass' && (<><rect x="8" y="10" width="48" height="30" fill="#bfe3d8" opacity="0.6" stroke="#4f9c84" strokeWidth="1.4" /><circle cx="16" cy="34" r="1.6" fill="currentColor" /><circle cx="48" cy="34" r="1.6" fill="currentColor" /></>)}
    </svg>
  );
}

/** Mała elewacja 3 stopni dla stylu stopni. */
export function StepStyleThumb({ style }: { style: StepStyle }) {
  const wood = '#b8874f';
  const clad = 'currentColor';
  const steps = [0, 1, 2];
  return (
    <svg viewBox="0 0 36 28" className="h-6 w-8 shrink-0">
      {style === 'solid' && <path d="M3 26 V22 H13 V15 H23 V8 H33 V26 Z" fill={clad} opacity="0.25" />}
      {style === 'boxed' && <path d="M3 26 V22 H13 V15 H23 V8 H33 V14 L9 26 Z" fill={clad} opacity="0.25" />}
      {style === 'open' || style === 'closedFront' ? <line x1="4" y1="27" x2="33" y2="10" stroke="currentColor" strokeWidth="2" /> : null}
      {steps.map((i) => (style === 'blocks'
        ? <rect key={i} x={3 + i * 10} y={19 - i * 7} width="11" height="7" fill={wood} />
        : <rect key={i} x={3 + i * 10} y={20 - i * 7} width="11" height="2.2" fill={wood} />))}
      {(style === 'closedFront' || style === 'boxed' || style === 'solid') && steps.map((i) => <rect key={`r${i}`} x={3 + i * 10} y={22.2 - i * 7} width="1.4" height="4.8" fill={clad} opacity="0.7" />)}
    </svg>
  );
}
