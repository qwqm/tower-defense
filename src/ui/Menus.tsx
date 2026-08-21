import { useState, type CSSProperties } from 'react';
import {
  CHAPTERS, LEVELS, TROOPS, TROOP_KEYS, HEROES, HERO_KEYS, ENEMIES, ENEMY_KEYS,
  BOSSES, BOSS_KEYS, UPGRADES, ACHIEVEMENTS, FRIENDLY_DAMAGE_SCALE,
  FRIENDLY_ATTACK_INTERVAL_SCALE, ENEMY_GOLD_DROP_SCALE, ENEMY_HP_SCALE,
  MAX_UNIT_LEVEL, TIER_MUL, TIER_RANGE_BONUS, TIER_ATTACK_SPEED, TROOP_RANGE_SCALE, rankOf, nextRank,
} from '../game/data';
import type { SaveData } from '../game/save';
import { totalStars, isLevelUnlocked } from '../game/save';
import { InkButton, Stars, Screen, Card, Piece, Metric, SectionTitle } from './common';
import { sfx } from '../game/audio';

/* ---------------- 首页 ---------------- */
export function Home({ save, go }: { save: SaveData; go: (s: string) => void }) {
  const stars = totalStars(save);
  const rank = rankOf(stars);
  const nx = nextRank(stars);
  const rankProgress = nx
    ? Math.min(100, ((stars - rank.stars) / (nx.stars - rank.stars)) * 100)
    : 100;
  return (
    <div className="ink-noise ink-vignette relative flex h-full flex-col overflow-hidden bg-[#f0e7d2]">
      <div className="ink-bg ink-radial-glow pointer-events-none absolute inset-0" />
      <div className="drift-cloud pointer-events-none absolute -left-[18%] top-[12%] h-40 w-[136%] rounded-[50%] bg-[#fff4d8]/25 blur-3xl" />
      <div className="drift-cloud pointer-events-none absolute -right-[22%] bottom-[18%] h-44 w-[120%] rounded-[50%] bg-[#8a2b1f]/[0.07] blur-3xl" style={{ animationDelay: '-6s' }} />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(9)].map((_, i) => (
          <div key={i} className="float-ink absolute font-serif text-[#3b3229]/10"
            style={{ left: `${4 + i * 12}%`, top: `${8 + (i % 5) * 18}%`, fontSize: `${38 + (i % 4) * 24}px`, animationDelay: `${i * 1.2}s`, animationDuration: `${9 + i * 1.2}s` }}>
            {'刀枪骑弓赵关张刘备'[i]}
          </div>
        ))}
      </div>
      <div className="relative z-10 flex items-center justify-between px-5 pt-4 text-[10px] tracking-[0.18em] text-[#7a6a55]">
        <span className="seal-stamp rounded-sm border border-[#8a2b1f]/35 px-2 py-1 text-[#8a2b1f]">建安十三年</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-[#166534] shadow-[0_0_8px_rgba(22,101,52,0.6)]" />军阵在线</span>
      </div>
      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 pb-2">
        <div className="relative">
          <div className="pointer-events-none absolute -inset-x-4 bottom-0 h-4 rotate-[-2deg] rounded-[50%] bg-[#a8761f]/15 blur-md" />
          <h1 className="ink-title ink-reveal relative text-[62px] leading-[1.05] text-[#241d16] drop-shadow-[0_2px_0_rgba(255,255,255,0.5)]">长坂护主</h1>
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm tracking-[0.35em] text-[#6b5b45]"><span className="ink-rule w-8" />汉字合成 · 军阵塔防<span className="ink-rule w-8" /></div>
        <Card className="ink-glass mt-6 w-full max-w-[350px] !bg-[#fbf6e9]/80">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-[#d8a94a]/60 bg-gradient-to-br from-[#b13a2e] to-[#4a1d19] text-3xl text-[#ffe7ae] shadow-[0_7px_16px_rgba(111,34,22,0.22)]">{rank.name[0]}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between"><div className="text-[10px] tracking-[0.18em] text-[#7a6a55]">当前军衔</div><div className="text-[10px] tracking-[0.18em] text-[#7a6a55]">军功 <b className="text-[#a8761f]">{save.merit}</b></div></div>
              <div className="ink-title text-2xl text-[#2c251d]">{rank.name}</div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#3b3229]/10"><div className="h-full rounded-full bg-gradient-to-r from-[#8a2b1f] via-[#d8a94a] to-[#f5d880] shadow-[0_0_12px_rgba(216,169,74,0.45)] transition-[width] duration-700" style={{ width: `${rankProgress}%` }} /></div>
              <div className="mt-1 text-[10px] text-[#7a6a55]">★ {stars} / 72 {nx ? `· 距【${nx.name}】还需 ${nx.stars - stars} 星` : '· 已达最高军衔'}</div>
            </div>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2"><Metric label="已通关" value={save.stats.wins} hint="场战役" tone="green" /><Metric label="累计击杀" value={save.stats.kills} hint="敌军" tone="red" /><Metric label="成就" value={`${save.achievements.length}/${ACHIEVEMENTS.length}`} hint="军功章" tone="gold" /></div>
        </Card>
      </div>
      <div className="relative z-10 grid grid-cols-2 gap-2.5 px-6 pb-7">
        <InkButton variant="danger" className="pulse-ink col-span-2 !py-4 text-xl" onClick={() => go('levels')}>开 始 征 战 <span className="ml-2 text-xs opacity-75">ENTER</span></InkButton>
        <InkButton variant="gold" onClick={() => go('upgrade')}>强化</InkButton><InkButton onClick={() => go('codex')}>图鉴</InkButton>
        <InkButton onClick={() => go('ach')}>成就</InkButton><InkButton onClick={() => go('settings')}>设置</InkButton>
      </div>
    </div>
  );
}

/* ---------------- 关卡选择 ---------------- */
export function LevelSelect({ save, onBack, onPlay }: { save: SaveData; onBack: () => void; onPlay: (id: number) => void }) {
  const [ch, setCh] = useState(() => {
    for (let c = 3; c >= 0; c--) if (totalStars(save) >= CHAPTERS[c].unlockStars) return c;
    return 0;
  });
  const stars = totalStars(save);
  const chap = CHAPTERS[ch];
  const locked = stars < chap.unlockStars;
  const chStars = LEVELS.filter(l => l.chapter === ch).reduce((a, l) => a + save.stars[l.id], 0);
  const chapterGlyph = ['坂', '阳', '壁', '水'][ch];
  return (
    <Screen title="征战地图" onBack={onBack} right={<div className="rounded-full border border-[#d8a94a]/40 bg-[#fff8e5]/65 px-2.5 py-1 text-xs text-[#a8761f]">★ {stars}/72</div>}>
      <SectionTitle eyebrow="CAMPAIGN / 01" title="选择战场" right={<span className="text-[10px] tracking-[0.18em] text-[#7a6a55]">4 CHAPTERS</span>} />
      <div className="mb-4 grid grid-cols-4 gap-2">
        {CHAPTERS.map(c => {
          const lk = stars < c.unlockStars;
          return <button key={c.id} onClick={() => { sfx('click'); setCh(c.id); }} className={`nav-pill ${ch === c.id ? 'nav-pill-active' : ''} rounded-xl px-1 py-2 text-center`}><div className="ink-title text-lg">{c.name}</div><div className="text-[10px] opacity-75">{lk ? `★${c.unlockStars}` : '已开启'}</div></button>;
        })}
      </div>
      <div className="chapter-banner mb-4 rounded-2xl p-4">
        <div className="relative z-10 flex items-start justify-between gap-3">
          <div><div className="text-[10px] tracking-[0.25em] text-[#ffcf8a]">CHAPTER {String(ch + 1).padStart(2, '0')}</div><div className="ink-title mt-1 text-2xl">{chap.sub}</div><div className="mt-1 max-w-[250px] text-xs leading-relaxed text-[#ffe7c2]/80">{chap.mechanic}</div></div>
          <div className="ink-title text-7xl leading-none text-[#ffe3a2]/25">{chapterGlyph}</div>
        </div>
        <div className="relative z-10 mt-3 flex items-center justify-between border-t border-[#ffe3a2]/20 pt-2 text-[11px]"><span className="text-[#ffd5bf]">章节Boss：{BOSSES[chap.boss].name} · {BOSSES[chap.boss].mech}</span><span className="text-[#ffe09a]">★ {chStars}/18</span></div>
        {locked && <div className="relative z-10 mt-2 rounded-lg bg-black/20 px-2 py-1.5 text-xs text-[#ffd5bf]">未解锁：需累计 {chap.unlockStars} 星（当前 {stars} 星）</div>}
      </div>
      <SectionTitle eyebrow="MISSION SELECT" title="战役节点" right={<span className="text-xs text-[#7a6a55]">点击进入战场</span>} />
      <div className="grid grid-cols-2 gap-2.5 pb-6">
        {LEVELS.filter(l => l.chapter === ch).map(l => {
          const un = isLevelUnlocked(save, l.id); const s = save.stars[l.id];
          return <button key={l.id} disabled={!un} onClick={() => { sfx('click'); onPlay(l.id); }} style={{ '--stagger': l.index } as CSSProperties} className={`level-card stagger-in group rounded-2xl border p-3 text-left ${un ? 'border-[#3b3229]/20 bg-[#fbf6e9]/92 shadow-[0_5px_14px_rgba(60,45,25,0.08)] hover:-translate-y-1 hover:border-[#a8761f]/60 hover:shadow-[0_14px_22px_rgba(60,45,25,0.13)]' : 'border-[#3b3229]/10 bg-[#e8e0cd]/70 opacity-60'}`}>
            <div className="relative z-10 flex items-center justify-between"><span className="text-xs tracking-[0.12em] text-[#7a6a55]">{String(l.chapter + 1).padStart(2, '0')}—{String(l.index + 1).padStart(2, '0')}</span>{l.boss && <span className="rounded-full border border-[#8a2b1f]/30 bg-[#8a2b1f]/10 px-1.5 py-0.5 text-[9px] font-bold tracking-[0.12em] text-[#8a2b1f]">BOSS</span>}</div>
            <div className="relative z-10 mt-2 flex items-end justify-between"><div><div className="ink-title text-lg text-[#2c251d]">{l.name}</div><div className="mt-1 text-[10px] text-[#7a6a55]">{l.waves} 波 · {un ? '可出征' : '前置未完成'}</div></div><Stars n={s} size={15} /></div>
            {!un && <div className="relative z-10 mt-2 text-[10px] text-[#8a2b1f]">需通关上一关</div>}
          </button>;
        })}
      </div>
    </Screen>
  );
}

/* ---------------- 强化 ---------------- */
export function Upgrades({ save, onBack, onBuy }: { save: SaveData; onBack: () => void; onBuy: (id: string) => void }) {
  return (
    <Screen title="军械天工" onBack={onBack} right={<div className="rounded-full border border-[#d8a94a]/40 bg-[#fff8e5]/65 px-2.5 py-1 text-xs font-bold text-[#a8761f]">军功 {save.merit}</div>}>
      <SectionTitle eyebrow="ARSENAL / UPGRADE" title="军营强化" right={<span className="text-[10px] text-[#7a6a55]">永久生效</span>} />
      <Card className="dark-forge mb-3">
        <div className="relative z-10 flex items-center justify-between"><div><div className="text-[10px] tracking-[0.24em] text-[#d8a94a]">FORGE STATUS</div><div className="ink-title mt-1 text-2xl">锻造台 · 第 {Math.min(5, Math.floor(save.merit / 100) + 1)} 阶</div></div><div className="text-right"><div className="text-[10px] text-[#c4ab7d]">可用军功</div><div className="text-2xl font-black text-[#ffe09a]">{save.merit}</div></div></div>
        <div className="relative z-10 mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#8a2b1f] via-[#d8a94a] to-[#ffe09a]" style={{ width: `${Math.min(100, (save.merit % 100))}%` }} /></div>
      </Card>
      <div className="space-y-2.5 pb-8">
        {UPGRADES.map(u => {
          const lv = save.upgrades[u.id] || 0;
          const maxed = lv >= u.max;
          const cost = u.cost(lv);
          return (
            <Card key={u.id} className="upgrade-card stagger-in" style={{ '--stagger': UPGRADES.indexOf(u) } as CSSProperties}>
              <div className="flex items-center gap-3">
                <div className="upgrade-glyph">{u.name[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="ink-title text-lg text-[#2c251d]">{u.name}</span>
                    <span className="rounded-full bg-[#3b3229]/8 px-1.5 py-0.5 text-[10px] text-[#7a6a55]">Lv.{lv}/{u.max}</span>
                  </div>
                  <div className="mt-0.5 text-xs text-[#6b5b45]">{lv > 0 ? u.desc(lv) : '尚未刻入军令'}</div>
                  {!maxed && <div className="mt-0.5 text-[11px] text-[#166534]">下一阶 · {u.desc(lv + 1)}</div>}
                </div>
                <InkButton variant="gold" className="min-w-[58px] !px-2" disabled={maxed || save.merit < cost} onClick={() => onBuy(u.id)}>
                  {maxed ? '已满' : <><span className="block text-[10px] opacity-70">消耗</span>{cost}</>}
                </InkButton>
              </div>
              <div className="upgrade-meter mt-3">
                {Array.from({ length: u.max }).map((_, i) => (
                  <span key={i} className={i < lv ? 'is-on' : ''} />
                ))}
              </div>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}

/* ---------------- 图鉴 ---------------- */
export function Codex({ save, onBack }: { save: SaveData; onBack: () => void }) {
  const [tab, setTab] = useState<'troops' | 'heroes' | 'enemies' | 'bosses'>('troops');
  const tabs = [['troops', '普通兵'], ['heroes', '武将'], ['enemies', '敌军'], ['bosses', 'Boss']] as const;
  const has = (k: string) => (save.codex as any)[tab].includes(k);
  const seen = (save.codex as any)[tab].length;
  return (
    <Screen title="万象图鉴" onBack={onBack} right={<div className="rounded-full border border-[#d8a94a]/40 bg-[#fff8e5]/65 px-2.5 py-1 text-xs text-[#a8761f]">已收录 {seen}</div>}>
      <SectionTitle eyebrow="ARCHIVE / CODEX" title="战场图鉴" right={<span className="text-[10px] text-[#7a6a55]">触碰卡片查看军情</span>} />
      <div className="mb-4 grid grid-cols-4 gap-2">
        {tabs.map(([k, n]) => (
          <button key={k} onClick={() => { sfx('click'); setTab(k as any); }}
            className={`nav-pill ${tab === k ? 'nav-pill-active' : ''} rounded-lg py-2 text-sm`}>{n}</button>
        ))}
      </div>
      <div className="mb-3 grid grid-cols-3 gap-2"><Metric label="已收录" value={seen} hint={`/ ${(save.codex as any)[tab].length + (tab === 'troops' ? TROOP_KEYS.length : tab === 'heroes' ? HERO_KEYS.length : tab === 'enemies' ? ENEMY_KEYS.length : BOSS_KEYS.length) - seen}`} tone="gold" /><Metric label="探索度" value={`${Math.round((seen / (tab === 'troops' ? TROOP_KEYS.length : tab === 'heroes' ? HERO_KEYS.length : tab === 'enemies' ? ENEMY_KEYS.length : BOSS_KEYS.length)) * 100)}%`} hint="战场记录" tone="green" /><Metric label="情报" value={tab === 'bosses' ? '危险' : '更新'} hint="实时同步" tone={tab === 'bosses' ? 'red' : 'ink'} /></div>
      <div className="space-y-2.5 pb-8">
        {tab === 'troops' && TROOP_KEYS.map(k => {
          const d = TROOPS[k]; const ok = has(k);
          return (
            <Card key={k} className="codex-card stagger-in" style={{ '--stagger': TROOP_KEYS.indexOf(k) } as CSSProperties}>
              <div className="flex gap-3">
                <Piece char={ok ? d.char : '?'} color={ok ? d.color : '#9a8f7c'} lv={ok ? MAX_UNIT_LEVEL : 0} />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2"><div className="ink-title text-lg text-[#2c251d]">{ok ? d.name : '未解锁'}</div><span className="rounded-full bg-[#3b3229]/8 px-1.5 py-0.5 text-[10px] text-[#7a6a55]">{ok ? d.role : '待侦察'}</span></div>
                  <div className="text-xs text-[#6b5b45]">{ok ? d.desc : '在战斗中征募以解锁。'}</div>
                  {ok && <div className="mt-1 text-[11px] text-[#7a6a55]">攻击 {Number((d.dmg * FRIENDLY_DAMAGE_SCALE).toFixed(2))} · 间隔 {Number((d.cd * FRIENDLY_ATTACK_INTERVAL_SCALE).toFixed(2))}s · 射程 {d.range * TROOP_RANGE_SCALE} · 五阶伤害 {TIER_MUL[4]}x · 射程 +{TIER_RANGE_BONUS[4] * TROOP_RANGE_SCALE}{k === 'qi' ? ' · 攻速固定' : ` · 攻速 +${Math.round((TIER_ATTACK_SPEED[k][4] - 1) * 100)}%`}</div>}
                </div>
              </div>
            </Card>
          );
        })}
        {tab === 'heroes' && HERO_KEYS.map(k => {
          const d = HEROES[k]; const ok = has(k);
          return (
            <Card key={k} className="codex-card stagger-in" style={{ '--stagger': HERO_KEYS.indexOf(k) } as CSSProperties}>
              <div className="flex gap-3">
                <Piece char={ok ? d.char : '?'} color={ok ? d.color : '#9a8f7c'} hero lv={ok ? MAX_UNIT_LEVEL : 0} size={50} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2"><div className="ink-title text-lg text-[#2c251d]">{ok ? d.name : '未解锁武将'}</div><span className="rounded-full bg-[#a8761f]/10 px-1.5 py-0.5 text-[10px] text-[#a8761f]">最高5★</span></div>
                  {ok ? (
                    <>
                      <div className="text-xs text-[#7a6a55]">定位：{d.role}</div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-[#3b3229]">
                        将魂：{d.chars.map(c => <b key={c} className="rounded bg-[#8a2b1f]/10 px-1 text-[#8a2b1f]">{c}</b>)}
                        <span className="text-[#7a6a55]">按顺序相邻即觉醒</span>
                      </div>
                      <div className="mt-1 text-xs text-[#8a2b1f]">【{d.skill}】{d.skillDesc}</div>
                      {d.passive && <div className="text-xs text-[#166534]">被动：{d.passive}</div>}
                      <div className="mt-0.5 text-[11px] text-[#7a6a55]">推荐站位：{d.advice}</div>
                    </>
                  ) : <div className="text-xs text-[#6b5b45]">将魂：{d.chars.join(' + ')}（按顺序相邻摆放后解锁）</div>}
                </div>
              </div>
            </Card>
          );
        })}
        {tab === 'enemies' && ENEMY_KEYS.map(k => {
          const d = ENEMIES[k]; const ok = has(k);
          return (
            <Card key={k} className="codex-card stagger-in" style={{ '--stagger': ENEMY_KEYS.indexOf(k) } as CSSProperties}>
              <div className="flex gap-3">
                <Piece char={ok ? d.char : '?'} color={ok ? d.color : '#9a8f7c'} />
                <div>
                  <div className="ink-title text-lg text-[#2c251d]">{ok ? d.name : '未遭遇'}</div>
                  <div className="text-xs text-[#6b5b45]">{ok ? d.desc : '在战场上遭遇后解锁。'}</div>
                  {ok && <div className="mt-0.5 text-[11px] text-[#7a6a55]">基础生命 {Math.round(d.hp * ENEMY_HP_SCALE)} · 速度 {d.speed} · 突破损失 {d.lives} 生命 · 军粮 {Number((d.gold * ENEMY_GOLD_DROP_SCALE).toFixed(1))}</div>}
                </div>
              </div>
            </Card>
          );
        })}
        {tab === 'bosses' && BOSS_KEYS.map(k => {
          const d = BOSSES[k]; const ok = has(k);
          return (
            <Card key={k} className="codex-card stagger-in" style={{ '--stagger': BOSS_KEYS.indexOf(k) } as CSSProperties}>
              <div className="flex gap-3">
                <Piece char={ok ? d.char : '?'} color={ok ? d.color : '#9a8f7c'} size={50} />
                <div>
                  <div className="ink-title text-lg text-[#8a2b1f]">{ok ? d.name : '未知强敌'}</div>
                  {ok && <div className="text-xs text-[#3b3229]">【{d.mech}】{d.desc}</div>}
                  {ok ? <div className="mt-0.5 text-[11px] text-[#7a6a55]">基础生命 {Math.round(d.hp * ENEMY_HP_SCALE)} · 突破损失 {d.lives} 生命 · 军粮 {Number((d.gold * ENEMY_GOLD_DROP_SCALE).toFixed(1))}</div>
                    : <div className="text-xs text-[#6b5b45]">击败或遭遇后解锁。</div>}
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </Screen>
  );
}

/* ---------------- 成就 ---------------- */
export function Achievements({ save, onBack }: { save: SaveData; onBack: () => void }) {
  const done = save.achievements;
  const progress = Math.round((done.length / ACHIEVEMENTS.length) * 100);
  return (
    <Screen title="军功碑" onBack={onBack} right={<div className="rounded-full border border-[#d8a94a]/40 bg-[#fff8e5]/65 px-2.5 py-1 text-xs text-[#a8761f]">{done.length}/{ACHIEVEMENTS.length}</div>}>
      <SectionTitle eyebrow="HONOR / ACHIEVEMENTS" title="功勋档案" right={<span className="text-[10px] text-[#7a6a55]">{progress}% 完成</span>} />
      <Card className="dark-forge mb-3">
        <div className="relative z-10 flex items-center justify-between"><div><div className="text-[10px] tracking-[0.22em] text-[#d8a94a]">HALL OF HONOR</div><div className="ink-title mt-1 text-2xl">军功 · {done.length} 枚</div><div className="mt-1 text-xs text-[#c4ab7d]">每一枚军功章，都是一次守住阿斗的证明</div></div><div className="achievement-seal text-[#ffe09a]">{progress}%</div></div>
        <div className="relative z-10 mt-3 h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-gradient-to-r from-[#8a2b1f] via-[#d8a94a] to-[#ffe09a] transition-[width] duration-700" style={{ width: `${progress}%` }} /></div>
      </Card>
      <div className="mb-4 grid grid-cols-3 gap-2"><Metric label="累计击杀" value={save.stats.kills} hint="敌军" tone="red" /><Metric label="胜利场次" value={save.stats.wins} hint="战役" tone="green" /><Metric label="三连三星" value={save.stats.threeStarStreak} hint="当前纪录" tone="gold" /></div>
      <div className="space-y-2 pb-8">
        {ACHIEVEMENTS.map(a => {
          const ok = done.includes(a.id);
          return (
            <div key={a.id} className={`achievement-row stagger-in flex items-center gap-3 rounded-xl border p-3 ${ok ? 'achievement-done border-[#a8761f]/50' : 'achievement-locked border-[#3b3229]/12'}`} style={{ '--stagger': ACHIEVEMENTS.indexOf(a) } as CSSProperties}>
              <div className={`achievement-seal ${ok ? 'bg-[#a8761f] text-[#fff8e6]' : 'bg-[#3b3229]/10 text-[#7a6a55]'}`}>{ok ? '✓' : '·'}</div>
              <div className="min-w-0 flex-1"><div className={`font-semibold ${ok ? 'text-[#2c251d]' : 'text-[#7a6a55]'}`}>{a.name}</div><div className="text-xs text-[#6b5b45]">{a.desc}</div></div>
              <div className={`text-[10px] tracking-[0.14em] ${ok ? 'text-[#a8761f]' : 'text-[#9a8f7c]'}`}>{ok ? '已达成' : '未解锁'}</div>
            </div>
          );
        })}
      </div>
    </Screen>
  );
}

/* ---------------- 设置 ---------------- */
export function SettingsScreen({ save, onBack, onChange, onReset, onReplayTutorial }: {
  save: SaveData; onBack: () => void; onChange: (s: Partial<SaveData['settings']>) => void;
  onReset: () => void; onReplayTutorial: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const s = save.settings;
  const Toggle = ({ label, v, on }: { label: string; v: boolean; on: (b: boolean) => void }) => (
    <div className="flex items-center justify-between py-2.5">
      <span className="text-[#3b3229]">{label}</span>
      <button onClick={() => { sfx('click'); on(!v); }}
        className={`h-7 w-13 rounded-full px-1 transition ${v ? 'bg-[#166534]' : 'bg-[#3b3229]/25'}`} style={{ width: 52 }}>
        <span className={`block h-5 w-5 rounded-full bg-white transition-transform ${v ? 'translate-x-6' : ''}`} />
      </button>
    </div>
  );
  return (
    <Screen title="设置" onBack={onBack}>
      <Card className="divide-y divide-[#3b3229]/10">
        <Toggle label="背景音乐" v={s.bgm} on={b => onChange({ bgm: b })} />
        <Toggle label="音效" v={s.sfx} on={b => onChange({ sfx: b })} />
        <Toggle label="镜头震动" v={s.shake} on={b => onChange({ shake: b })} />
        <Toggle label="手机震动" v={s.vibrate} on={b => onChange({ vibrate: b })} />
        <div className="flex items-center justify-between py-2.5">
          <span className="text-[#3b3229]">特效质量</span>
          <div className="flex gap-2">
            {(['high', 'low'] as const).map(q => (
              <button key={q} onClick={() => { sfx('click'); onChange({ quality: q }); }}
                className={`rounded-lg px-3 py-1 text-sm ${s.quality === q ? 'bg-[#3b3229] text-[#f4e9d2]' : 'bg-[#3b3229]/10 text-[#3b3229]'}`}>
                {q === 'high' ? '高' : '低（省电）'}
              </button>
            ))}
          </div>
        </div>
      </Card>
      <div className="mt-4 space-y-2.5">
        <InkButton className="w-full" onClick={onReplayTutorial}>重看教学</InkButton>
        {!confirm ? (
          <InkButton variant="danger" className="w-full" onClick={() => setConfirm(true)}>重置存档</InkButton>
        ) : (
          <Card className="!bg-[#fbe9e4]">
            <div className="mb-2 text-sm text-[#8a2b1f]">确认清空全部进度？此操作不可撤销。</div>
            <div className="flex gap-2">
              <InkButton variant="danger" className="flex-1" onClick={onReset}>确认重置</InkButton>
              <InkButton variant="ghost" className="flex-1" onClick={() => setConfirm(false)}>取消</InkButton>
            </div>
          </Card>
        )}
      </div>
      <div className="mt-6 pb-8 text-center text-[11px] leading-relaxed text-[#7a6a55]">
        《长坂护主》· 汉字合成军阵塔防<br />数据自动保存于本地浏览器
      </div>
    </Screen>
  );
}
