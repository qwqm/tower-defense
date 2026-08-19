// ===== 《长坂护主》核心数据 =====

export type TroopKey = 'dao' | 'qiang' | 'qi' | 'gong';
export type HeroKey = 'zhaoyun' | 'guanyu' | 'zhangfei' | 'liubei' | 'huangzhong' | 'machao' | 'lubu';

export interface TroopDef {
  key: TroopKey;
  char: string;
  name: string;
  role: string;
  desc: string;
  dmg: number;
  cd: number;
  range: number;
  attack: 'aoe' | 'pierce' | 'burst' | 'single';
  splash?: number;
  pierce?: number;
  color: string;
}

export const TROOPS: Record<TroopKey, TroopDef> = {
  dao: {
    key: 'dao', char: '刀', name: '刀兵', role: '单体高伤',
    desc: '挥刀点斩，单体伤害极高，克制精锐重甲。',
    dmg: 13, cd: 8 / 21, range: 3.4, attack: 'single', color: '#1f2937',
  },
  qiang: {
    key: 'qiang', char: '枪', name: '枪兵', role: '快速三目标范围',
    desc: '快速刺出枪芒，对目标及附近最多三名敌军造成范围伤害。',
    dmg: 6.5, cd: 8 / 21, range: 4.8, attack: 'aoe', splash: 1.5, color: '#134e4a',
  },
  qi: {
    key: 'qi', char: '骑', name: '骑兵', role: '三目标冲锋控制',
    desc: '冲击射程内最靠前的三名敌军并令其短暂停步；攻速不随阶级变化。',
    dmg: 39, cd: 2.4, range: 6.6, attack: 'burst', color: '#7c2d12',
  },
  gong: {
    key: 'gong', char: '弓', name: '弓兵', role: '远程持续',
    desc: '射程最远，稳定输出，可覆盖远端道路。',
    dmg: 5, cd: 8 / 21, range: 6.6, attack: 'single', color: '#3f3f46',
  },
};

export const TROOP_KEYS: TroopKey[] = ['dao', 'qiang', 'qi', 'gong'];
export const MAX_UNIT_LEVEL = 5;
/** 兵种升阶曲线：每一级的增益均比前一级更明显。 */
export const TIER_MUL = [1, 1.35, 1.95, 2.85, 4.25];
export const TIER_RANGE_BONUS = [0, 0.12, 0.36, 0.75, 1.3];
export const TIER_ATTACK_SPEED: Record<TroopKey, number[]> = {
  // 刀兵：0.75/s → 0.9/s → 1.16/s → 1.54/s → 2/s
  dao: [1, 1.2, 1.55, 2.05, 8 / 3],
  qiang: [1, 1.2, 1.55, 2.05, 8 / 3],
  qi: [1, 1, 1, 1, 1],
  gong: [1, 1.2, 1.55, 2.05, 8 / 3],
};
export const TROOP_RANGE_SCALE = 0.5;
export const FRIENDLY_DAMAGE_SCALE = 0.425;
export const FRIENDLY_ATTACK_INTERVAL_SCALE = 3.5;
export const ENEMY_GOLD_DROP_SCALE = 0.5;
export const ENEMY_HP_SCALE = 1.1;

export interface HeroDef {
  key: HeroKey;
  char: string;
  name: string;
  role: string;
  /** 唤醒所需的两枚字符（相邻摆放唤醒） */
  chars: [string, string];
  dmg: number;
  cd: number;
  range: number;
  attack: 'aoe' | 'pierce' | 'burst' | 'single';
  splash?: number;
  pierce?: number;
  skill: string;
  skillDesc: string;
  skillCd: number;
  passive?: string;
  advice: string;
  color: string;
}

export const HEROES: Record<HeroKey, HeroDef> = {
  zhaoyun: {
    key: 'zhaoyun', char: '赵', name: '赵云', role: '直线贯穿核心输出',
    chars: ['赵', '云'], dmg: 23, cd: 1.5, range: 7.2, attack: 'pierce', pierce: 6,
    skill: '七进七出', skillDesc: '连续释放七道枪芒贯穿全线敌军，对Boss额外造成50%伤害。',
    skillCd: 13, advice: '横向长直道旁的地块，枪芒沿车道贯穿整排敌军。', color: '#1d4ed8',
  },
  guanyu: {
    key: 'guanyu', char: '关', name: '关羽', role: '范围爆发',
    chars: ['关', '羽'], dmg: 31, cd: 1.75, range: 4.6, attack: 'aoe', splash: 1.7,
    skill: '青龙偃月', skillDesc: '斩出巨大扇形刀气，造成高额范围伤害并减速敌军4秒。',
    skillCd: 14, advice: '拐角内侧地块，可同时覆盖上下两条车道。', color: '#166534',
  },
  zhangfei: {
    key: 'zhangfei', char: '张', name: '张飞', role: '范围控制',
    chars: ['张', '飞'], dmg: 21, cd: 1.4, range: 4.4, attack: 'aoe', splash: 1.5,
    skill: '当阳断喝', skillDesc: '震慑周围敌军，造成范围伤害并眩晕2.4秒（Boss 0.9秒）。',
    skillCd: 12, advice: '最后一排地块，贴近阿斗守住漏口。', color: '#3f3f46',
  },
  liubei: {
    key: 'liubei', char: '刘', name: '刘备', role: '团队辅助',
    chars: ['刘', '备'], dmg: 15, cd: 1.35, range: 5.2, attack: 'single',
    skill: '仁德', skillDesc: '恢复阿斗2点生命；生命已满时改为全军攻击力提升35%持续9秒。',
    skillCd: 17, passive: '附近己方单位攻速提升25%。',
    advice: '地图中部地块，光环可覆盖上下相邻的己方单位。', color: '#a16207',
  },
  huangzhong: {
    key: 'huangzhong', char: '黄', name: '黄忠', role: '超远程输出',
    chars: ['黄', '忠'], dmg: 26, cd: 1.25, range: 12, attack: 'single',
    skill: '百步穿杨', skillDesc: '降下全屏箭雨，对所有敌军造成伤害，对Boss伤害提升60%。',
    skillCd: 15, advice: '任意地块皆可，射程足以横跨多条车道。', color: '#b45309',
  },
  machao: {
    key: 'machao', char: '马', name: '马超', role: '高速爆发',
    chars: ['马', '超'], dmg: 18, cd: 0.85, range: 8, attack: 'burst',
    skill: '西凉突阵', skillDesc: '疾驰连击道路上的12名敌人；每击杀一人缩短下次技能1秒。',
    skillCd: 11, advice: '中部地块，可连击贯穿多条车道上的敌军。', color: '#9d174d',
  },
  lubu: {
    key: 'lubu', char: '吕', name: '吕布', role: '跃击范围控制',
    chars: ['吕', '布'], dmg: 34, cd: 1.6, range: 4.8, attack: 'aoe', splash: 1.65,
    skill: '无双震慑', skillDesc: '锁定最靠近阿斗的敌军，预警1秒后跃击落点，造成范围伤害并恐惧敌军2秒。恐惧时敌军反向移动，移速降低60%。',
    skillCd: 20, advice: '靠近道路中段布阵，普攻与跃击都能覆盖更多敌军。', color: '#991b1b',
  },
};

export const HERO_KEYS: HeroKey[] = ['zhaoyun', 'guanyu', 'zhangfei', 'liubei', 'huangzhong', 'machao', 'lubu'];
export const STAR_MUL = [1, 2.35, 5.4, 10.8, 21.6];

/** 由两枚将魂字牌判定武将；字牌须按定义顺序相邻（赵在左、云在右）才会觉醒。 */
export function heroForChars(c1: string, c2: string): HeroKey | null {
  for (const k of HERO_KEYS) {
    const [a, b] = HEROES[k].chars;
    if (c1 === a && c2 === b) return k;
  }
  return null;
}

// ===== 敌人 =====
export type EnemyKey = 'buzu' | 'qingqi' | 'dunzu' | 'jiashi' | 'shushi' | 'hubao';
export interface EnemyDef {
  key: EnemyKey; char: string; name: string; hp: number; speed: number;
  lives: number; gold: number; elite?: boolean; dr?: number;
  aura?: boolean; ccImmuneOnce?: boolean; desc: string; color: string; size: number;
}

export const ENEMIES: Record<EnemyKey, EnemyDef> = {
  buzu: { key: 'buzu', char: '卒', name: '曹军步卒', hp: 46, speed: 1.0, lives: 1, gold: 3, desc: '最普通的曹军士兵，数量众多。', color: '#404040', size: 0.72 },
  qingqi: { key: 'qingqi', char: '骑', name: '轻骑', hp: 38, speed: 1.85, lives: 1, gold: 3, desc: '移动极快，容易穿过防线。', color: '#78350f', size: 0.72 },
  dunzu: { key: 'dunzu', char: '盾', name: '盾卒', hp: 105, speed: 0.78, lives: 1, gold: 5, dr: 0.4, desc: '重盾护体，受到伤害减免40%。', color: '#1e3a5f', size: 0.8 },
  jiashi: { key: 'jiashi', char: '甲', name: '精锐甲士', hp: 300, speed: 0.85, lives: 2, gold: 11, elite: true, dr: 0.15, desc: '精锐部队，血量厚重，突破防线损失2点生命。', color: '#581c87', size: 0.92 },
  shushi: { key: 'shushi', char: '术', name: '军中术士', hp: 130, speed: 0.9, lives: 1, gold: 9, aura: true, desc: '施放妖术，降低附近己方单位30%攻速。', color: '#0f766e', size: 0.8 },
  hubao: { key: 'hubao', char: '虎', name: '虎豹骑', hp: 420, speed: 1.35, lives: 3, gold: 14, elite: true, ccImmuneOnce: true, desc: '曹操精锐铁骑，首次受到控制时免疫。', color: '#7f1d1d', size: 0.95 },
};

export const ENEMY_KEYS: EnemyKey[] = ['buzu', 'qingqi', 'dunzu', 'jiashi', 'shushi', 'hubao'];

// ===== Boss =====
export type BossKey = 'xiahoudun' | 'zhangliao' | 'caoren' | 'xuchu';
export interface BossDef {
  key: BossKey; char: string; name: string; hp: number; speed: number; lives: number; gold: number;
  mech: string; desc: string; color: string;
}
export const BOSSES: Record<BossKey, BossDef> = {
  xiahoudun: { key: 'xiahoudun', char: '夏', name: '夏侯惇', hp: 4200, speed: 0.62, lives: 10, gold: 90, mech: '拔矢啖睛', desc: '生命低于50%后狂化，获得35%伤害减免。', color: '#7f1d1d' },
  zhangliao: { key: 'zhangliao', char: '辽', name: '张辽', hp: 5600, speed: 0.66, lives: 10, gold: 110, mech: '突阵冲锋', desc: '每12秒向终点疾冲，移速提升至3.5倍持续2.5秒。', color: '#1e40af' },
  caoren: { key: 'caoren', char: '仁', name: '曹仁', hp: 8200, speed: 0.55, lives: 12, gold: 140, mech: '铁壁护盾', desc: '每11秒获得等同12%最大生命的护盾。', color: '#065f46' },
  xuchu: { key: 'xuchu', char: '褚', name: '许褚', hp: 11500, speed: 0.6, lives: 14, gold: 180, mech: '虎痴怒吼', desc: '每13秒震慑4名己方单位，使其3秒无法攻击。', color: '#78350f' },
};
export const BOSS_KEYS: BossKey[] = ['xiahoudun', 'zhangliao', 'caoren', 'xuchu'];

// ===== 关卡 =====
export interface Chapter {
  id: number; name: string; sub: string; boss: BossKey; unlockStars: number;
  hpMul: number; spdMul: number; mechanic: string;
}
export const CHAPTERS: Chapter[] = [
  { id: 0, name: '长坂', sub: '第一章 · 长坂坡', boss: 'xiahoudun', unlockStars: 0, hpMul: 1, spdMul: 1, mechanic: '基础战场，适合熟悉征兵与合成。' },
  { id: 1, name: '当阳', sub: '第二章 · 当阳桥', boss: 'zhangliao', unlockStars: 8, hpMul: 2.1, spdMul: 1.22, mechanic: '敌军行军更快，需要尽早合成武将。' },
  { id: 2, name: '赤壁', sub: '第三章 · 赤壁火', boss: 'caoren', unlockStars: 20, hpMul: 4.2, spdMul: 1.3, mechanic: '战场周期燃起火势，灼烧道路上的敌军。' },
  { id: 3, name: '汉水', sub: '第四章 · 汉水岸', boss: 'xuchu', unlockStars: 34, hpMul: 8.6, spdMul: 1.38, mechanic: '大量精锐甲士与虎豹骑压境，考验综合运营。' },
];

export const LEVEL_NAMES = [
  ['乱军之中', '断后一击', '桥头列阵', '血染征袍', '怀抱幼主', '夏侯来袭'],
  ['当阳道上', '夜袭营寨', '铁骑追兵', '桥断水流', '喝退千军', '张辽止步'],
  ['江畔连营', '连环锁船', '东风将起', '烈焰焚江', '火烧连营', '曹仁铁壁'],
  ['汉水列阵', '虎豹压境', '粮道死守', '重甲如林', '孤军血战', '虎痴许褚'],
];

export interface LevelDef {
  id: number; chapter: number; index: number; name: string;
  waves: number; boss: BossKey | null; adouHp: number;
  hpMul: number; spdMul: number; startGold: number;
}

export const LEVELS: LevelDef[] = (() => {
  const out: LevelDef[] = [];
  for (let c = 0; c < 4; c++) {
    const ch = CHAPTERS[c];
    for (let i = 0; i < 6; i++) {
      const isBoss = i === 5;
      out.push({
        id: c * 6 + i,
        chapter: c,
        index: i,
        name: LEVEL_NAMES[c][i],
        waves: isBoss ? 12 : 8 + i,
        boss: isBoss ? ch.boss : null,
        adouHp: 6,
        hpMul: ch.hpMul * (1 + i * 0.17),
        spdMul: ch.spdMul,
        startGold: 20,
      });
    }
  }
  return out;
})();

export interface WaveEntry { key: EnemyKey; count: number; interval: number; delay: number; }

export function buildWaves(lv: LevelDef): WaveEntry[][] {
  const waves: WaveEntry[][] = [];
  const c = lv.chapter;
  const rngSeedBase = lv.id * 977;
  const rnd = (n: number) => {
    const x = Math.sin(rngSeedBase + n * 31.7) * 43758.5453;
    return x - Math.floor(x);
  };
  for (let w = 0; w < lv.waves; w++) {
    const prog = w / Math.max(1, lv.waves - 1);
    const list: WaveEntry[] = [];
    const base = 6 + Math.round(w * (2.2 + c * 0.5) + lv.index * 0.7);
    list.push({ key: 'buzu', count: base, interval: Math.max(0.3, 0.7 - prog * 0.35), delay: 0 });
    if (w >= 1) list.push({ key: 'qingqi', count: 2 + Math.round(prog * (6 + c * 2.5)), interval: 0.4, delay: 2.4 });
    if (w >= 2 || c >= 1) list.push({ key: 'dunzu', count: 2 + Math.round(prog * (5 + c)), interval: 0.65, delay: 4.2 });
    if (w >= 3 && (rnd(w) > 0.35 || c >= 2)) list.push({ key: 'shushi', count: 1 + Math.round(prog * (2 + c)), interval: 1.0, delay: 5.5 });
    if (w >= 3) list.push({ key: 'jiashi', count: Math.max(0, Math.round(prog * (3 + c * 2)) - (c === 0 ? 1 : 0)), interval: 1.3, delay: 6.5 });
    if ((w >= 5 && c >= 1) || (w >= 6 && c === 0)) list.push({ key: 'hubao', count: Math.max(1, Math.round(prog * (2 + c * 2))), interval: 1.5, delay: 8 });
    if (c >= 3 && w >= 4) list.push({ key: 'jiashi', count: 1 + Math.round(prog * 3), interval: 0.9, delay: 10 });
    waves.push(list.filter(e => e.count > 0));
  }
  return waves;
}

// 军策
export interface Boon {
  id: string; name: string; desc: string; tag: string;
  max: number;
  apply: (m: Mods) => void;
}

export interface Mods {
  atk: number; aspd: number; heroAtk: number; troopAtk: Record<TroopKey, number>;
  range: Record<TroopKey, number>; pierceBonus: number; splashBonus: number;
  cdr: number; recruitCostMul: number; goldKillMul: number; waveGold: number;
  adouHpBonus: number; lowHpBuff: number; ccMul: number; crit: number; critMul: number;
  tier2Chance: number; heroAspd: number; bossDmg: number; startGold: number;
}

export function newMods(): Mods {
  return {
    atk: 1, aspd: 1, heroAtk: 1,
    troopAtk: { dao: 1, qiang: 1, qi: 1, gong: 1 },
    range: { dao: 0, qiang: 0, qi: 0, gong: 0 },
    pierceBonus: 0, splashBonus: 0, cdr: 0, recruitCostMul: 1, goldKillMul: 1,
    waveGold: 0, adouHpBonus: 0, lowHpBuff: 0, ccMul: 1, crit: 0.05, critMul: 1.6,
    tier2Chance: 0, heroAspd: 1, bossDmg: 1, startGold: 0,
  };
}

export const BOONS: Boon[] = [
  { id: 'atk1', name: '全军奋勇', desc: '全军攻击力 +7.5%', tag: '通用', max: 5, apply: m => { m.atk *= 1.075; } },
  { id: 'aspd1', name: '战鼓催征', desc: '全军攻击速度 +6%', tag: '通用', max: 5, apply: m => { m.aspd *= 1.06; } },
  { id: 'dao1', name: '环首利刃', desc: '刀兵伤害 +20%', tag: '兵种', max: 4, apply: m => { m.troopAtk.dao *= 1.2; } },
  { id: 'qiang1', name: '长枪列阵', desc: '枪兵伤害 +12.5%', tag: '兵种', max: 4, apply: m => { m.troopAtk.qiang *= 1.125; } },
  { id: 'qi1', name: '铁骑冲阵', desc: '骑兵伤害 +27.5%', tag: '兵种', max: 4, apply: m => { m.troopAtk.qi *= 1.275; } },
  { id: 'gong1', name: '强弓劲弩', desc: '弓兵射程 +0.8，伤害 +12.5%', tag: '兵种', max: 4, apply: m => { m.range.gong += 0.8; m.troopAtk.gong *= 1.125; } },
  { id: 'hero1', name: '五虎威名', desc: '武将伤害 +15%', tag: '武将', max: 5, apply: m => { m.heroAtk *= 1.15; } },
  { id: 'hero2', name: '将令如山', desc: '武将攻击速度 +10%', tag: '武将', max: 4, apply: m => { m.heroAspd *= 1.1; } },
  { id: 'cdr1', name: '兵贵神速', desc: '技能冷却 -9%', tag: '武将', max: 4, apply: m => { m.cdr += 0.09; } },
  { id: 'cost1', name: '号令三军', desc: '征兵价格 -9%', tag: '经济', max: 4, apply: m => { m.recruitCostMul *= 0.91; } },
  { id: 'gold1', name: '就地取粮', desc: '击杀获得军粮 +17.5%', tag: '经济', max: 4, apply: m => { m.goldKillMul *= 1.175; } },
  { id: 'gold2', name: '屯田积粟', desc: '每波额外获得 10 军粮', tag: '经济', max: 5, apply: m => { m.waveGold += 10; } },
  { id: 'hp1', name: '固守幼主', desc: '阿斗生命上限 +3 并立即恢复', tag: '防守', max: 4, apply: m => { m.adouHpBonus += 3; } },
  { id: 'lowhp', name: '背水一战', desc: '阿斗生命低于40%时全军攻击 +22.5%', tag: '防守', max: 3, apply: m => { m.lowHpBuff += 0.225; } },
  { id: 'cc1', name: '摄魂之威', desc: '控制时间 +17.5%', tag: '控制', max: 3, apply: m => { m.ccMul *= 1.175; } },
  { id: 'crit1', name: '锐眼', desc: '暴击率 +6%', tag: '暴击', max: 5, apply: m => { m.crit += 0.06; } },
  { id: 'crit2', name: '致命一击', desc: '暴击伤害 +30%', tag: '暴击', max: 5, apply: m => { m.critMul += 0.3; } },
  { id: 'tier2', name: '精兵征募', desc: '征兵有12.5%概率直接获得二阶单位', tag: '征兵', max: 3, apply: m => { m.tier2Chance += 0.125; } },
  { id: 'boss1', name: '斩将夺旗', desc: '对Boss与精锐伤害 +12.5%', tag: '通用', max: 4, apply: m => { m.bossDmg *= 1.125; } },
  { id: 'rich', name: '军需先行', desc: '立即获得 60 军粮', tag: '经济', max: 3, apply: m => { m.startGold += 60; } },
];

// 永久成长
export interface UpgradeDef { id: string; name: string; desc: (l: number) => string; max: number; cost: (l: number) => number; }
export const UPGRADES: UpgradeDef[] = [
  { id: 'qiangbing', name: '强兵', max: 8, desc: l => `普通士兵伤害 +${l * 6}%`, cost: l => 60 + l * 55 },
  { id: 'shenjiang', name: '神将', max: 8, desc: l => `武将伤害 +${l * 7}%`, cost: l => 80 + l * 70 },
  { id: 'liangdao', name: '粮道', max: 8, desc: l => `初始军粮 +${l * 8}`, cost: l => 50 + l * 45 },
  { id: 'haoling', name: '号令', max: 6, desc: l => `征兵价格 -${l * 4}%`, cost: l => 70 + l * 65 },
  { id: 'gushou', name: '固守', max: 6, desc: l => `阿斗初始生命 +${l * 2}`, cost: l => 65 + l * 60 },
];

export const RANKS = [
  { stars: 0, name: '士卒' }, { stars: 8, name: '伍长' }, { stars: 18, name: '什长' },
  { stars: 30, name: '都伯' }, { stars: 42, name: '校尉' }, { stars: 56, name: '中郎将' },
  { stars: 68, name: '将军' },
];
export function rankOf(stars: number) {
  let r = RANKS[0];
  for (const x of RANKS) if (stars >= x.stars) r = x;
  return r;
}
export function nextRank(stars: number) {
  for (const x of RANKS) if (stars < x.stars) return x;
  return null;
}

// 成就
export interface AchDef { id: string; name: string; desc: string; }
export const ACHIEVEMENTS: AchDef[] = [
  { id: 'first_win', name: '初战告捷', desc: '首次通关任意关卡' },
  { id: 'first_hero', name: '将星初现', desc: '首次合成一名武将' },
  { id: 'zhaoyun', name: '常山赵子龙', desc: '首次合成赵云' },
  { id: 'taoyuan', name: '桃园结义', desc: '同一局中同时拥有刘备、关羽、张飞' },
  { id: 'wuhu', name: '五虎上将', desc: '同一局中同时拥有5名不同武将' },
  { id: 'hero_kill100', name: '万人敌', desc: '单名武将单局击杀100名敌人' },
  { id: 'fast_clear', name: '兵贵神速', desc: '4分钟内通关一场战斗' },
  { id: 'full_hp', name: '毫发无伤', desc: '以满生命通关一关' },
  { id: 'kill1000', name: '斩敌千人', desc: '累计击杀1000名敌人' },
  { id: 'kill5000', name: '尸横遍野', desc: '累计击杀5000名敌人' },
  { id: 'three_star3', name: '连战连捷', desc: '连续三次获得三星通关' },
  { id: 'board6', name: '群将聚首', desc: '军阵中同时存在6名武将' },
  { id: 'star3hero', name: '三星将魂', desc: '合成一名三星武将' },
  { id: 'rich_win', name: '粮草充盈', desc: '以剩余400以上军粮通关' },
  { id: 'onehp', name: '一线生机', desc: '以仅剩1点生命通关' },
  { id: 'boss_all', name: '四将授首', desc: '击败全部四名Boss' },
  { id: 'all24', name: '长坂无双', desc: '通关全部24个关卡' },
  { id: 'star72', name: '功盖三分', desc: '累计获得60颗星' },
];
