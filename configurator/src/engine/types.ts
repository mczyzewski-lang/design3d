// Konfiguracja i wyniki — wszystkie długości w METRACH (UI pokazuje centymetry).

/** I proste, L łamane 90°, U łamane 180°, S kręcone (spiralne) */
export type Shape = 'I' | 'L' | 'U' | 'S';
export type TurnType = 'landing' | 'winders';
export type GlassMount = 'point' | 'channel' | 'clamps';
export type GlassTint = 'clear' | 'extraClear' | 'frosted' | 'grey' | 'bronze';
export type GlassTop = 'none' | 'steelCap' | 'woodCap';
export type RiserFinish = 'wood' | 'white' | 'steel';
export type Turn = 'left' | 'right';
/** Kierunek marszu przy wejściu na schody (świat: tył = −Z, przód = +Z, lewo = −X, prawo = +X). */
export type EntryDir = 'back' | 'front' | 'left' | 'right';
export type AlignX = 'left' | 'center' | 'right' | 'manual';
export type AlignZ = 'back' | 'center' | 'front' | 'manual';
export type WallKey = 'back' | 'front' | 'left' | 'right';

export type StructureType = 'centralBeam' | 'sideStringers' | 'zigzag' | 'bentPlate' | 'weldedFrame';
export type LandingSupport = 'none' | 'fourPosts' | 'framePosts' | 'wall';
export type RailingType = 'verticalBars' | 'flatBars' | 'horizontalBars' | 'perforated' | 'mesh' | 'solid' | 'glass';
export type SideMode = 'balustrade' | 'wallHandrail' | 'none';
export type HandrailShape = 'round' | 'rect' | 'flat';
export type WoodKey = 'oakNatural' | 'oakBleached' | 'oakHoney' | 'oakSmoked' | 'walnut' | 'ashNatural' | 'oakBlack';
export type SteelFinish = 'powder' | 'satin' | 'metallic' | 'brushed';

export interface RoomConfig {
  height: number; // wysokość kondygnacji (posadzka parteru -> posadzka piętra)
  width: number; // X
  depth: number; // Z
  slabThickness: number;
  wallThickness: number;
  walls: Record<WallKey, boolean>;
}

export interface OpeningConfig {
  mode: 'auto' | 'manual';
  length: number; // wzdłuż kierunku wyjścia
  width: number;
}

export interface StairConfig {
  shape: Shape;
  /** L/U: kierunek skrętu; S: kierunek obrotu (prawo = zgodnie z ruchem wskazówek zegara, patrząc z góry) */
  turn: Turn;
  /** L/U: spocznik albo stopnie zabiegowe */
  turnType: TurnType;
  /** liczba stopni zabiegowych w zakręcie (L: 2–4, U: 4–7) */
  winders: number;
  /** S: średnica schodów kręconych */
  spiralDiameter: number;
  width: number; // szerokość biegu
  going: number; // głębokość stopnia (krok)
  treadThickness: number;
  nosing: number;
  stepsMode: 'auto' | 'manual';
  preferredRiser: number;
  manualSteps: number;
  splitMode: 'auto' | 'manual';
  /** liczba stopni (podnoszeń) w biegu 1 */
  manualSplit: number;
  landingDepth: number; // wzdłuż biegu 1
  landingWidth: number; // L: wzdłuż biegu 2 (≥ szerokość biegu)
  gap: number; // U: odstęp między biegami
  entry: EntryDir;
  alignX: AlignX;
  alignZ: AlignZ;
  manualX: number;
  manualZ: number;
  wallGap: number;
  opening: OpeningConfig;
}

export interface StructureConfig {
  type: StructureType;
  landingSupport: LandingSupport;
  closedRisers: boolean;
  riserFinish: RiserFinish;
}

/** open = ażurowe, closedFront = podstopnice, boxed = zabudowa boków i spodu, solid = pełna zabudowa do posadzki, blocks = stopnie klockowe */
export type StepStyle = 'open' | 'closedFront' | 'boxed' | 'solid' | 'blocks';

export interface TreadConfig {
  wood: WoodKey;
  edge: 'square' | 'rounded';
  style: StepStyle;
}

export interface SteelConfig {
  preset: string; // klucz z katalogu lub 'custom'
  color: string;
  finish: SteelFinish;
}

export interface RailingConfig {
  type: RailingType;
  height: number;
  profile: number; // grubość pręta / szerokość płaskownika
  spacing: number; // rozstaw osiowy elementów
  handrail: HandrailShape;
  handrailMaterial: 'steel' | 'wood';
  outer: SideMode; // dla I: lewa
  inner: SideMode; // dla I: prawa
  landing: boolean;
  opening: boolean;
  glassThickness: number;
  glassMount: GlassMount;
  glassTint: GlassTint;
  glassTop: GlassTop;
  separateColor: boolean;
  color: string;
}

export interface LightingConfig {
  led: boolean;
  ledTemp: 2700 | 4000;
  ledBrightness: number; // 0..1
  night: boolean;
}

export interface Config {
  version: 1;
  collection: string;
  room: RoomConfig;
  stairs: StairConfig;
  structure: StructureConfig;
  treads: TreadConfig;
  steel: SteelConfig;
  railing: RailingConfig;
  lighting: LightingConfig;
}

// ---------------- wyniki ----------------

export interface Vec2 { x: number; z: number }
export interface Vec3 { x: number; y: number; z: number }
export interface Rect { minX: number; maxX: number; minZ: number; maxZ: number }

export interface Calc {
  totalRise: number;
  risers: number;
  rise: number;
  going: number;
  treadDepth: number; // krok + nosek
  blondel: number; // 2h + s [m]
  angleDeg: number;
  flights: Array<{ risers: number; treads: number; length: number }>;
  landingHeight: number | null;
  /** stopnie zabiegowe w zakręcie (0 = spocznik) */
  winders: number;
  spiral: null | { radius: number; columnRadius: number; walkRadius: number; theta: number; sweep: number; risersPerTurn: number; treadWidth: number };
}

/** Przekształcenie układu lokalnego schodów (u = prawa ręka, v = kierunek wejścia) do świata. */
export interface Xf { ox: number; oz: number; rx: number; rz: number; fx: number; fz: number }

export interface TreadEl {
  flight: number;
  index: number; // 1..n-1
  rect: Rect; // świat (z noskiem); dla wielokątów — prostokąt otaczający
  y: number; // górna powierzchnia
  /** stopnie zabiegowe / klinowe: obrys w rzucie (świat) */
  poly?: Vec2[];
}

export interface SpiralEl {
  center: Vec2;
  radius: number; // zewnętrzny
  columnRadius: number;
  walkRadius: number; // linia chodu
  phi0: number; // kąt początkowy (rad, w płaszczyźnie x–z, od +x w stronę +z)
  sense: 1 | -1; // +1 = zgodnie z ruchem wskazówek zegara (z góry)
  theta: number; // kąt stopnia
  sweep: number; // kąt całkowity (wielokrotność 90°)
  treads: TreadEl[];
  /** górny podest (ćwiartka kwadratu otworu) na poziomie stropu */
  platform: { rect: Rect; y: number; poly: Vec2[] };
  /** minimalny prześwit spirali nad samą sobą */
  selfHeadroom: number;
}

export interface WinderEl {
  /** punkt, wokół którego zbiegają się stopnie zabiegowe */
  pivot: Vec2;
  /** narożnik zewnętrzny (pod słup) */
  outerCorners: Vec2[];
  treads: TreadEl[];
  baseY: number;
  topY: number;
  /** długość stopnia na linii chodu */
  walkGoing: number;
  minInnerGoing: number;
}

export interface FlightEl {
  index: number;
  risers: number;
  treads: number;
  rise: number;
  going: number;
  nosing: number;
  width: number;
  length: number;
  baseY: number;
  topY: number;
  /** środek szerokości na linii pierwszego podnoszenia, na poziomie bazowym */
  origin: Vec2;
  dir: Vec2; // kierunek marszu
  left: Vec2; // lewa ręka idącego
  treadEls: TreadEl[];
  /** czy górna krawędź biegu dochodzi do spocznika (false = do stropu) */
  endsAtLanding: boolean;
  startsAtLanding: boolean;
}

export interface LandingEl {
  rect: Rect;
  y: number;
  /** wymiar wzdłuż biegu 1 i w poprzek */
  depth: number;
  width: number;
  /** kierunek biegu 1 (oś głębokości spocznika) */
  axis: Vec2;
}

export interface LocalPolyPoint { u: number; v: number; y: number }

export interface Layout {
  shape: Shape;
  xf: Xf;
  flights: FlightEl[];
  landing: LandingEl | null;
  winder: WinderEl | null;
  spiral: SpiralEl | null;
  structureRect: Rect; // rzut konstrukcji + stopnic
  footprint: Rect; // rzut całkowity z balustradami
  localSize: { across: number; along: number };
  entry: { point: Vec2; dir: Vec2 };
  exit: { point: Vec2; dir: Vec2; a: Vec2; b: Vec2; width: number };
  /** krawędzie boczne w układzie lokalnym (dla balustrad); interior: strona wnętrza schodów patrząc wzdłuż ścieżki */
  edges: {
    outer: { points: LocalPolyPoint[]; interior: 'left' | 'right'; landingSeg: [number, number] | null };
    inner: { points: LocalPolyPoint[]; interior: 'left' | 'right'; breakAt?: number };
  };
  mirrored: boolean;
}

export type Level = 'error' | 'warning' | 'info';

export interface Patch {
  room?: Partial<RoomConfig>;
  stairs?: Partial<StairConfig>;
  structure?: Partial<StructureConfig>;
  railing?: Partial<RailingConfig>;
}

export interface Suggestion { id: string; label: string; patch: Patch }

export interface Message {
  id: string;
  level: Level;
  title: string;
  cause: string;
  suggestion?: string;
}

export interface Fit {
  fits: boolean;
  overflow: Record<WallKey, number>;
  gaps: Record<WallKey, number>;
  collisions: Array<{ side: WallKey; rect: Rect; wallPresent: boolean; amount: number }>;
}

export interface OpeningResult {
  rect: Rect;
  autoRect: Rect;
  exitSide: WallKey; // która krawędź otworu leży na linii wyjścia (kierunek świata)
  requiredLength: number;
  length: number;
  width: number;
  minHeadroom: number; // +Infinity jeśli nic nie leży pod stropem
  headroomShortfalls: Array<{ rect: Rect; y: number; headroom: number }>;
  exitZone: Rect;
  exitZoneDepth: number; // dostępna głębokość strefy wyjścia do ściany
}

export interface RailPath {
  id: string;
  kind: 'balustrade' | 'wallHandrail';
  scope: 'stair' | 'landing' | 'opening';
  side: 'outer' | 'inner' | 'opening';
  points: Vec3[]; // linia bazowa (poziom chodzenia), świat
  /** gładka krzywa (helisa) — słupki rzadziej niż w wierzchołkach */
  smooth?: boolean;
  /** pochwyt przyścienny: segmenty bez ściany */
  noWall?: boolean;
  wallBrackets?: Array<{ at: Vec3; to: Vec3 }>;
}

export type Status = 'ok' | 'adjust' | 'nofit';

export interface Solved {
  key: string;
  calc: Calc;
  layout: Layout;
  fit: Fit;
  opening: OpeningResult;
  rails: RailPath[];
  messages: Message[];
  suggestions: Suggestion[];
  status: Status;
  exitDirLabel: string;
}
