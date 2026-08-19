import * as THREE from 'three';
import {
  TROOPS, TROOP_KEYS, HEROES, HERO_KEYS, ENEMIES, BOSSES, LEVELS, CHAPTERS,
  buildWaves, newMods, BOONS, TIER_MUL, STAR_MUL, FRIENDLY_DAMAGE_SCALE,
  FRIENDLY_ATTACK_INTERVAL_SCALE, ENEMY_GOLD_DROP_SCALE, heroForChars,
  type TroopKey, type HeroKey, type Mods, type Boon, type EnemyKey,
} from './data';
import { sfx, vibrate } from './audio';
import { FxEngine } from './fx';

// ---------- 经典塔防地图 ----------
// 5列 × 9行 瓦片地图，敌军沿蛇形道路行进，道路之间的空地为可布阵地块
const T = 1.32;                       // 瓦片边长
const HERO_TOKEN_CHANCE = 0.05;
const ENEMY_SPAWN_INTERVAL_SCALE = 2.25;
const ENEMY_GROUP_DELAY_SCALE = 1.5;
const WAVE_BREAK_DURATION = 4.5;
const GRID_C = 5, GRID_R = 9;
const GRID_TOP = 5.4;
const colX = (c: number) => (c - (GRID_C - 1) / 2) * T;
const rowY = (r: number) => GRID_TOP - r * T;

// 道路瓦片（蛇形）：行0/2/4/6 整行；行1/7 在最左列；行3/5 在最右列 …… 实际走向见 PATH
const ROAD_TILES = new Set<string>();
(() => {
  for (const r of [0, 2, 4, 6]) for (let c = 0; c < GRID_C; c++) ROAD_TILES.add(`${r},${c}`);
  ROAD_TILES.add('1,4'); ROAD_TILES.add('3,0'); ROAD_TILES.add('5,4');
  ROAD_TILES.add('7,0'); ROAD_TILES.add('8,0');
})();

// 可布阵地块（恰好16个，全部紧贴道路两侧）
const BUILD: { r: number; c: number }[] = [];
(() => {
  for (const c of [0, 1, 2, 3]) BUILD.push({ r: 1, c });
  for (const c of [1, 2, 3, 4]) BUILD.push({ r: 3, c });
  for (const c of [0, 1, 2, 3]) BUILD.push({ r: 5, c });
  for (const c of [1, 2, 3, 4]) BUILD.push({ r: 7, c });
})();

// 敌军路线：沿道路瓦片中心蛇形而下，终点为阿斗
const PATH: [number, number][] = [
  [colX(0), rowY(0) + T * 1.8],
  [colX(0), rowY(0)], [colX(4), rowY(0)],
  [colX(4), rowY(2)], [colX(0), rowY(2)],
  [colX(0), rowY(4)], [colX(4), rowY(4)],
  [colX(4), rowY(6)], [colX(0), rowY(6)],
  [colX(0), rowY(8)],
  [colX(0), rowY(8) - T * 0.95],
];
export const ADOU_POS = { x: colX(0), y: rowY(8) - T * 0.95 };
export const CAM_CENTER_Y = (rowY(0) + T * 1.2 + ADOU_POS.y - T * 0.7) / 2;
const PATH_SPEED_SCALE = 0.7;

function cellPos(cell: number) {
  const b = BUILD[cell];
  return { x: colX(b.c), y: rowY(b.r) };
}
function cellAt(x: number, y: number) {
  const c = Math.round(x / T + (GRID_C - 1) / 2);
  const r = Math.round((GRID_TOP - y) / T);
  if (Math.abs(x - colX(c)) > T * 0.52 || Math.abs(y - rowY(r)) > T * 0.52) return -1;
  return BUILD.findIndex(b => b.r === r && b.c === c);
}
/** 就近吸附到可布阵地块（拖拽落点用，容错更大） */
function nearestCell(x: number, y: number, maxDist = T * 1.15) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < BUILD.length; i++) {
    const p = cellPos(i);
    const d = Math.hypot(x - p.x, y - p.y);
    if (d < bd) { bd = d; best = i; }
  }
  return bd <= maxDist ? best : -1;
}

const SEG: { ax: number; ay: number; bx: number; by: number; len: number; acc: number }[] = [];
let PATH_LEN = 0;
(() => {
  let acc = 0;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, ay] = PATH[i], [bx, by] = PATH[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    SEG.push({ ax, ay, bx, by, len, acc });
    acc += len;
  }
  PATH_LEN = acc;
})();
function pathPoint(t: number) {
  if (t <= 0) return { x: PATH[0][0], y: PATH[0][1], dx: 1, dy: 0 };
  for (const s of SEG) {
    if (t <= s.acc + s.len) {
      const k = (t - s.acc) / s.len;
      return { x: s.ax + (s.bx - s.ax) * k, y: s.ay + (s.by - s.ay) * k, dx: (s.bx - s.ax) / s.len, dy: (s.by - s.ay) / s.len };
    }
  }
  const last = SEG[SEG.length - 1];
  return { x: last.bx, y: last.by, dx: 0, dy: -1 };
}

// ---------- 贴图 ----------
const texCache = new Map<string, THREE.CanvasTexture>();
/**
 * char    主字（将魂=单字，武将=全名首字兜底）
 * full    武将全名（如「赵云」）→ 双字横排宽幅铭牌
 * token   将魂字牌 → 金色特殊边框
 */
function pieceTexture(char: string, color: string, level: number, hero: boolean, enemy: boolean, boss = false, token = false, full = '') {
  const key = `${char}|${full}|${color}|${level}|${hero}|${enemy}|${boss}|${token}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const S = 160;
  const W = full ? S * 2.1 : S;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = S;
  const g = cv.getContext('2d')!;
  const cx = W / 2, cy = S / 2, R = S * 0.42;
  g.clearRect(0, 0, W, S);

  if (token) {
    // ===== 将魂字牌：圆角玉牌 + 金色双环 + 四角鎏金角标 =====
    const r = S * 0.18;
    const pad = 10;
    g.beginPath();
    g.roundRect(pad, pad, S - pad * 2, S - pad * 2, r);
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#fbf3dc'); grd.addColorStop(1, '#efe0ba');
    g.fillStyle = grd; g.fill();
    g.lineWidth = 7; g.strokeStyle = '#c79a3b'; g.stroke();          // 外金环
    g.beginPath();
    g.roundRect(pad + 8, pad + 8, S - (pad + 8) * 2, S - (pad + 8) * 2, r * 0.7);
    g.lineWidth = 2.5; g.strokeStyle = color; g.stroke();              // 内色环
    // 鎏金四角
    g.strokeStyle = '#d4a12a'; g.lineWidth = 5; g.lineCap = 'round';
    const q = S * 0.16, m = pad + 3;
    [[m, m, 1, 1], [S - m, m, -1, 1], [m, S - m, 1, -1], [S - m, S - m, -1, -1]].forEach(([x, y, sx, sy]) => {
      g.beginPath();
      g.moveTo(x + sx * q, y); g.lineTo(x, y); g.lineTo(x, y + sy * q);
      g.stroke();
    });
    // 微光晕
    const gl = g.createRadialGradient(cx, cy, R * 0.2, cx, cy, R);
    gl.addColorStop(0, 'rgba(212,161,42,0.16)'); gl.addColorStop(1, 'rgba(212,161,42,0)');
    g.fillStyle = gl; g.fillRect(0, 0, S, S);
    g.fillStyle = color;
    g.font = `bold ${Math.floor(S * 0.46)}px "STKaiti","KaiTi","Songti SC",serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(char, cx, cy + S * 0.01);
    // 「魂」小印
    g.fillStyle = '#8a2b1f';
    g.font = `bold ${Math.floor(S * 0.1)}px "STKaiti","KaiTi",serif`;
    g.fillRect(S - 34, S - 40, 20, 20);
    g.fillStyle = '#f7ecd8';
    g.fillText('魂', S - 24, S - 29);
  } else if (full) {
    // ===== 武将双字宽幅铭牌（占两格） =====
    g.beginPath();
    g.roundRect(6, 8, W - 12, S - 16, 26);
    const grd = g.createLinearGradient(0, 0, 0, S);
    grd.addColorStop(0, '#fdf7e6'); grd.addColorStop(1, '#e8dcbd');
    g.fillStyle = grd; g.fill();
    g.lineWidth = 8; g.strokeStyle = color; g.stroke();
    g.beginPath();
    g.roundRect(14, 16, W - 28, S - 32, 20);
    g.lineWidth = 3; g.strokeStyle = '#c79a3b'; g.stroke();
    g.fillStyle = color;
    g.font = `bold ${Math.floor(S * 0.5)}px "STKaiti","KaiTi","Songti SC",serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(full, cx, cy - S * 0.05);
    const n = level;
    for (let i = 0; i < n; i++) {
      const px = cx + (i - (n - 1) / 2) * S * 0.12;
      g.fillStyle = '#d4a12a';
      star(g, px, cy + S * 0.32, S * 0.05, S * 0.023, 5);
      g.fill();
      g.lineWidth = 1.4; g.strokeStyle = '#7a5a12'; g.stroke();
    }
  } else {
    // ===== 常规棋子 =====
    g.beginPath();
    if (hero) {
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 3;
        const px = cx + Math.cos(a) * R * 1.06, py = cy + Math.sin(a) * R * 1.06;
        i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
      }
      g.closePath();
    } else {
      g.arc(cx, cy, R, 0, Math.PI * 2);
    }
    const grd = g.createLinearGradient(0, cy - R, 0, cy + R);
    if (enemy) { grd.addColorStop(0, '#3a3330'); grd.addColorStop(1, '#181413'); }
    else if (hero) { grd.addColorStop(0, '#fdf7e6'); grd.addColorStop(1, '#e8dcbd'); }
    else { grd.addColorStop(0, '#faf5ea'); grd.addColorStop(1, '#e6ddca'); }
    g.fillStyle = grd; g.fill();
    g.lineWidth = hero ? 8 : boss ? 9 : 6;
    g.strokeStyle = color; g.stroke();
    if (hero) { g.lineWidth = 2.5; g.strokeStyle = '#c79a3b'; g.stroke(); }
    g.fillStyle = enemy ? '#f3e4d4' : color;
    g.font = `bold ${Math.floor(S * (boss ? 0.5 : 0.48))}px "STKaiti","KaiTi","Songti SC",serif`;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(char, cx, cy + S * 0.02);
    if (level > 1 || hero) {
      const n = level;
      for (let i = 0; i < n; i++) {
        const px = cx + (i - (n - 1) / 2) * S * 0.11;
        const py = cy + R * (hero ? 0.72 : 0.66);
        g.beginPath();
        if (hero) {
          g.fillStyle = '#d4a12a';
          star(g, px, py, S * 0.048, S * 0.021, 5);
          g.fill();
          g.lineWidth = 1.4; g.strokeStyle = '#7a5a12'; g.stroke();
        } else {
          g.fillStyle = color;
          g.arc(px, py, S * 0.032, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, tex);
  return tex;
}
function star(g: CanvasRenderingContext2D, x: number, y: number, r1: number, r2: number, n: number) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = -Math.PI / 2 + i * Math.PI / n;
    const r = i % 2 ? r2 : r1;
    const px = x + Math.cos(a) * r, py = y + Math.sin(a) * r;
    i === 0 ? g.moveTo(px, py) : g.lineTo(px, py);
  }
  g.closePath();
}

const textCache = new Map<string, THREE.CanvasTexture>();
function textTexture(text: string, color: string, bold = false) {
  const key = text + color + bold;
  const hit = textCache.get(key);
  if (hit) return hit;
  if (textCache.size > 500) { textCache.forEach(t => t.dispose()); textCache.clear(); }
  const w = 256, h = 128;
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const g = cv.getContext('2d')!;
  g.font = `${bold ? 900 : 700} ${bold ? 78 : 62}px "PingFang SC","Microsoft YaHei",sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(20,15,10,0.85)';
  g.strokeText(text, w / 2, h / 2);
  g.fillStyle = color;
  g.fillText(text, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  textCache.set(key, tex);
  return tex;
}

// ---------- 类型 ----------
/** 位置：t=0 战场地块 i=格号；t=1 将魂池槽位 i=槽号 */
export type Loc = { t: 0 | 1; i: number };
export interface Unit {
  id: number;
  kind: 'troop' | 'token' | 'hero';
  hero: boolean;          // kind === 'hero'
  key: string;            // 兵种key / 武将key
  tokenChar?: string;     // 将魂字牌的字
  lv: number;             // 兵=阶 武将=星
  loc: Loc[];             // 占位（武将占相邻2格）
  cd: number; skillCd: number; skillMax: number; kills: number;
  stun: number; mesh: THREE.Mesh; barMesh?: THREE.Mesh;
}

// 可布阵地块的水平相邻对（武将觉醒/移动用）
const ADJ_PAIRS: [number, number][] = [
  [0, 1], [1, 2], [2, 3],
  [4, 5], [5, 6], [6, 7],
  [8, 9], [9, 10], [10, 11],
  [12, 13], [13, 14], [14, 15],
];
function areAdjacent(a: number, b: number) {
  return ADJ_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}
interface Enemy {
  id: number; key: string; boss: boolean; char: string; name: string;
  hp: number; maxHp: number; shield: number; t: number; speed: number;
  lives: number; gold: number; elite: boolean; dr: number;
  aura: boolean; ccImmuneOnce: boolean; ccUsed: boolean;
  slowT: number; slowMul: number; stun: number; burn: number; burnDmg: number;
  x: number; y: number; size: number;
  mesh: THREE.Mesh; bar: THREE.Mesh; barBg: THREE.Mesh;
  rage: boolean; mechT: number; chargeT: number; killer: string; flashT?: number;
}
interface Effect {
  mesh: THREE.Mesh; life: number; max: number; kind: string;
  vx?: number; vy?: number; s0?: number; s1?: number; rot?: number;
}
export interface Snapshot {
  gold: number; wave: number; waves: number; adouHp: number; adouMax: number;
  cost: number; kills: number; paused: boolean; speed: number;
  boss: { name: string; hp: number; max: number; shield: number; mech: string } | null;
  selected: null | { name: string; sub: string; lv: number; hero: boolean; dmg: number; aspd: number; range: number; skill?: string; skillPct?: number };
  boons: { id: string; name: string; n: number }[];
  boardCount: number;
  pool: { key: string; kind: string; lv: number; char: string; part: number; color: string; skill?: string; skillPct?: number }[];
  inWaveBreak: boolean;
  nextWaveIn: number;
}
export interface EndResult {
  win: boolean; stars: number; kills: number; adouHp: number; adouMax: number;
  wave: number; goldLeft: number; timeSec: number; revived: boolean;
  bestHero: { name: string; kills: number } | null;
  heroes: string[]; maxStar: number; heroCount: number;
  seenEnemies: string[]; seenBoss: string[]; madeHeroes: string[]; madeTroops: string[];
  bossKilled: string | null;
  peakHeroCount: number; taoyuan: boolean; wuhu: boolean; maxHeroKills: number;
}
type EventCb = (type: string, payload?: any) => void;

export interface GameOpts {
  levelId: number;
  perm: { troopDmg: number; heroDmg: number; startGold: number; costMul: number; adouHp: number };
  shake: boolean; vibrate: boolean; quality: 'high' | 'low';
  onSnapshot: (s: Snapshot) => void;
  onEvent: EventCb;
}

let uid = 1;

export class Game {
  canvas: HTMLCanvasElement;
  opts: GameOpts;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.OrthographicCamera;
  worldW = 10; worldH = 14;

  units: Unit[] = [];
  enemies: Enemy[] = [];
  effects: Effect[] = [];
  fires: { x: number; y: number; t: number; mesh: THREE.Mesh }[] = [];

  gold = 0; recruits = 0; kills = 0;
  adouHp = 20; adouMax = 20;
  wave = 0; waveDefs: ReturnType<typeof buildWaves> = [];
  spawnQueue: { key: EnemyKey; at: number }[] = [];
  waveTimer = 0; inBreak = true; breakTime = WAVE_BREAK_DURATION; running = true;
  mods: Mods = newMods();
  boons: Record<string, number> = {};
  time = 0; speed = 1; paused = false; ended = false; revived = false;
  pauseFx = 0; shakeT = 0; shakeMag = 0;
  atkBuff = 0; atkBuffT = 0;
  fireTimer = 12;
  seenEnemies = new Set<string>(); seenBoss = new Set<string>();
  madeHeroes = new Set<string>(); madeTroops = new Set<string>();
  bossRef: Enemy | null = null;
  level = LEVELS[0];
  raf = 0; last = 0;
  selected: Unit | null = null;
  rangeRing: THREE.Mesh | null = null;
  fx!: FxEngine;
  punch = 0;
  baseHW = 5; baseHH = 7;
  proj: { x: number; y: number; tx: number; ty: number; t: number; dur: number; dmg: number; src: Unit; target: Enemy; color: string }[] = [];
  dragging: Unit | null = null; dragMoved = false; downX = 0; downY = 0; downCell = -1;
  snapAcc = 0;
  effPool: THREE.Mesh[] = [];
  destroyed = false;
  heroKillNames: Record<string, number> = {};
  peakHeroCount = 0; taoyuan = false; wuhu = false; maxHeroKills = 0;

  trackOwnership() {
    const hs = this.units.filter(u => u.hero);
    const keys = new Set(hs.map(u => u.key));
    this.peakHeroCount = Math.max(this.peakHeroCount, hs.length);
    if (keys.has('liubei') && keys.has('guanyu') && keys.has('zhangfei')) this.taoyuan = true;
    if (keys.size >= 5) this.wuhu = true;
  }

  constructor(canvas: HTMLCanvasElement, opts: GameOpts) {
    this.canvas = canvas;
    this.opts = opts;
    this.level = LEVELS[opts.levelId];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: opts.quality === 'high', alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, opts.quality === 'high' ? 2 : 1.2));
    this.renderer.setClearColor(0xf2ebdc, 1);
    this.camera = new THREE.OrthographicCamera(-5, 5, 7, -7, 0.1, 100);
    this.camera.position.z = 10;
    this.scene.add(this.camera);
    this.buildScene();
    this.resize();
    window.addEventListener('resize', this.resize);
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointercancel', this.onCancel);
    // 捕获后事件仍会冒泡到 window，单份监听即可覆盖画布内外
    window.addEventListener('pointermove', this.onMove);
    window.addEventListener('pointerup', this.onUp);

    // 初始化对局
    this.adouMax = this.level.adouHp + opts.perm.adouHp;
    this.adouHp = this.adouMax;
    this.gold = this.level.startGold + opts.perm.startGold;
    this.waveDefs = buildWaves(this.level);
    this.last = performance.now();
    this.initVFX();
    this.raf = requestAnimationFrame(this.loop);
  }

  private initVFX() {
    this.fx = new FxEngine(this.scene);
    this.fx.hooks = {
      punch: a => { this.punch = Math.max(this.punch, a); },
      shake: (m, t) => this.shake(m, t),
    };
    // 色彩管理：ACES 色调映射提升质感（不用泛光后处理，避免纸面整体发白）
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
  }

  // ---------- 场景 ----------
  boardGroup = new THREE.Group();
  buildScene() {
    // 背景宣纸
    const bgCv = document.createElement('canvas'); bgCv.width = 64; bgCv.height = 256;
    const bg = bgCv.getContext('2d')!;
    const gr = bg.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#e6dcc4'); gr.addColorStop(0.45, '#f2ebdc'); gr.addColorStop(0.62, '#efe6d2'); gr.addColorStop(1, '#ddd0b4');
    bg.fillStyle = gr; bg.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 600; i++) {
      bg.fillStyle = `rgba(120,100,70,${Math.random() * 0.05})`;
      bg.fillRect(Math.random() * 64, Math.random() * 256, 1.5, 1.5);
    }
    const bgTex = new THREE.CanvasTexture(bgCv);
    const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshBasicMaterial({ map: bgTex }));
    bgMesh.position.z = -5;
    this.scene.add(bgMesh);

    // 道路
    const pts: THREE.Vector2[] = [];
    for (const p of PATH) pts.push(new THREE.Vector2(p[0], p[1]));
    // 草地/土地底衬（整张地图）
    const mapW = GRID_C * T + 0.5, mapH = GRID_R * T + 0.5;
    const mapCy = (rowY(0) + rowY(GRID_R - 1)) / 2;
    const base = new THREE.Mesh(new THREE.PlaneGeometry(mapW, mapH),
      new THREE.MeshBasicMaterial({ color: 0xdccfae, transparent: true, opacity: 0.55 }));
    base.position.set(0, mapCy, -4.6);
    this.scene.add(base);

    const road = this.ribbon(pts, T * 0.84);
    const roadMesh = new THREE.Mesh(road, new THREE.MeshBasicMaterial({ color: 0xc4b18b }));
    roadMesh.position.z = -4;
    this.scene.add(roadMesh);
    const road2 = new THREE.Mesh(this.ribbon(pts, T * 0.99), new THREE.MeshBasicMaterial({ color: 0x8a7a5c, transparent: true, opacity: 0.4 }));
    road2.position.z = -4.2;
    this.scene.add(road2);

    // 可布阵地块
    const cellTex = (() => {
      const S = 128; const cv = document.createElement('canvas'); cv.width = cv.height = S;
      const g = cv.getContext('2d')!;
      g.fillStyle = 'rgba(250,244,226,0.62)';
      g.fillRect(6, 6, S - 12, S - 12);
      g.strokeStyle = 'rgba(60,45,30,0.45)'; g.lineWidth = 4;
      g.setLineDash([11, 7]);
      g.strokeRect(6, 6, S - 12, S - 12);
      g.setLineDash([]);
      g.strokeStyle = 'rgba(138,43,31,0.35)'; g.lineWidth = 3;
      const q = 22;
      [[6, 6, 1, 1], [S - 6, 6, -1, 1], [6, S - 6, 1, -1], [S - 6, S - 6, -1, -1]].forEach(([x, y, sx, sy]) => {
        g.beginPath(); g.moveTo(x + sx * q, y); g.lineTo(x, y); g.lineTo(x, y + sy * q); g.stroke();
      });
      return new THREE.CanvasTexture(cv);
    })();
    for (let i = 0; i < BUILD.length; i++) {
      const p = cellPos(i);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.97, T * 0.97),
        new THREE.MeshBasicMaterial({ map: cellTex, transparent: true }));
      m.position.set(p.x, p.y, -3);
      this.boardGroup.add(m);
    }
    this.scene.add(this.boardGroup);

    // 阿斗（终点营帐）
    const camp = new THREE.Mesh(new THREE.PlaneGeometry(T * 1.7, T * 1.5),
      new THREE.MeshBasicMaterial({ color: 0xb45309, transparent: true, opacity: 0.18 }));
    camp.position.set(ADOU_POS.x, ADOU_POS.y, -3.6);
    this.scene.add(camp);
    const adouTex = pieceTexture('斗', '#b45309', 1, false, false);
    this.adouMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), new THREE.MeshBasicMaterial({ map: adouTex, transparent: true }));
    this.adouMesh.position.set(ADOU_POS.x, ADOU_POS.y, -1);
    this.scene.add(this.adouMesh);
    const guard = new THREE.Mesh(new THREE.RingGeometry(0.82, 0.94, 40),
      new THREE.MeshBasicMaterial({ color: 0xb45309, transparent: true, opacity: 0.35 }));
    guard.position.set(ADOU_POS.x, ADOU_POS.y, -1.2);
    this.scene.add(guard);

    // 起点：曹军军旗
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.95),
      new THREE.MeshBasicMaterial({ map: pieceTexture('曹', '#7f1d1d', 1, false, true), transparent: true }));
    flag.position.set(PATH[0][0], PATH[0][1] + 0.35, -2);
    this.scene.add(flag);
  }
  adouMesh!: THREE.Mesh;

  ribbon(pts: THREE.Vector2[], w: number) {
    const verts: number[] = [];
    const idx: number[] = [];
    const half = w / 2;
    for (let i = 0; i < pts.length; i++) {
      const prev = pts[Math.max(0, i - 1)], next = pts[Math.min(pts.length - 1, i + 1)];
      let dx = next.x - prev.x, dy = next.y - prev.y;
      const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
      const nx = -dy * half, ny = dx * half;
      verts.push(pts[i].x + nx, pts[i].y + ny, 0, pts[i].x - nx, pts[i].y - ny, 0);
      if (i < pts.length - 1) {
        const a = i * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.setIndex(idx);
    return geo;
  }

  resize = () => {
    const w = this.canvas.clientWidth || 400, h = this.canvas.clientHeight || 600;
    this.renderer.setSize(w, h, false);
    let wh = 15.6, ww = wh * (w / h);
    if (ww < 7.7) { ww = 7.7; wh = ww * (h / w); }
    this.worldW = ww; this.worldH = wh;
    this.baseHW = ww / 2; this.baseHH = wh / 2;
    this.camera.left = -ww / 2; this.camera.right = ww / 2;
    this.camera.top = CAM_CENTER_Y + wh / 2; this.camera.bottom = CAM_CENTER_Y - wh / 2;
    this.camera.updateProjectionMatrix();
    this.fx?.setScale((h * this.renderer.getPixelRatio()) / this.worldH);
  };

  // ---------- 交互 ----------
  toWorld(cx: number, cy: number) {
    const r = this.canvas.getBoundingClientRect();
    const nx = ((cx - r.left) / r.width) * 2 - 1;
    const ny = -(((cy - r.top) / r.height) * 2 - 1);
    return { x: nx * this.worldW / 2, y: ny * this.worldH / 2 + CAM_CENTER_Y };
  }
  unitAtCell(cell: number) { return this.units.find(u => u.loc.some(l => l.t === 0 && l.i === cell)) || null; }
  unitAtLoc(loc: Loc) { return this.units.find(u => u.loc.some(l => l.t === loc.t && l.i === loc.i)) || null; }
  onField(u: Unit) { return u.loc[0].t === 0; }
  /** 单位中心位置（武将=两格中点，仅战场单位） */
  unitPos(u: Unit) {
    if (u.loc.length === 2) {
      const a = cellPos(u.loc[0].i), b = cellPos(u.loc[1].i);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    return cellPos(u.loc[0].i);
  }

  /** 找到落点附近的单位（拾取容错，仅战场） */
  pickUnitAt(x: number, y: number) {
    const c = cellAt(x, y);
    if (c >= 0) { const u = this.unitAtCell(c); if (u) return u; }
    let best: Unit | null = null, bd = Infinity;
    for (const u of this.units) {
      if (!this.onField(u)) continue;
      const p = this.unitPos(u);
      const d = Math.hypot(x - p.x, y - p.y);
      if (d < bd) { bd = d; best = u; }
    }
    return bd <= T * 0.72 ? best : null;
  }

  onDown = (e: PointerEvent) => {
    if (this.paused || this.ended) return;
    const w = this.toWorld(e.clientX, e.clientY);
    this.downX = e.clientX; this.downY = e.clientY; this.dragMoved = false;
    const u = this.pickUnitAt(w.x, w.y);
    this.downCell = u ? u.loc[0].i : cellAt(w.x, w.y);
    if (u) {
      this.dragging = u;
      u.mesh.position.set(w.x, w.y, 3);
      u.mesh.scale.set(1.3, 1.3, 1);
      if (u.barMesh) u.barMesh.position.set(w.x, w.y, 2.9);
      this.showDropHints(u);
      try { this.canvas.setPointerCapture(e.pointerId); } catch { /* */ }
    }
  };
  onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    e.preventDefault?.();
    if (Math.hypot(e.clientX - this.downX, e.clientY - this.downY) > 6) this.dragMoved = true;
    const w = this.toWorld(e.clientX, e.clientY);
    this.dragging.mesh.position.set(w.x, w.y, 3);
    if (this.dragging.barMesh) this.dragging.barMesh.position.set(w.x, w.y, 2.9);
    this.highlightDrop(nearestCell(w.x, w.y));
  };
  onUp = (e: PointerEvent) => {
    // 将魂池 DOM 拖拽由 endPoolDrag 收尾，此处直接跳过
    if (this.poolDragActive) return;
    const u = this.dragging;
    this.dragging = null;
    this.clearDropHints();
    try { this.canvas.releasePointerCapture(e.pointerId); } catch { /* */ }
    if (!u) {
      if (this.downCell < 0) this.select(null);
      return;
    }
    u.mesh.scale.set(1, 1, 1);
    if (!this.dragMoved) {
      this.settle(u);
      this.select(this.selected === u ? null : u);
      sfx('click');
      return;
    }
    // 拖到将魂池 → 入池（可作垃圾桶/暂存）
    const slot = this.slotAtClient(e.clientX, e.clientY);
    if (slot >= 0) { this.placeUnitAt(u, { t: 1, i: slot }); return; }
    const w = this.toWorld(e.clientX, e.clientY);
    const cell = nearestCell(w.x, w.y);
    if (u.loc.length === 2) {
      // 武将：落到其任一占格 → 原地；否则找最近空双格
      if (cell >= 0 && (cell === u.loc[0].i || cell === u.loc[1].i)) { this.settle(u); return; }
      const s = this.findHeroSlot(u, w.x, w.y);
      if (s) { u.loc = [{ t: 0, i: s[0] }, { t: 0, i: s[1] }]; this.settle(u); this.opts.onEvent('moved'); sfx('click'); }
      else this.settle(u);
      return;
    }
    if (cell < 0) { this.settle(u); return; }
    this.placeUnitAt(u, { t: 0, i: cell });
  };
  onCancel = () => {
    const u = this.dragging;
    this.dragging = null;
    this.clearDropHints();
    if (u) { u.mesh.scale.set(1, 1, 1); this.settle(u); }
  };

  // ---- 将魂池（底部 5 槽）拖拽 API（由 React 池界面调用）----
  poolRect: DOMRect | null = null;
  setPoolRect(r: DOMRect | null) { this.poolRect = r; }
  slotAtClient(x: number, y: number): number {
    const r = this.poolRect;
    if (!r) return -1;
    if (x < r.left || x > r.right || y < r.top - 14 || y > r.bottom + 14) return -1;
    return Math.max(0, Math.min(4, Math.floor(((x - r.left) / r.width) * 5)));
  }
  poolDragActive = false;
  startPoolDrag(u: Unit) { this.dragging = u; this.poolDragActive = true; }
  poolUnits(): (Unit | null)[] { return [...this.poolSlots]; }
  endPoolDrag(cx: number, cy: number, moved: boolean) {
    this.poolDragActive = false;
    const u = this.dragging;
    this.dragging = null;
    if (!u) return;
    if (!moved) { this.opts.onEvent('poolTap', this.describe(u)); return; }
    const slot = this.slotAtClient(cx, cy);
    if (slot >= 0) { this.placeUnitAt(u, { t: 1, i: slot }); return; }
    const r = this.canvas.getBoundingClientRect();
    if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) {
      const w = this.toWorld(cx, cy);
      if (u.loc.length === 2) {
        const s = this.findHeroSlot(u, w.x, w.y);
        if (s) { u.loc = [{ t: 0, i: s[0] }, { t: 0, i: s[1] }]; this.settle(u); this.opts.onEvent('moved'); sfx('click'); return; }
      }
      const cell = nearestCell(w.x, w.y);
      if (cell >= 0) { this.placeUnitAt(u, { t: 0, i: cell }); return; }
    }
    this.settle(u);
  }
  describe(u: Unit) {
    const st = this.statsOf(u);
    if (u.kind === 'token') {
      const d = HEROES[u.key as HeroKey];
      const other = d.chars[0] === u.tokenChar ? d.chars[1] : d.chars[0];
      return { name: `将魂·${u.tokenChar ?? ''}`, sub: `与「${other}」相邻即觉醒${d.name}`, lv: 1, hero: false, dmg: 0, aspd: 0, range: 0 };
    }
    const def: any = u.kind === 'hero' ? HEROES[u.key as HeroKey] : TROOPS[u.key as TroopKey];
    return {
      name: def.name, sub: def.role, lv: u.lv, hero: u.kind === 'hero',
      dmg: Math.round(st.dmg), aspd: Math.round((1 / st.cd) * 100) / 100,
      range: Math.round(st.range * 10) / 10,
      skill: u.kind === 'hero' ? def.skill : undefined,
      skillPct: u.kind === 'hero' ? Math.max(0, Math.min(1, 1 - u.skillCd / (def.skillCd * (1 - this.mods.cdr)))) : undefined,
    };
  }

  // 拖拽时高亮所有可放置地块
  dropHints: THREE.Mesh[] = [];
  showDropHints(dragged: Unit) {
    this.clearDropHints();
    for (let i = 0; i < BUILD.length; i++) {
      const other = this.unitAtCell(i);
      let color = 0x2f855a;                       // 空地块：绿
      if (other && other !== dragged) {
        const can = this.canCombine(dragged, other);
        color = can ? 0xd8a94a : 0x8a7a5c;        // 可合成：金 / 仅交换：灰
      } else if (other === dragged) continue;
      const p = cellPos(i);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(T * 0.95, T * 0.95),
        new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22 }));
      m.position.set(p.x, p.y, -2.6);
      m.userData.cell = i; m.userData.base = 0.22;
      this.scene.add(m);
      this.dropHints.push(m);
    }
  }
  highlightDrop(cell: number) {
    for (const m of this.dropHints) {
      const on = m.userData.cell === cell;
      (m.material as THREE.MeshBasicMaterial).opacity = on ? 0.5 : m.userData.base;
      m.scale.setScalar(on ? 1.06 : 1);
    }
  }
  clearDropHints() {
    for (const m of this.dropHints) {
      this.scene.remove(m); m.geometry.dispose(); (m.material as THREE.Material).dispose();
    }
    this.dropHints = [];
  }
  /** 判断两个单位能否合成/觉醒（不产生副作用） */
  canCombine(a: Unit, b: Unit) {
    if (a === b) return false;
    if (a.kind === 'troop' && b.kind === 'troop')
      return a.key === b.key && a.lv === b.lv && a.lv < 3;
    if (a.kind === 'token' && b.kind === 'token')
      return !!heroForChars(a.tokenChar!, b.tokenChar!);
    if (a.kind === 'hero' && b.kind === 'hero')
      return a.key === b.key && a.lv === b.lv && a.lv < 3;
    return false;
  }

  select(u: Unit | null) {
    this.selected = u;
    if (this.rangeRing) { this.scene.remove(this.rangeRing); this.rangeRing.geometry.dispose(); this.rangeRing = null; }
    if (u && this.onField(u)) {
      const st = this.statsOf(u);
      const g = new THREE.RingGeometry(st.range - 0.06, st.range, 64);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0x2b6cb0, transparent: true, opacity: 0.5 }));
      const p = this.unitPos(u);
      m.position.set(p.x, p.y, -2.5);
      this.rangeRing = m; this.scene.add(m);
    }
  }

  /** 单位落位：战场单位摆网格，池单位隐藏（由 DOM 池展示），并同步池槽 */
  settle(u: Unit) {
    const field = this.onField(u);
    u.mesh.visible = field;
    if (u.barMesh) u.barMesh.visible = field;
    if (field) {
      const p = this.unitPos(u);
      u.mesh.position.set(p.x, p.y, 0);
      if (u.barMesh) u.barMesh.position.set(p.x, p.y, 0.15);
      if (this.selected === u && this.rangeRing) this.rangeRing.position.set(p.x, p.y, -2.5);
    }
    this.syncPool();
  }

  // ---------- 将魂池（底部5槽） ----------
  poolSlots: (Unit | null)[] = [null, null, null, null, null];
  syncPool() {
    this.poolSlots = [null, null, null, null, null];
    for (const u of this.units) {
      for (const l of u.loc) if (l.t === 1) this.poolSlots[l.i] = u;
    }
  }

  // ---------- 征兵（一次刷新将魂池 5 枚） ----------
  recruitCost() {
    const base = 12 + this.recruits * 4;
    return Math.max(10, Math.round(base * this.mods.recruitCostMul * this.opts.perm.costMul));
  }
  recruit() {
    if (this.ended) return false;
    const cost = this.recruitCost();
    if (this.gold < cost) { sfx('error'); return false; }
    this.gold -= cost; this.recruits++;
    // 刷新：销毁池内所有棋子（垃圾桶效果）
    for (const s of this.poolSlots) if (s) this.removeUnit(s);
    this.syncPool();
    for (let s = 0; s < 5; s++) {
      const wantToken = Math.random() < HERO_TOKEN_CHANCE;
      if (wantToken) {
        const hk = HERO_KEYS[Math.floor(Math.random() * HERO_KEYS.length)];
        const ch = HEROES[hk].chars[Math.random() < 0.5 ? 0 : 1];
        this.addUnit('token', hk, 1, [{ t: 1, i: s }], ch);
      } else {
        const key = TROOP_KEYS[Math.floor(Math.random() * 4)];
        const lv = Math.random() < this.mods.tier2Chance ? 2 : 1;
        this.addUnit('troop', key, lv, [{ t: 1, i: s }]);
      }
    }
    this.syncPool();
    this.scanAwaken(); // 池内恰好抽出相配双字 → 原地觉醒
    sfx('recruit');
    this.opts.onEvent('recruited');
    return true;
  }
  addUnit(kind: 'troop' | 'token' | 'hero', key: string, lv: number, locs: Loc[], tokenChar?: string) {
    const isHero = kind === 'hero';
    const def: any = kind === 'troop' ? TROOPS[key as TroopKey] : HEROES[key as HeroKey];
    const dispChar = tokenChar ?? def.char;
    const full = isHero ? def.name : '';
    const tex = pieceTexture(dispChar, def.color, kind === 'troop' ? lv : lv, isHero, false, false, kind === 'token', full);
    const w = isHero ? T * 1.94 : kind === 'token' ? T * 0.84 : T * 0.88;
    const h = isHero ? T * 0.94 : T * 0.9;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    let barMesh: THREE.Mesh | undefined;
    if (isHero) {
      barMesh = new THREE.Mesh(new THREE.PlaneGeometry(T * 1.9, T * 0.3),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color), transparent: true, opacity: 0.38 }));
      barMesh.position.z = 0.15;
      this.scene.add(barMesh);
    }
    const u: Unit = {
      id: uid++, kind, hero: isHero, key, tokenChar, lv, loc: [...locs],
      cd: 0.3, kills: 0, stun: 0,
      skillCd: isHero ? def.skillCd * 0.55 : 0,
      skillMax: isHero ? def.skillCd : 0, mesh, barMesh,
    };
    this.scene.add(mesh);
    this.units.push(u);
    this.settle(u);
    if (isHero) this.madeHeroes.add(key);
    else if (kind === 'troop') this.madeTroops.add(key);
    this.trackOwnership();
    return u;
  }
  removeUnit(u: Unit) {
    this.scene.remove(u.mesh);
    u.mesh.geometry.dispose();
    if (u.barMesh) { this.scene.remove(u.barMesh); u.barMesh.geometry.dispose(); }
    this.units = this.units.filter(x => x !== u);
    if (this.selected === u) this.select(null);
    this.syncPool();
    this.trackOwnership();
  }

  /** 落子/合成/交换/入池 统一入口 */
  placeUnitAt(u: Unit, tgt: Loc) {
    // 落在自己占位上 → 原地
    if (u.loc.some(l => l.t === tgt.t && l.i === tgt.i)) { this.settle(u); return; }
    const occ = this.unitAtLoc(tgt);
    if (occ && occ !== u) {
      if (this.canCombine(u, occ)) { if (this.doMerge(u, occ, tgt)) return; return; }
      // 单格互换（战场↔池 也允许，方便暂存/归队）
      if (u.loc.length === 1 && occ.loc.length === 1) {
        const old = u.loc[0];
        u.loc = [occ.loc[0]]; occ.loc = [old];
        this.settle(u); this.settle(occ);
        this.scanAwaken();
        this.opts.onEvent('moved'); sfx('click');
        return;
      }
      this.settle(u); sfx('error');
      return;
    }
    // 空位
    if (u.loc.length === 2) {
      const pair = this.adjacentPairFor(tgt, u);
      if (!pair) { this.settle(u); sfx('error'); return; }
      u.loc = pair;
    } else {
      u.loc = [tgt];
    }
    this.settle(u);
    this.scanAwaken();
    this.opts.onEvent('moved'); sfx('click');
  }

  /** 目标位 + 同面相邻空位 = 武将双格（u 将离开原占位） */
  adjacentPairFor(tgt: Loc, u: Unit): Loc[] | null {
    const neighbors = tgt.t === 0
      ? ADJ_PAIRS.map(([x, y]) => x === tgt.i ? y : y === tgt.i ? x : -1).filter(n => n >= 0)
      : [tgt.i - 1, tgt.i + 1].filter(n => n >= 0 && n < 5);
    for (const n of neighbors) {
      const occ = this.unitAtLoc({ t: tgt.t, i: n });
      if (!occ || occ === u) return [tgt, { t: tgt.t, i: n }];
    }
    return null;
  }

  /** 合成：兵升阶 / 将魂双字觉醒 / 武将升星（结果落在 tgt 位） */
  doMerge(a: Unit, b: Unit, tgt: Loc, quiet = false): boolean {
    if (a.kind === 'troop' && b.kind === 'troop' && a.key === b.key && a.lv === b.lv && a.lv < 3) {
      const key = a.key, lv = a.lv + 1;
      this.removeUnit(a); this.removeUnit(b);
      const nu = this.addUnit('troop', key, lv, [tgt]);
      if (tgt.t === 0) {
        const p = cellPos(tgt.i);
        this.mergeFx(p, TROOPS[key as TroopKey].color, false);
        this.shake(0.12, 0.08);
      }
      sfx('merge');
      this.opts.onEvent('merged', { lv: nu.lv, key: nu.key });
      return true;
    }
    if (a.kind === 'token' && b.kind === 'token') {
      const hk = heroForChars(a.tokenChar!, b.tokenChar!);
      if (hk) {
        const pair = this.adjacentPairFor(tgt, a);
        if (!pair) { if (!quiet) sfx('error'); return false; }
        const sorted = [...pair].sort((x, y) => x.i - y.i);
        this.removeUnit(a); this.removeUnit(b);
        const nu = this.addUnit('hero', hk, 1, sorted);
        this.heroBornFx(nu, false);
        return true;
      }
      if (!quiet) sfx('error');
      return false;
    }
    if (a.kind === 'hero' && b.kind === 'hero' && a.key === b.key && a.lv === b.lv && a.lv < 3) {
      const cells = [...b.loc];
      this.removeUnit(a); this.removeUnit(b);
      const nu = this.addUnit('hero', a.key, a.lv + 1, cells);
      this.heroBornFx(nu, true);
      return true;
    }
    return false;
  }

  /** 全局扫描：战场相邻 / 池内相邻 的相配将魂 → 自动觉醒 */
  scanAwaken() {
    // 战场
    const toksF = this.units.filter(u => u.kind === 'token' && u.loc[0].t === 0);
    for (let i = 0; i < toksF.length; i++) {
      const a = toksF[i];
      if (!this.units.includes(a)) continue;
      for (let j = i + 1; j < toksF.length; j++) {
        const b = toksF[j];
        if (!this.units.includes(b)) continue;
        if (!areAdjacent(a.loc[0].i, b.loc[0].i)) continue;
        const hk = heroForChars(a.tokenChar!, b.tokenChar!);
        if (hk && this.doMerge(a, b, { t: 0, i: b.loc[0].i }, true)) return;
      }
    }
    // 将魂池（相邻槽位）
    for (let i = 0; i < 4; i++) {
      const a = this.poolSlots[i], b = this.poolSlots[i + 1];
      if (a?.kind === 'token' && b?.kind === 'token') {
        const hk = heroForChars(a.tokenChar!, b.tokenChar!);
        if (hk && this.doMerge(a, b, { t: 1, i: i + 1 }, true)) return;
      }
    }
  }

  /** 为拖拽中的武将寻找最近的空双格位（战场） */
  findHeroSlot(u: Unit, x: number, y: number): [number, number] | null {
    let best: [number, number] | null = null; let bd = Infinity;
    const own = new Set(u.loc.filter(l => l.t === 0).map(l => l.i));
    for (const [a, b] of ADJ_PAIRS) {
      if (own.has(a) || own.has(b)) continue;
      const oa = this.unitAtCell(a), ob = this.unitAtCell(b);
      if ((oa && oa !== u) || (ob && ob !== u)) continue;
      const pa = cellPos(a), pb = cellPos(b);
      const d = Math.hypot(x - (pa.x + pb.x) / 2, y - (pa.y + pb.y) / 2);
      if (d < bd) { bd = d; best = [a, b]; }
    }
    return best;
  }

  heroBornFx(u: Unit, upgrade = false) {
    const def = HEROES[u.key as HeroKey];
    const field = this.onField(u);
    if (field) {
      const p = this.unitPos(u);
      this.fx.heroBorn(p.x, p.y);
      this.shake(0.45, 0.3);
    } else {
      this.fx.flash('#fbbf24', 0.3, 0.35);
    }
    sfx('hero');
    vibrate(60, this.opts.vibrate);
    this.pauseFx = field ? 0.42 : 0.3;
    this.opts.onEvent(upgrade ? 'heroUp' : 'heroBorn', { key: u.key, name: def.name, star: u.lv, char: def.char, skill: def.skill });
  }

  mergeFx(p: { x: number; y: number }, color: string, big: boolean) {
    void color;
    this.fx.mergeBurst(p.x, p.y, big);
  }
  spawnPop(p: { x: number; y: number }, color: string) {
    this.fx.spawnPop(p.x, p.y, color);
  }

  getEff(geo: THREE.BufferGeometry, color: string, opacity: number) {
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(color), transparent: true, opacity }));
    m.renderOrder = 5;
    this.scene.add(m);
    return m;
  }
  ring(x: number, y: number, r: number, color: string, life: number) {
    if (this.opts.quality === 'low' && this.effects.length > 40) return;
    const geo = new THREE.RingGeometry(r * 0.72, r * 1.0, 48);
    const m = this.getEff(geo, color, 0.8);
    m.position.set(x, y, 1.2);
    this.effects.push({ mesh: m, life, max: life, kind: 'ring', s0: 0.05, s1: 1.0 });
  }
  beam(x1: number, y1: number, x2: number, y2: number, color: string, w = 0.1, life = 0.16) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    // 主光线（中心亮）
    const geo = new THREE.PlaneGeometry(len, w);
    const m = this.getEff(geo, color, 0.9);
    m.position.set((x1 + x2) / 2, (y1 + y2) / 2, 1.1);
    m.rotation.z = Math.atan2(y2 - y1, x2 - x1);
    this.effects.push({ mesh: m, life, max: life, kind: 'beam' });
    // 外辉光（衬托）
    const glowGeo = new THREE.PlaneGeometry(len + 0.6, w * 3);
    const glow = this.getEff(glowGeo, color, 0.3);
    glow.position.set((x1 + x2) / 2, (y1 + y2) / 2, 1.05);
    glow.rotation.z = m.rotation.z;
    this.effects.push({ mesh: glow, life, max: life, kind: 'fade' });
  }
  fan(x: number, y: number, r: number, color: string) {
    // 主扇形（更清晰）
    const geo = new THREE.CircleGeometry(r, 40, -Math.PI * 0.18, Math.PI * 1.36);
    const m = this.getEff(geo, color, 0.62);
    m.position.set(x, y, 1.1);
    this.effects.push({ mesh: m, life: 0.5, max: 0.5, kind: 'fan' });
    // 边框/闪光
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        const inner = this.getEff(new THREE.RingGeometry(r * 0.5, r * 0.6, 32), color, 0.4);
        inner.position.set(x, y, 1.12);
        this.effects.push({ mesh: inner, life: 0.3, max: 0.3, kind: 'fade' });
      }, i * 60);
    }
  }
  lastHitSfx = 0;
  hitSound(crit: boolean) {
    if (this.time - this.lastHitSfx < 0.07) return;
    this.lastHitSfx = this.time;
    sfx(crit ? 'crit' : 'hit');
  }
  dmgText(x: number, y: number, v: number, crit: boolean) {
    if (this.effects.length > 120) return;
    if (this.opts.quality === 'low' && this.effects.length > 40) return;
    const tex = textTexture(String(Math.round(v)), crit ? '#fbbf24' : '#fff7e6', crit);
    const size = crit ? 1.8 : 1.2;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.5),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
    const offsetX = (Math.random() - 0.5) * 0.4, offsetY = (Math.random() - 0.5) * 0.2;
    m.position.set(x + offsetX, y + 0.5 + offsetY, 3);
    m.renderOrder = 8;
    if (crit) m.scale.set(1.15, 1.15, 1);
    this.scene.add(m);
    const dur = crit ? 0.75 : 0.65;
    this.effects.push({
      mesh: m, life: dur, max: dur, kind: 'float',
      vy: crit ? 2.2 : 1.8, rot: (Math.random() - 0.5) * 0.25,
    });
  }
  shake(mag: number, t: number) {
    if (!this.opts.shake) return;
    this.shakeMag = Math.max(this.shakeMag, mag); this.shakeT = Math.max(this.shakeT, t);
  }

  // ---------- 数值 ----------
  statsOf(u: Unit) {
    const low = this.adouHp / this.adouMax < 0.4 ? (1 + this.mods.lowHpBuff) : 1;
    const buff = this.atkBuffT > 0 ? (1 + this.atkBuff) : 1;
    if (u.hero) {
      const d = HEROES[u.key as HeroKey];
      const mul = STAR_MUL[u.lv - 1];
      return {
        dmg: d.dmg * FRIENDLY_DAMAGE_SCALE * mul * this.mods.atk * this.mods.heroAtk * this.opts.perm.heroDmg * low * buff,
        cd: d.cd * FRIENDLY_ATTACK_INTERVAL_SCALE / (this.mods.aspd * this.mods.heroAspd),
        range: d.range, attack: d.attack, splash: (d.splash || 0) * (1 + this.mods.splashBonus),
        pierce: (d.pierce || 0) + this.mods.pierceBonus,
      };
    }
    if (u.kind === 'token') {
      // 将魂字牌：无普攻、无任何战斗效果，仅为觉醒材料（可暂存池/垃圾桶）
      return {
        dmg: 0, cd: 999,
        range: 0, attack: 'single' as const, splash: 0, pierce: 0,
      };
    }
    const d = TROOPS[u.key as TroopKey];
    const mul = TIER_MUL[u.lv - 1];
    return {
      dmg: d.dmg * FRIENDLY_DAMAGE_SCALE * mul * this.mods.atk * this.mods.troopAtk[u.key as TroopKey] * this.opts.perm.troopDmg * low * buff,
      cd: d.cd * FRIENDLY_ATTACK_INTERVAL_SCALE / this.mods.aspd,
      range: d.range + this.mods.range[u.key as TroopKey] + (u.lv - 1) * 0.32,
      attack: d.attack, splash: (d.splash || 0) * (1 + this.mods.splashBonus),
      pierce: (d.pierce || 0) + this.mods.pierceBonus,
    };
  }

  // ---------- 敌人 ----------
  spawnEnemy(key: EnemyKey | 'BOSS') {
    let def: any;
    let boss = false;
    if (key === 'BOSS') {
      def = BOSSES[this.level.boss!]; boss = true;
      this.seenBoss.add(def.key);
    } else {
      def = ENEMIES[key];
      this.seenEnemies.add(key);
    }
    const hpMul = boss ? (1 + this.level.index * 0.0) : this.level.hpMul;
    const maxHp = boss ? def.hp * (1 + this.level.chapter * 0.6) : def.hp * hpMul;
    const size = boss ? 1.5 : def.size;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size),
      new THREE.MeshBasicMaterial({ map: pieceTexture(def.char, def.color, 1, false, true, boss), transparent: true }));
    mesh.position.z = 0.4;
    this.scene.add(mesh);
    const barBg = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.9, 0.09),
      new THREE.MeshBasicMaterial({ color: 0x201a16, transparent: true, opacity: 0.6 }));
    const bar = new THREE.Mesh(new THREE.PlaneGeometry(size * 0.9, 0.09),
      new THREE.MeshBasicMaterial({ color: boss ? 0xdc2626 : 0x84cc16 }));
    barBg.position.z = 0.5; bar.position.z = 0.55;
    this.scene.add(barBg); this.scene.add(bar);
    const e: Enemy = {
      id: uid++, key: def.key, boss, char: def.char, name: def.name,
      hp: maxHp, maxHp, shield: 0, t: 0,
      speed: def.speed * (boss ? 1 : this.level.spdMul) * PATH_SPEED_SCALE,
      lives: def.lives, gold: def.gold, elite: !!def.elite || boss, dr: def.dr || 0,
      aura: !!def.aura, ccImmuneOnce: !!def.ccImmuneOnce, ccUsed: false,
      slowT: 0, slowMul: 1, stun: 0, burn: 0, burnDmg: 0,
      x: PATH[0][0], y: PATH[0][1], size, mesh, bar, barBg,
      rage: false, mechT: 8, chargeT: 0, killer: '', flashT: 0,
    };
    this.enemies.push(e);
    if (boss) {
      this.bossRef = e;
      this.fx.bossSpawn(e.x, e.y);
      sfx('boss'); this.shake(0.6, 0.8); this.pauseFx = 0.9;
      this.opts.onEvent('bossIntro', { name: def.name, char: def.char, mech: def.mech, desc: def.desc });
    }
    return e;
  }
  killEnemy(e: Enemy, by: string) {
    this.kills++;
    this.gold += e.gold * this.mods.goldKillMul * ENEMY_GOLD_DROP_SCALE;
    this.fx.enemyDie(e.x, e.y, e.boss);
    this.ring(e.x, e.y, e.boss ? 4 : 1.2, e.boss ? '#dc2626' : '#7f1d1d', e.boss ? 0.8 : 0.28);
    if (e.boss) {
      sfx('win'); this.shake(0.7, 0.9); this.pauseFx = 0.8;
      this.opts.onEvent('bossDead', { name: e.name });
      this.bossRef = null;
    }
    this.removeEnemy(e);
    if (by) this.heroKillNames[by] = (this.heroKillNames[by] || 0) + 1;
  }
  removeEnemy(e: Enemy) {
    this.scene.remove(e.mesh); this.scene.remove(e.bar); this.scene.remove(e.barBg);
    e.mesh.geometry.dispose(); e.bar.geometry.dispose(); e.barBg.geometry.dispose();
    this.enemies = this.enemies.filter(x => x !== e);
    if (this.bossRef === e) this.bossRef = null;
  }
  damage(e: Enemy, raw: number, src: Unit | null, opts: { crit?: boolean; noText?: boolean; bossMul?: number } = {}) {
    if (e.hp <= 0) return;
    let d = raw;
    if (e.elite || e.boss) d *= this.mods.bossDmg * (opts.bossMul || 1);
    d *= (1 - e.dr) * (e.rage ? 0.65 : 1);
    let crit = !!opts.crit;
    if (!crit && Math.random() < this.mods.crit) crit = true;
    if (crit) { d *= this.mods.critMul; }
    if (e.shield > 0) {
      const abs = Math.min(e.shield, d);
      e.shield -= abs; d -= abs;
    }
    e.hp -= d;
    if (!opts.noText) this.dmgText(e.x, e.y, d, crit);
    if (crit) this.hitSound(true); else if (Math.random() < 0.35) this.hitSound(false);
    if (e.hp <= 0) {
      if (src) { src.kills++; if (src.hero) this.maxHeroKills = Math.max(this.maxHeroKills, src.kills); }
      this.killEnemy(e, src ? this.unitName(src) : '');
    }
  }
  unitName(u: Unit) {
    if (u.kind === 'troop') return TROOPS[u.key as TroopKey].name;
    if (u.kind === 'token') return `将魂·${u.tokenChar ?? ''}`;
    return HEROES[u.key as HeroKey].name;
  }

  // ---------- 主循环 ----------
  loop = (now: number) => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    if (this.pauseFx > 0) { this.pauseFx -= dt; dt *= 0.15; }
    if (!this.paused && !this.ended) this.update(dt * this.speed);
    this.render(dt);
  };

  update(dt: number) {
    this.time += dt;
    if (this.atkBuffT > 0) this.atkBuffT -= dt;
    this.updateWaves(dt);
    this.updateEnemies(dt);
    this.updateUnits(dt);
    this.updateFires(dt);
    this.updateEffects(dt);
    this.updateProj(dt);
    this.fx.update(dt);
    this.snapAcc += dt;
    if (this.snapAcc > 0.08) { this.snapAcc = 0; this.pushSnapshot(); }
  }

  updateProj(dt: number) {
    for (let i = this.proj.length - 1; i >= 0; i--) {
      const pr = this.proj[i];
      pr.t += dt;
      const k = Math.min(1, pr.t / pr.dur);
      const x = pr.x + (pr.tx - pr.x) * k;
      const y = pr.y + (pr.ty - pr.y) * k;
      this.fx.gongTrail(x, y, pr.color);
      if (k >= 1) {
        const e = pr.target;
        if (e && this.enemies.includes(e)) this.damage(e, pr.dmg, pr.src);
        else {
          const near = this.findTarget(pr.tx, pr.ty, 1.3);
          if (near) this.damage(near, pr.dmg, pr.src);
        }
        this.fx.gongImpact(pr.tx, pr.ty, pr.color);
        this.proj.splice(i, 1);
      }
    }
  }

  boonWaves = new Set([1, 3, 5, 7, 9]);
  updateWaves(dt: number) {
    if (this.inBreak) {
      this.breakTime -= dt;
      if (this.breakTime <= 0) this.startWave();
      return;
    }
    this.waveTimer += dt;
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.waveTimer) {
      const s = this.spawnQueue.shift()!;
      this.spawnEnemy(s.key);
    }
    if (this.spawnQueue.length === 0) {
      if (this.enemies.length === 0) {
        // 波次完成
        if (this.wave >= this.level.waves) { this.finish(true); return; }
        this.gold += 10 + this.wave * 4 + this.mods.waveGold;
        this.inBreak = true; this.breakTime = WAVE_BREAK_DURATION;
        if (this.boonWaves.has(this.wave)) this.offerBoons();
      }
    }
  }
  startWave() {
    this.inBreak = false;
    this.wave++;
    this.waveTimer = 0;
    this.spawnQueue = [];
    if (this.wave === this.level.waves && this.level.boss) {
      this.spawnQueue.push({ key: 'BOSS' as any, at: 1.2 * ENEMY_GROUP_DELAY_SCALE });
      const escort: EnemyKey[] = ['dunzu', 'buzu', 'buzu', 'jiashi', 'qingqi', 'qingqi'];
      escort.forEach((k, i) => this.spawnQueue.push({
        key: k,
        at: 3 * ENEMY_GROUP_DELAY_SCALE + i * 1.5 * ENEMY_SPAWN_INTERVAL_SCALE,
      }));
    } else {
      const def = this.waveDefs[Math.min(this.wave - 1, this.waveDefs.length - 1)];
      for (const en of def) {
        for (let i = 0; i < en.count; i++) this.spawnQueue.push({
          key: en.key,
          at: en.delay * ENEMY_GROUP_DELAY_SCALE + i * en.interval * ENEMY_SPAWN_INTERVAL_SCALE,
        });
      }
      this.spawnQueue.sort((a, b) => a.at - b.at);
    }
    this.opts.onEvent('wave', { wave: this.wave });
  }

  offerBoons() {
    const pool = BOONS.filter(b => (this.boons[b.id] || 0) < b.max);
    const picks: Boon[] = [];
    const copy = [...pool];
    for (let i = 0; i < 3 && copy.length; i++) {
      const k = Math.floor(Math.random() * copy.length);
      picks.push(copy.splice(k, 1)[0]);
    }
    if (!picks.length) return;
    this.paused = true;
    this.opts.onEvent('boons', picks.map(b => ({ id: b.id, name: b.name, desc: b.desc, tag: b.tag })));
  }
  pickBoon(id: string) {
    const b = BOONS.find(x => x.id === id);
    if (b) {
      const before = this.mods.adouHpBonus;
      const gold0 = this.mods.startGold;
      b.apply(this.mods);
      this.boons[id] = (this.boons[id] || 0) + 1;
      const addHp = this.mods.adouHpBonus - before;
      if (addHp > 0) { this.adouMax += addHp; this.adouHp = Math.min(this.adouMax, this.adouHp + addHp); }
      const addGold = this.mods.startGold - gold0;
      if (addGold > 0) this.gold += addGold;
      sfx('star');
    }
    this.paused = false;
    this.pushSnapshot();
  }

  updateEnemies(dt: number) {
    const endT = PATH_LEN;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.stun > 0) { e.stun -= dt; }
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowMul = 1; }
      if (e.burn > 0) {
        e.burn -= dt;
        e.hp -= e.burnDmg * dt;
        if (e.hp <= 0) { this.killEnemy(e, '火势'); continue; }
      }
      // Boss 机制
      if (e.boss) this.bossMech(e, dt);
      let sp = e.speed * e.slowMul;
      if (e.chargeT > 0) { sp *= 3.5; e.chargeT -= dt; }
      if (e.stun > 0) sp = 0;
      e.t += sp * dt;
      const p = pathPoint(e.t);
      e.x = p.x; e.y = p.y;
      e.mesh.position.set(p.x, p.y, 0.4);
      const ratio = Math.max(0, e.hp / e.maxHp);
      e.bar.scale.x = ratio;
      e.bar.position.set(p.x - (e.size * 0.9 * (1 - ratio)) / 2, p.y + e.size * 0.62, 0.55);
      e.barBg.position.set(p.x, p.y + e.size * 0.62, 0.5);
      const hurt = e.stun > 0 ? 0.5 : 1;
      (e.mesh.material as THREE.MeshBasicMaterial).opacity = hurt;
      (e.mesh.material as THREE.MeshBasicMaterial).transparent = true;
      if (e.t >= endT) {
        this.adouHp -= e.lives;
        sfx('damage'); this.shake(0.25, 0.2); vibrate(30, this.opts.vibrate);
        this.fx.glow(ADOU_POS.x, ADOU_POS.y, 3, '#dc2626', 0.4, 0.5);
    this.fx.ring(ADOU_POS.x, ADOU_POS.y, 2.2, '#dc2626', 0.4);
        this.removeEnemy(e);
        if (this.adouHp <= 0) { this.adouHp = 0; this.finish(false); return; }
      }
    }
  }
  bossMech(e: Enemy, dt: number) {
    e.mechT -= dt;
    const key = e.key as string;
    if (key === 'xiahoudun') {
      if (!e.rage && e.hp / e.maxHp < 0.5) {
        e.rage = true;
        this.opts.onEvent('bossSkill', { name: '拔矢啖睛', desc: '夏侯惇狂化，获得35%减伤！' });
        this.ring(e.x, e.y, 3, '#dc2626', 0.6); this.shake(0.3, 0.3);
      }
    } else if (key === 'caoren') {
      if (e.mechT <= 0) {
        e.mechT = 11;
        e.shield += e.maxHp * 0.12;
        this.opts.onEvent('bossSkill', { name: '铁壁', desc: '曹仁获得护盾！' });
        this.ring(e.x, e.y, 2.6, '#10b981', 0.5);
      }
    } else if (key === 'zhangliao') {
      if (e.mechT <= 0) {
        e.mechT = 12; e.chargeT = 2.5;
        this.opts.onEvent('bossSkill', { name: '突阵冲锋', desc: '张辽向终点疾冲！' });
        this.ring(e.x, e.y, 2.6, '#3b82f6', 0.5); this.shake(0.3, 0.3);
      }
    } else if (key === 'xuchu') {
      if (e.mechT <= 0) {
        e.mechT = 13;
        const pool = [...this.units].sort(() => Math.random() - 0.5).slice(0, 4);
        pool.forEach(u => { u.stun = 3; const pp = this.unitPos(u); this.ring(pp.x, pp.y, 1.2, '#a16207', 0.4); });
        this.opts.onEvent('bossSkill', { name: '虎痴怒吼', desc: '许褚震慑了部分己方单位！' });
        this.shake(0.4, 0.4);
      }
    }
  }

  updateFires(dt: number) {
    if (this.level.chapter !== 2) return;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = 13;
      const t = 3 + Math.random() * (PATH_LEN - 6);
      const p = pathPoint(t);
      const mesh = this.getEff(new THREE.CircleGeometry(1.9, 28), '#f97316', 0.32);
      mesh.position.set(p.x, p.y, -1.5);
      this.fires.push({ x: p.x, y: p.y, t: 7, mesh });
      this.fx.fire(p.x, p.y);
      this.opts.onEvent('fire');
      sfx('skill');
    }
    for (let i = this.fires.length - 1; i >= 0; i--) {
      const f = this.fires[i];
      f.t -= dt;
      (f.mesh.material as THREE.MeshBasicMaterial).opacity = 0.2 + Math.abs(Math.sin(this.time * 6)) * 0.22;
      const dmg = 26 * this.level.hpMul * dt;
      for (const e of [...this.enemies]) {
        if (Math.hypot(e.x - f.x, e.y - f.y) < 1.9) {
          e.hp -= dmg;
          if (e.hp <= 0) this.killEnemy(e, '火势');
        }
      }
      if (f.t <= 0) {
        this.scene.remove(f.mesh); f.mesh.geometry.dispose();
        this.fires.splice(i, 1);
      }
    }
  }

  updateUnits(dt: number) {
    // 术士光环 & 刘备光环
    const sorcerers = this.enemies.filter(e => e.aura);
    const liubeis = this.units.filter(u => u.hero && u.key === 'liubei' && this.onField(u));
    for (const u of this.units) {
      if (!this.onField(u) || u.kind === 'token') continue; // 池中单位与将魂字牌不参战
      const p = this.unitPos(u);
      if (u.stun > 0) { u.stun -= dt; u.mesh.rotation.z = Math.sin(this.time * 30) * 0.15; continue; }
      u.mesh.rotation.z = 0;
      let aspd = 1;
      for (const s of sorcerers) if (Math.hypot(s.x - p.x, s.y - p.y) < 3.4) { aspd *= 0.7; break; }
      for (const l of liubeis) {
        if (l === u) continue;
        const lp = this.unitPos(l);
        if (Math.hypot(lp.x - p.x, lp.y - p.y) < 3.6) { aspd *= 1.25; break; }
      }
      const st = this.statsOf(u);
      u.cd -= dt * aspd;
      if (u.hero) {
        u.skillCd -= dt;
        if (u.skillCd <= 0 && (this.enemies.length > 0 || u.key === 'liubei')) {
          if (this.enemies.length > 0 || this.adouHp < this.adouMax) {
            u.skillCd = HEROES[u.key as HeroKey].skillCd * (1 - this.mods.cdr);
            this.castSkill(u);
          }
        }
      }
      if (u.cd <= 0) {
        const target = this.findTarget(p.x, p.y, st.range);
        if (target) {
          u.cd = st.cd;
          this.attack(u, st, target, p);
        } else u.cd = 0.06;
      }
      // 待机动画
      if (this.dragging !== u) u.mesh.position.y = p.y + Math.sin(this.time * 2 + u.id) * 0.02;
    }
  }

  findTarget(x: number, y: number, range: number) {
    let best: Enemy | null = null, bd = Infinity;
    for (const e of this.enemies) {
      const d = Math.hypot(e.x - x, e.y - y);
      if (d <= range) {
        const score = d - (e.boss ? 0 : 0) - e.t * 0.02; // 略偏向靠前的敌人
        if (score < bd) { bd = score; best = e; }
      }
    }
    return best;
  }

  attack(u: Unit, st: ReturnType<Game['statsOf']>, target: Enemy, p: { x: number; y: number }) {
    const color = u.hero ? HEROES[u.key as HeroKey].color : TROOPS[u.key as TroopKey].color;
    switch (st.attack) {
      case 'aoe': {
        this.fx.daoSlash(p.x, p.y, target.x, target.y, color);
        for (const e of [...this.enemies]) {
          if (Math.hypot(e.x - target.x, e.y - target.y) <= st.splash) this.damage(e, st.dmg, u);
        }
        break;
      }
      case 'pierce': {
        let dx = target.x - p.x, dy = target.y - p.y;
        const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
        this.fx.qiangPierce(p.x, p.y, dx, dy, st.range, color);
        let n = 0;
        for (const e of [...this.enemies]) {
          const vx = e.x - p.x, vy = e.y - p.y;
          const proj = vx * dx + vy * dy;
          if (proj < 0 || proj > st.range) continue;
          const perp = Math.abs(vx * dy - vy * dx);
          if (perp > 0.62) continue;
          this.damage(e, st.dmg, u);
          if (++n >= st.pierce) break;
        }
        break;
      }
      case 'burst': {
        this.fx.qiImpact(target.x, target.y, color);
        this.damage(target, st.dmg, u);
        break;
      }
      default: {
        this.fx.gongShot(p.x, p.y, target.x, target.y, color);
        this.proj.push({ x: p.x, y: p.y, tx: target.x, ty: target.y, t: 0, dur: 0.18, dmg: st.dmg, src: u, target, color });
      }
    }
  }

  // ---------- 武将技能 ----------
  castSkill(u: Unit) {
    const d = HEROES[u.key as HeroKey];
    const st = this.statsOf(u);
    const p = this.unitPos(u);
    sfx('skill');
    this.shake(0.22, 0.25);
    this.opts.onEvent('skill', { name: d.name, skill: d.skill, char: d.char, color: d.color });
    switch (u.key) {
      case 'zhaoyun': {
        for (let i = 0; i < 7; i++) {
          setTimeout(() => {
            if (this.destroyed || this.ended) return;
            const tgt = this.findTarget(p.x, p.y, 20);
            if (!tgt) return;
            let dx = tgt.x - p.x, dy = tgt.y - p.y;
            const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
            this.fx.zhaoyunBeam(p.x, p.y, p.x + dx * 16, p.y + dy * 16);
            for (const e of [...this.enemies]) {
              const vx = e.x - p.x, vy = e.y - p.y;
              const proj = vx * dx + vy * dy;
              if (proj < 0) continue;
              if (Math.abs(vx * dy - vy * dx) > 0.85) continue;
              this.damage(e, st.dmg * 1.5, u, { bossMul: 1.5 });
            }
          }, i * 110);
        }
        break;
      }
      case 'guanyu': {
        this.fx.guanyuFan(p.x, p.y, st.range * 1.25, '#10b981');
        for (const e of [...this.enemies]) {
          if (Math.hypot(e.x - p.x, e.y - p.y) <= st.range * 1.25) {
            this.damage(e, st.dmg * 3.2, u);
            if (e.hp > 0) { e.slowMul = 0.45; e.slowT = 4 * this.mods.ccMul; }
          }
        }
        this.shake(0.35, 0.3);
        break;
      }
      case 'zhangfei': {
        this.fx.zhangfeiShock(p.x, p.y, st.range * 1.35);
        for (const e of [...this.enemies]) {
          if (Math.hypot(e.x - p.x, e.y - p.y) <= st.range * 1.35) {
            this.damage(e, st.dmg * 2.4, u);
            if (e.hp > 0) this.applyStun(e, e.boss ? 0.9 : 2.4);
          }
        }
        this.shake(0.4, 0.35);
        break;
      }
      case 'liubei': {
        if (this.adouHp < this.adouMax) {
          this.adouHp = Math.min(this.adouMax, this.adouHp + 2);
          this.fx.liubeiHeal(ADOU_POS.x, ADOU_POS.y);
          this.opts.onEvent('toast', { text: '仁德 · 阿斗恢复2点生命' });
        } else {
          this.atkBuff = 0.35; this.atkBuffT = 9;
          this.opts.onEvent('toast', { text: '仁德 · 全军攻击提升35%' });
          for (const un of this.units) { const pp = this.unitPos(un); this.fx.glow(pp.x, pp.y, 1.4, '#fbbf24', 0.5, 0.5); }
        }
        break;
      }
      case 'huangzhong': {
        this.fx.flash('#78350f', 0.25, 0.3);
        for (let i = 0; i < 16; i++) {
          const t = Math.random() * PATH_LEN;
          const pt = pathPoint(t);
          setTimeout(() => {
            if (this.destroyed) return;
            this.fx.gongImpact(pt.x, pt.y, '#b45309');
            this.fx.blot(pt.x, pt.y, 0.7, '#2b2219', 0.8, 0.4);
          }, i * 45);
        }
        for (const e of [...this.enemies]) this.damage(e, st.dmg * 2.2, u, { bossMul: 1.6 });
        break;
      }
      case 'machao': {
        const targets = [...this.enemies].sort((a, b) => b.t - a.t).slice(0, 12);
        let killed = 0;
        targets.forEach((e, i) => {
          setTimeout(() => {
            if (this.destroyed || this.ended) return;
            if (!this.enemies.includes(e)) return;
            this.fx.machaoDash(p.x, p.y, e.x, e.y, '#f472b6');
            const before = e.hp;
            this.damage(e, st.dmg * 1.8, u);
            if (before > 0 && e.hp <= 0) { killed++; u.skillCd = Math.max(0, u.skillCd - 1); }
          }, i * 70);
        });
        void killed;
        break;
      }
    }
  }
  applyStun(e: Enemy, t: number) {
    if (e.ccImmuneOnce && !e.ccUsed) { e.ccUsed = true; this.dmgText(e.x, e.y + 0.4, 0, false); return; }
    e.stun = Math.max(e.stun, t * this.mods.ccMul);
  }

  updateEffects(dt: number) {
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const f = this.effects[i];
      f.life -= dt;
      const k = Math.max(0, f.life / f.max);
      const mat = f.mesh.material as THREE.MeshBasicMaterial;
      
      if (f.kind === 'ring') {
        const s = (f.s0! + (f.s1! - f.s0!) * (1 - k));
        f.mesh.scale.set(s, s, 1);
        mat.opacity = k * 0.8;
      } else if (f.kind === 'spark') {
        f.mesh.position.x += f.vx! * dt; f.mesh.position.y += f.vy! * dt;
        f.vx! *= 0.88; f.vy! *= 0.88;
        if (f.rot) f.mesh.rotation.z += f.rot! * 8;
        mat.opacity = k * 0.95;
      } else if (f.kind === 'float') {
        f.mesh.position.y += f.vy! * dt * Math.pow(k, 1.4);
        if (f.rot) f.mesh.rotation.z += f.rot! * 0.8;
        mat.opacity = k * k;
      } else if (f.kind === 'beam') {
        mat.opacity = k * 0.9;
      } else if (f.kind === 'fan') {
        f.mesh.rotation.z += dt * 0.5;
        mat.opacity = k * 0.75;
      } else if (f.kind === 'flash') {
        f.mesh.scale.setScalar(1 - k * 0.3);
        mat.opacity = (1 - k) * 0.6;
      } else {
        mat.opacity = k * 0.85;
      }
      
      if (f.life <= 0) {
        this.scene.remove(f.mesh); f.mesh.geometry.dispose();
        (f.mesh.material as THREE.Material).dispose();
        this.effects.splice(i, 1);
      }
    }
  }

  render(dt: number) {
    if (this.punch > 0) this.punch = Math.max(0, this.punch - dt * 2.6);
    const s = 1 - this.punch * 0.2;
    this.camera.left = -this.baseHW * s;
    this.camera.right = this.baseHW * s;
    this.camera.top = CAM_CENTER_Y + this.baseHH * s;
    this.camera.bottom = CAM_CENTER_Y - this.baseHH * s;
    this.camera.updateProjectionMatrix();
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const m = this.shakeMag * Math.max(0, this.shakeT * 4);
      this.camera.position.x = (Math.random() - 0.5) * m * 2;
      this.camera.position.y = (Math.random() - 0.5) * m * 2;
      if (this.shakeT <= 0) { this.shakeMag = 0; this.camera.position.set(0, 0, 10); }
    }
    this.adouMesh.position.y = ADOU_POS.y + Math.sin(this.time * 1.6) * 0.05;
    this.adouMesh.rotation.z = Math.sin(this.time * 1.6) * 0.06;
    this.adouMesh.scale.setScalar(1 + Math.sin(this.time * 3) * 0.02);
    this.renderer.render(this.scene, this.camera);
  }

  pushSnapshot() {
    const u = this.selected;
    let sel: Snapshot['selected'] = null;
    if (u && this.units.includes(u)) {
      const st = this.statsOf(u);
      if (u.kind === 'token') {
        const d = HEROES[u.key as HeroKey];
        const other = d.chars[0] === u.tokenChar ? d.chars[1] : d.chars[0];
        sel = {
          name: `将魂·${u.tokenChar ?? ''}`, sub: `与「${other}」相邻即觉醒${d.name}`,
          lv: 1, hero: false, dmg: Math.round(st.dmg),
          aspd: Math.round((1 / st.cd) * 100) / 100, range: Math.round(st.range * 10) / 10,
        };
      } else {
        const def: any = u.hero ? HEROES[u.key as HeroKey] : TROOPS[u.key as TroopKey];
        sel = {
          name: def.name, sub: def.role, lv: u.lv, hero: u.hero,
          dmg: Math.round(st.dmg), aspd: Math.round((1 / st.cd) * 100) / 100,
          range: Math.round(st.range * 10) / 10,
          skill: u.hero ? def.skill : undefined,
          skillPct: u.hero ? Math.max(0, Math.min(1, 1 - u.skillCd / (def.skillCd * (1 - this.mods.cdr)))) : undefined,
        };
      }
    } else if (u) this.selected = null;
    this.opts.onSnapshot({
      gold: Math.floor(this.gold), wave: Math.max(1, this.wave), waves: this.level.waves,
      adouHp: this.adouHp, adouMax: this.adouMax, cost: this.recruitCost(),
      kills: this.kills, paused: this.paused, speed: this.speed,
      boss: this.bossRef ? {
        name: this.bossRef.name, hp: Math.max(0, this.bossRef.hp), max: this.bossRef.maxHp,
        shield: this.bossRef.shield, mech: (BOSSES as any)[this.bossRef.key].mech,
      } : null,
      selected: sel,
      boons: Object.entries(this.boons).map(([id, n]) => ({ id, name: BOONS.find(b => b.id === id)!.name, n })),
      boardCount: this.units.filter(u => this.onField(u)).reduce((a, u) => a + (u.loc.length === 2 ? 2 : 1), 0),
      pool: this.poolTileData(),
      inWaveBreak: this.inBreak,
      nextWaveIn: Math.max(0, this.breakTime),
    });
  }

  /** 将魂池 5 槽的展示数据（武将跨两槽各显示一字） */
  poolTileData() {
    const tiles: Snapshot['pool'] = [
      { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
      { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
      { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
      { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
      { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
    ];
    for (const u of this.units) {
      if (u.loc[0].t !== 1) continue;
      if (u.kind === 'hero') {
        const name = HEROES[u.key as HeroKey].name;
        const color = HEROES[u.key as HeroKey].color;
        const skillPct = Math.max(0, Math.min(1, 1 - u.skillCd / (HEROES[u.key as HeroKey].skillCd * (1 - this.mods.cdr))));
        const sorted = [...u.loc].sort((a, b) => a.i - b.i);
        for (let k = 0; k < sorted.length && k < 2; k++) {
          tiles[sorted[k].i] = { key: u.key, kind: 'hero', lv: u.lv, char: name[k], part: k, color, skill: HEROES[u.key as HeroKey].skill, skillPct };
        }
      } else {
        const def: any = u.kind === 'troop' ? TROOPS[u.key as TroopKey] : HEROES[u.key as HeroKey];
        tiles[u.loc[0].i] = {
          key: u.key, kind: u.kind, lv: u.lv,
          char: u.kind === 'token' ? (u.tokenChar ?? '?') : def.char,
          part: 0, color: def.color,
        };
      }
    }
    return tiles;
  }

  finish(win: boolean) {
    if (this.ended) return;
    this.ended = true;
    const heroes = this.units.filter(u => u.hero);
    let best: { name: string; kills: number } | null = null;
    for (const u of this.units) {
      const tag = u.kind === 'hero' ? ` ${u.lv}★` : u.kind === 'troop' ? ` ${u.lv}阶` : '';
      if (!best || u.kills > best.kills) best = { name: this.unitName(u) + tag, kills: u.kills };
    }
    let stars = 0;
    if (win) {
      stars = 1;
      if (this.adouHp >= this.adouMax * 0.6) stars++;
      if (!this.revived) stars++;
      sfx('win');
    } else sfx('lose');
    const res: EndResult = {
      win, stars, kills: this.kills, adouHp: this.adouHp, adouMax: this.adouMax,
      wave: this.wave, goldLeft: Math.floor(this.gold), timeSec: Math.round(this.time),
      revived: this.revived, bestHero: best,
      heroes: heroes.map(h => h.key), maxStar: heroes.reduce((a, h) => Math.max(a, h.lv), 0),
      heroCount: heroes.length,
      seenEnemies: [...this.seenEnemies], seenBoss: [...this.seenBoss],
      madeHeroes: [...this.madeHeroes], madeTroops: [...this.madeTroops],
      bossKilled: win && this.level.boss ? this.level.boss : null,
      peakHeroCount: this.peakHeroCount, taoyuan: this.taoyuan, wuhu: this.wuhu,
      maxHeroKills: this.maxHeroKills,
    };
    this.opts.onEvent('end', res);
  }

  revive() {
    this.revived = true;
    this.ended = false;
    this.adouHp = Math.max(6, Math.round(this.adouMax * 0.4));
    for (const e of [...this.enemies]) if (!e.boss) this.removeEnemy(e);
    this.gold += 80;
    this.paused = false;
    this.pushSnapshot();
  }

  setPaused(v: boolean) { this.paused = v; this.pushSnapshot(); }
  setSpeed(v: number) { this.speed = v; this.pushSnapshot(); }
  maxHeroCount() { return this.units.filter(u => u.hero).length; }
  heroKeysOnBoard() { return this.units.filter(u => u.hero).map(u => u.key); }

  dispose() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    this.canvas.removeEventListener('pointerdown', this.onDown);
    this.canvas.removeEventListener('pointercancel', this.onCancel);
    this.clearDropHints();
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerup', this.onUp);
    this.scene.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.renderer.dispose();
    this.fx.dispose();
  }
}

export { CHAPTERS, HERO_KEYS };
