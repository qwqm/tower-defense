import { LEVELS, UPGRADES, rankOf } from './data';

export interface Settings {
  bgm: boolean; sfx: boolean; shake: boolean; vibrate: boolean; quality: 'high' | 'low';
}

export interface SaveData {
  v: number;
  stars: number[];      // 每关星数 0-3
  merit: number;        // 军功
  upgrades: Record<string, number>;
  codex: { troops: string[]; heroes: string[]; enemies: string[]; bosses: string[] };
  achievements: string[];
  stats: {
    kills: number; wins: number; losses: number; heroesMade: number;
    threeStarStreak: number; bossKilled: string[];
  };
  settings: Settings;
  tutorialDone: boolean;
}

const KEY = 'changban_save_v1';

export function defaultSave(): SaveData {
  return {
    v: 1,
    stars: new Array(24).fill(0),
    merit: 0,
    upgrades: Object.fromEntries(UPGRADES.map(u => [u.id, 0])),
    codex: { troops: [], heroes: [], enemies: [], bosses: [] },
    achievements: [],
    stats: { kills: 0, wins: 0, losses: 0, heroesMade: 0, threeStarStreak: 0, bossKilled: [] },
    settings: { bgm: true, sfx: true, shake: true, vibrate: true, quality: 'high' },
    tutorialDone: false,
  };
}

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const p = JSON.parse(raw);
    const d = defaultSave();
    if (!p || typeof p !== 'object') return d;
    if (Array.isArray(p.stars) && p.stars.length === 24) d.stars = p.stars.map((x: any) => Math.max(0, Math.min(3, Number(x) || 0)));
    d.merit = Number(p.merit) || 0;
    if (p.upgrades && typeof p.upgrades === 'object') {
      for (const u of UPGRADES) d.upgrades[u.id] = Math.max(0, Math.min(u.max, Number(p.upgrades[u.id]) || 0));
    }
    if (p.codex) {
      for (const k of ['troops', 'heroes', 'enemies', 'bosses'] as const) {
        if (Array.isArray(p.codex[k])) (d.codex as any)[k] = p.codex[k].filter((x: any) => typeof x === 'string');
      }
    }
    if (Array.isArray(p.achievements)) d.achievements = p.achievements.filter((x: any) => typeof x === 'string');
    if (p.stats && typeof p.stats === 'object') {
      d.stats = { ...d.stats, ...p.stats };
      if (!Array.isArray(d.stats.bossKilled)) d.stats.bossKilled = [];
    }
    if (p.settings && typeof p.settings === 'object') d.settings = { ...d.settings, ...p.settings };
    d.tutorialDone = !!p.tutorialDone;
    return d;
  } catch {
    return defaultSave();
  }
}

export function writeSave(d: SaveData) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* ignore */ }
}

export function resetSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}

export function totalStars(d: SaveData) { return d.stars.reduce((a, b) => a + b, 0); }
export function rankName(d: SaveData) { return rankOf(totalStars(d)).name; }

export function isLevelUnlocked(d: SaveData, id: number) {
  const lv = LEVELS[id];
  const ch = [0, 8, 20, 34][lv.chapter];
  if (totalStars(d) < ch) return false;
  if (lv.index === 0) return true;
  return d.stars[id - 1] > 0;
}

export function permMods(d: SaveData) {
  const u = d.upgrades;
  return {
    troopDmg: 1 + (u.qiangbing || 0) * 0.06,
    heroDmg: 1 + (u.shenjiang || 0) * 0.07,
    startGold: (u.liangdao || 0) * 8,
    costMul: 1 - (u.haoling || 0) * 0.04,
    adouHp: (u.gushou || 0) * 2,
  };
}
