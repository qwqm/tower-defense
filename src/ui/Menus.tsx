import { useState } from 'react';
import {
  CHAPTERS, LEVELS, TROOPS, TROOP_KEYS, HEROES, HERO_KEYS, ENEMIES, ENEMY_KEYS,
  BOSSES, BOSS_KEYS, UPGRADES, ACHIEVEMENTS, FRIENDLY_DAMAGE_SCALE,
  FRIENDLY_ATTACK_INTERVAL_SCALE, ENEMY_GOLD_DROP_SCALE, ENEMY_HP_SCALE,
  MAX_UNIT_LEVEL, TIER_MUL, TIER_RANGE_BONUS, TIER_ATTACK_SPEED, rankOf, nextRank,
} from '../game/data';
import type { SaveData } from '../game/save';
import { totalStars, isLevelUnlocked } from '../game/save';
import { InkButton, Stars, Screen, Card, Piece } from './common';
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
    <div className="relative flex h-full flex-col overflow-hidden bg-[#f0e7d2]">
      <div className="ink-bg pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {[...Array(7)].map((_, i) => (
          <div key={i} className="float-ink absolute font-serif text-[#3b3229]/10"
            style={{
              left: `${8 + i * 13}%`, top: `${10 + (i % 4) * 20}%`,
              fontSize: `${40 + (i % 3) * 26}px`, animationDelay: `${i * 1.6}s`,
              animationDuration: `${9 + i * 1.4}s`,
            }}>{'刀枪骑弓赵关张'[i]}</div>
        ))}
      </div>

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6">
        <div className="ink-seal mb-1 text-[13px] tracking-[0.6em] text-[#8a2b1f]">建安十三年</div>
        <h1 className="ink-title text-[62px] leading-[1.05] text-[#241d16] drop-shadow-[0_2px_0_rgba(255,255,255,0.5)]">长坂护主</h1>
        <div className="mt-1 text-sm tracking-[0.35em] text-[#6b5b45]">汉字合成 · 军阵塔防</div>

        <Card className="mt-7 w-full max-w-[330px] !bg-[#fbf6e9]/90">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-[#7a6a55]">当前军衔</div>
              <div className="ink-title text-2xl text-[#2c251d]">{rank.name}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-[#7a6a55]">军功</div>
              <div className="text-2xl font-bold text-[#a8761f]">{save.merit}</div>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#3b3229]/10">
            <div className="h-full rounded-full bg-[#a8761f]"
              style={{ width: `${rankProgress}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-[#7a6a55]">
            ★ {stars} / 72 {nx ? `· 距【${nx.name}】还需 ${nx.stars - stars} 星` : '· 已达最高军衔'}
          </div>
        </Card>
      </div>

      <div className="relative z-10 grid grid-cols-2 gap-2.5 px-6 pb-8">
        <InkButton variant="danger" className="col-span-2 !py-4 text-xl" onClick={() => go('levels')}>开 始 征 战</InkButton>
        <InkButton variant="gold" onClick={() => go('upgrade')}>强化</InkButton>
        <InkButton onClick={() => go('codex')}>图鉴</InkButton>
        <InkButton onClick={() => go('ach')}>成就</InkButton>
        <InkButton onClick={() => go('settings')}>设置</InkButton>
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
  return (
    <Screen title="选择关卡" onBack={onBack} right={<div className="text-sm text-[#7a6a55]">★ {stars}/72</div>}>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {CHAPTERS.map(c => {
          const lk = stars < c.unlockStars;
          return (
            <button key={c.id} onClick={() => { sfx('click'); setCh(c.id); }}
              className={`rounded-xl border px-1 py-2 text-center transition ${ch === c.id ? 'border-[#8a2b1f] bg-[#8a2b1f] text-[#f7ecd8]' : 'border-[#3b3229]/20 bg-[#fbf6e9] text-[#3b3229]'}`}>
              <div className="ink-title text-lg">{c.name}</div>
              <div className="text-[10px] opacity-70">{lk ? `★${c.unlockStars}` : '已开启'}</div>
            </button>
          );
        })}
      </div>

      <Card className="mb-3">
        <div className="flex items-baseline justify-between">
          <div className="ink-title text-lg text-[#2c251d]">{chap.sub}</div>
          <div className="text-sm text-[#a8761f]">★ {chStars}/18</div>
        </div>
        <div className="mt-1 text-xs leading-relaxed text-[#6b5b45]">{chap.mechanic}</div>
        <div className="mt-1 text-xs text-[#8a2b1f]">章节Boss：{BOSSES[chap.boss].name} · {BOSSES[chap.boss].mech}</div>
        {locked && <div className="mt-2 rounded-lg bg-[#8a2b1f]/10 px-2 py-1.5 text-xs text-[#8a2b1f]">未解锁：需累计 {chap.unlockStars} 星（当前 {stars} 星）</div>}
      </Card>

      <div className="grid grid-cols-2 gap-2.5 pb-6">
        {LEVELS.filter(l => l.chapter === ch).map(l => {
          const un = isLevelUnlocked(save, l.id);
          const s = save.stars[l.id];
          return (
            <button key={l.id} disabled={!un} onClick={() => { sfx('click'); onPlay(l.id); }}
              className={`rounded-2xl border p-3 text-left transition active:scale-[0.98] ${un ? 'border-[#3b3229]/20 bg-[#fbf6e9]' : 'border-[#3b3229]/10 bg-[#e8e0cd] opacity-60'}`}>
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#7a6a55]">{l.chapter + 1}-{l.index + 1}</span>
                {l.boss && <span className="rounded bg-[#8a2b1f] px-1.5 py-0.5 text-[10px] text-[#ffeede]">BOSS</span>}
              </div>
              <div className="ink-title mt-0.5 text-lg text-[#2c251d]">{l.name}</div>
              <div className="mt-1 flex items-center justify-between">
                <Stars n={s} />
                <span className="text-[11px] text-[#7a6a55]">{l.waves}波</span>
              </div>
              {!un && <div className="mt-1 text-[10px] text-[#8a2b1f]">需通关上一关</div>}
            </button>
          );
        })}
      </div>
    </Screen>
  );
}

/* ---------------- 强化 ---------------- */
export function Upgrades({ save, onBack, onBuy }: { save: SaveData; onBack: () => void; onBuy: (id: string) => void }) {
  return (
    <Screen title="军营强化" onBack={onBack} right={<div className="text-sm font-bold text-[#a8761f]">军功 {save.merit}</div>}>
      <div className="space-y-2.5 pb-8">
        {UPGRADES.map(u => {
          const lv = save.upgrades[u.id] || 0;
          const maxed = lv >= u.max;
          const cost = u.cost(lv);
          return (
            <Card key={u.id}>
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[#3b3229] font-serif text-xl text-[#f4e9d2]">{u.name[0]}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="ink-title text-lg text-[#2c251d]">{u.name}</span>
                    <span className="text-xs text-[#7a6a55]">Lv.{lv}/{u.max}</span>
                  </div>
                  <div className="text-xs text-[#6b5b45]">当前：{lv > 0 ? u.desc(lv) : '未强化'}</div>
                  {!maxed && <div className="text-[11px] text-[#166534]">下一级：{u.desc(lv + 1)}</div>}
                </div>
                <InkButton variant="gold" disabled={maxed || save.merit < cost} onClick={() => onBuy(u.id)}>
                  {maxed ? '已满' : `${cost}`}
                </InkButton>
              </div>
              <div className="mt-2 flex gap-1">
                {Array.from({ length: u.max }).map((_, i) => (
                  <div key={i} className={`h-1.5 flex-1 rounded-full ${i < lv ? 'bg-[#a8761f]' : 'bg-[#3b3229]/12'}`} />
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
  return (
    <Screen title="图鉴" onBack={onBack}>
      <div className="mb-3 grid grid-cols-4 gap-2">
        {tabs.map(([k, n]) => (
          <button key={k} onClick={() => { sfx('click'); setTab(k as any); }}
            className={`rounded-lg py-2 text-sm ${tab === k ? 'bg-[#3b3229] text-[#f4e9d2]' : 'bg-[#fbf6e9] text-[#3b3229] border border-[#3b3229]/15'}`}>{n}</button>
        ))}
      </div>
      <div className="space-y-2.5 pb-8">
        {tab === 'troops' && TROOP_KEYS.map(k => {
          const d = TROOPS[k]; const ok = has(k);
          return (
            <Card key={k}>
              <div className="flex gap-3">
                <Piece char={ok ? d.char : '?'} color={ok ? d.color : '#9a8f7c'} lv={ok ? MAX_UNIT_LEVEL : 0} />
                <div className="min-w-0">
                  <div className="ink-title text-lg text-[#2c251d]">{ok ? d.name : '未解锁'} <span className="text-xs text-[#7a6a55]">{ok ? d.role : ''}</span></div>
                  <div className="text-xs text-[#6b5b45]">{ok ? d.desc : '在战斗中征募以解锁。'}</div>
                  {ok && <div className="mt-1 text-[11px] text-[#7a6a55]">攻击 {Number((d.dmg * FRIENDLY_DAMAGE_SCALE).toFixed(2))} · 间隔 {Number((d.cd * FRIENDLY_ATTACK_INTERVAL_SCALE).toFixed(2))}s · 射程 {d.range} · 五阶伤害 {TIER_MUL[4]}x · 射程 +{TIER_RANGE_BONUS[4]}{k === 'qi' ? ' · 攻速固定' : ` · 攻速 +${Math.round((TIER_ATTACK_SPEED[k][4] - 1) * 100)}%`}</div>}
                </div>
              </div>
            </Card>
          );
        })}
        {tab === 'heroes' && HERO_KEYS.map(k => {
          const d = HEROES[k]; const ok = has(k);
          return (
            <Card key={k}>
              <div className="flex gap-3">
                <Piece char={ok ? d.char : '?'} color={ok ? d.color : '#9a8f7c'} hero lv={ok ? MAX_UNIT_LEVEL : 0} size={50} />
                <div className="min-w-0 flex-1">
                  <div className="ink-title text-lg text-[#2c251d]">{ok ? d.name : '未解锁武将'} <span className="text-xs text-[#a8761f]">最高5★</span></div>
                  {ok ? (
                    <>
                      <div className="text-xs text-[#7a6a55]">定位：{d.role}</div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-[#3b3229]">
                        将魂：{d.chars.map(c => <b key={c} className="rounded bg-[#8a2b1f]/10 px-1 text-[#8a2b1f]">{c}</b>)}
                        <span className="text-[#7a6a55]">两字相邻即觉醒</span>
                      </div>
                      <div className="mt-1 text-xs text-[#8a2b1f]">【{d.skill}】{d.skillDesc}</div>
                      {d.passive && <div className="text-xs text-[#166534]">被动：{d.passive}</div>}
                      <div className="mt-0.5 text-[11px] text-[#7a6a55]">推荐站位：{d.advice}</div>
                    </>
                  ) : <div className="text-xs text-[#6b5b45]">将魂：{d.chars.join(' + ')}（相邻摆放唤醒后解锁）</div>}
                </div>
              </div>
            </Card>
          );
        })}
        {tab === 'enemies' && ENEMY_KEYS.map(k => {
          const d = ENEMIES[k]; const ok = has(k);
          return (
            <Card key={k}>
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
            <Card key={k}>
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
  return (
    <Screen title="成就" onBack={onBack} right={<div className="text-sm text-[#7a6a55]">{done.length}/{ACHIEVEMENTS.length}</div>}>
      <Card className="mb-3">
        <div className="grid grid-cols-3 gap-2 text-center">
          <div><div className="text-xl font-bold text-[#2c251d]">{save.stats.kills}</div><div className="text-[11px] text-[#7a6a55]">累计击杀</div></div>
          <div><div className="text-xl font-bold text-[#166534]">{save.stats.wins}</div><div className="text-[11px] text-[#7a6a55]">胜利场次</div></div>
          <div><div className="text-xl font-bold text-[#8a2b1f]">{save.stats.losses}</div><div className="text-[11px] text-[#7a6a55]">失败场次</div></div>
        </div>
      </Card>
      <div className="space-y-2 pb-8">
        {ACHIEVEMENTS.map(a => {
          const ok = done.includes(a.id);
          return (
            <div key={a.id} className={`flex items-center gap-3 rounded-xl border p-3 ${ok ? 'border-[#a8761f]/50 bg-[#fdf3dc]' : 'border-[#3b3229]/12 bg-[#f0e9d8]'}`}>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-serif ${ok ? 'bg-[#a8761f] text-[#fff8e6]' : 'bg-[#3b3229]/15 text-[#7a6a55]'}`}>{ok ? '✓' : '?'}</div>
              <div>
                <div className={`font-semibold ${ok ? 'text-[#2c251d]' : 'text-[#7a6a55]'}`}>{a.name}</div>
                <div className="text-xs text-[#6b5b45]">{a.desc}</div>
              </div>
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
