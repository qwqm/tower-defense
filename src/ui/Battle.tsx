import { useEffect, useRef, useState, useCallback, type CSSProperties } from 'react';
import { Game, type Snapshot, type EndResult } from '../game/engine';
import { LEVELS } from '../game/data';
import type { SaveData } from '../game/save';
import { permMods } from '../game/save';
import { InkButton, Card, Piece } from './common';
import { sfx } from '../game/audio';

export interface Reward { merit: number; firstClear: boolean; newAch: string[]; starsBefore: number }

interface Props {
  levelId: number;
  save: SaveData;
  onEnd: (r: EndResult) => Reward;
  onQuit: () => void;
  onNext: () => void;
  onRetry: () => void;
  onTutorialDone: () => void;
  tutorial: boolean;
}

const TUT: { text: string; wait: string }[] = [
  { text: '点下方【征兵】，将魂池一次刷出 5 枚棋子', wait: 'recruited' },
  { text: '把棋子从将魂池拖到战场空地上列阵', wait: 'moved' },
  { text: '把一个棋子拖到同类棋子上，合成升阶', wait: 'merged' },
  { text: '不想要的棋子拖进将魂池，下次征兵即销毁（垃圾桶）', wait: 'tap' },
  { text: '击杀敌军获得军粮，军粮用于继续征兵', wait: 'tap' },
  { text: '将魂池里同样可以拖动合成，先配好再上阵', wait: 'tap' },
  { text: '相配将魂须按顺序并排放置（左赵右云），武将会觉醒并占两格；拖动任一半可自动拆为单字！', wait: 'tap' },
];
const WAVE_COUNTDOWN_DURATION = 5;

interface PoolTile { key: string; kind: string; lv: number; char: string; part: number; color: string; skill?: string; skillPct?: number }
interface Info { name: string; sub: string; lv: number; hero: boolean; dmg: number; aspd: number; range: number; skill?: string; skillPct?: number }

export function Battle(p: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const poolRef = useRef<HTMLDivElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [boons, setBoons] = useState<{ id: string; name: string; desc: string; tag: string }[] | null>(null);
  const [hero, setHero] = useState<{ char: string; name: string; skill: string; star: number; up: boolean } | null>(null);
  const [boss, setBoss] = useState<{ name: string; char: string; mech: string; desc: string } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string; sub?: string }[]>([]);
  const [result, setResult] = useState<{ res: EndResult; rw: Reward } | null>(null);
  const [dead, setDead] = useState<EndResult | null>(null);
  const [menu, setMenu] = useState(false);
  const [tut, setTut] = useState(p.tutorial ? 0 : -1);
  const [poolInfo, setPoolInfo] = useState<Info | null>(null);
  const [drag, setDrag] = useState<{ key: string; x: number; y: number; moved: boolean; tile: PoolTile } | null>(null);
  const dragStart = useRef({ x: 0, y: 0 });
  const tutRef = useRef(tut);
  tutRef.current = tut;
  const lv = LEVELS[p.levelId];

  const toast = useCallback((text: string, sub?: string) => {
    const id = Math.random();
    setToasts(t => [...t.slice(-3), { id, text, sub }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 1800);
  }, []);

  useEffect(() => {
    const cv = canvasRef.current!;
    const g = new Game(cv, {
      levelId: p.levelId,
      perm: permMods(p.save),
      shake: p.save.settings.shake,
      vibrate: p.save.settings.vibrate,
      quality: p.save.settings.quality,
      onSnapshot: s => setSnap(s),
      onEvent: (type, payload) => {
        if (type === 'boons') { setBoons(payload); }
        else if (type === 'heroBorn' || type === 'heroUp') {
          setHero({ char: payload.char, name: payload.name, skill: payload.skill, star: payload.star, up: type === 'heroUp' });
          setTimeout(() => setHero(null), 1500);
        } else if (type === 'bossIntro') {
          setBoss(payload);
          setTimeout(() => setBoss(null), 2200);
        } else if (type === 'bossSkill') toast(payload.name, payload.desc);
        else if (type === 'skill') toast(`${payload.name} · ${payload.skill}`);
        else if (type === 'toast') toast(payload.text);
        else if (type === 'fire') toast('战场火势燃起！', '道路上的敌军持续受到灼烧');
        else if (type === 'wave') { if (payload.wave > 1) toast(`第 ${payload.wave} 波`); }
        else if (type === 'bossDead') toast(`${payload.name} 授首！`);
        else if (type === 'poolTap') { setPoolInfo(payload); }
        else if (type === 'recruited' || type === 'merged' || type === 'moved') { setPoolInfo(null); }
        else if (type === 'end') {
          const res = payload as EndResult;
          if (!res.win && !res.revived) { setDead(res); return; }
          const rw = p.onEnd(res);
          setResult({ res, rw });
        }
        // 教学推进
        const step = tutRef.current;
        if (step >= 0 && step < TUT.length && TUT[step].wait === type) {
          setTut(s => s + 1);
        }
      },
    });
    gameRef.current = g;
    const t1 = setTimeout(() => g.resize(), 50);
    // 将魂池区域同步给引擎（战场拖入判定用）
    const syncRect = () => g.setPoolRect(poolRef.current?.getBoundingClientRect() ?? null);
    const t2 = setTimeout(syncRect, 120);
    const ro = new ResizeObserver(syncRect);
    if (poolRef.current) ro.observe(poolRef.current);
    window.addEventListener('resize', syncRect);
    return () => {
      clearTimeout(t1); clearTimeout(t2);
      ro.disconnect();
      window.removeEventListener('resize', syncRect);
      g.dispose();
      gameRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tut >= TUT.length) { p.onTutorialDone(); setTut(-1); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tut]);

  const hpPct = snap ? snap.adouHp / snap.adouMax : 1;
  const canRecruit = !!snap && snap.gold >= snap.cost;
  const pauseFor = (v: boolean) => { gameRef.current?.setPaused(v); };

  // 将魂池拖拽（DOM → 战场 / 池内）
  const onTileDown = (e: React.PointerEvent, idx: number, tile: PoolTile) => {
    if (!tile.key || drag) return;
    e.preventDefault();
    e.stopPropagation();
    const unit = gameRef.current?.poolUnits()[idx];
    if (!unit) return;
    dragStart.current = { x: e.clientX, y: e.clientY };
    setPoolInfo(null);
    setDrag({ key: tile.key, x: e.clientX, y: e.clientY, moved: false, tile });
    let dragUnit = unit;
    let split = false;
    const move = (ev: PointerEvent) => {
      const moved = Math.hypot(ev.clientX - dragStart.current.x, ev.clientY - dragStart.current.y) > 8;
      if (moved && unit.kind === 'hero' && !split) {
        const token = gameRef.current?.splitHeroForDrag(unit, tile.part === 1 ? 1 : 0);
        if (token) {
          dragUnit = token;
          split = true;
          setDrag({ key: token.key, x: ev.clientX, y: ev.clientY, moved: true, tile: { ...tile, kind: 'token', lv: 1 } });
        }
      }
      setDrag(d => d ? { ...d, x: ev.clientX, y: ev.clientY, moved } : d);
      if (moved) gameRef.current?.startPoolDrag(dragUnit);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      const moved = Math.hypot(ev.clientX - dragStart.current.x, ev.clientY - dragStart.current.y) > 8;
      gameRef.current?.endPoolDrag(ev.clientX, ev.clientY, moved);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  };

  const poolTiles: PoolTile[] = snap?.pool ?? [
    { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
    { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
    { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
    { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
    { key: '', kind: '', lv: 0, char: '', part: -1, color: '' },
  ];
  const waveCountdown = snap?.inWaveBreak && snap.nextWaveIn <= WAVE_COUNTDOWN_DURATION
    ? Math.max(1, Math.ceil(snap.nextWaveIn))
    : null;

  return (
    <div className="ink-noise ink-vignette relative flex h-full flex-col overflow-hidden bg-[#f2ebdc] select-none">
      {/* 顶部 */}
      <div className="battle-hud relative z-20 flex items-center gap-2 border-b border-[#3b3229]/15 px-3 py-2">
        <button onClick={() => { sfx('click'); setMenu(true); pauseFor(true); }}
          className="rounded-lg border border-[#3b3229]/15 bg-[#3b3229]/10 px-2.5 py-1.5 text-sm text-[#3b3229] transition hover:bg-[#3b3229]/15 active:scale-95">‖</button>
        <div>
          <div className="ink-title text-base leading-none text-[#2c251d]">{lv.chapter + 1}-{lv.index + 1} {lv.name}</div>
          <div className="flex items-center gap-1.5 text-[11px] text-[#7a6a55]"><span className="h-1.5 w-1.5 rounded-full bg-[#8a2b1f] shadow-[0_0_8px_rgba(138,43,31,0.65)]" />波次 {Math.min(snap?.wave || 1, lv.waves)}/{lv.waves}{snap?.inWaveBreak ? waveCountdown !== null ? ` · 下一波 ${waveCountdown}s` : ' · 整军中' : ''}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => { sfx('click'); gameRef.current?.setSpeed(snap?.speed === 1 ? 2 : 1); }}
            className="rounded-lg border border-[#3b3229]/15 bg-[#3b3229]/10 px-2 py-1 text-xs text-[#3b3229] transition hover:bg-[#3b3229]/15 active:scale-95">{snap?.speed === 2 ? '2x' : '1x'}</button>
          <div className="text-right">
            <div className="text-[10px] leading-none text-[#7a6a55]">阿斗生命</div>
            <div className="flex items-center gap-1">
              <div className="relative h-2 w-20 overflow-hidden rounded-full bg-[#3b3229]/15 shadow-inner">
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${hpPct * 100}%`, background: hpPct > 0.5 ? '#166534' : hpPct > 0.25 ? '#b45309' : '#8a2b1f' }} />
              </div>
              <span className="w-10 text-xs font-bold text-[#2c251d]">{snap?.adouHp ?? 0}/{snap?.adouMax ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Boss 血条 */}
      {snap?.boss && (
        <div className="z-20 bg-gradient-to-r from-[#2b1a17] via-[#452016] to-[#2b1a17] px-3 py-1.5 shadow-[0_4px_18px_rgba(40,20,12,0.28)]">
          <div className="flex items-center justify-between text-[11px] text-[#f3d7c4]">
            <span className="ink-title text-sm text-[#ffbfa8]">{snap.boss.name}</span>
            <span>{snap.boss.mech}{snap.boss.shield > 0 ? ' · 护盾中' : ''}</span>
          </div>
          <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-black/40">
            <div className="h-full bg-gradient-to-r from-[#ef4444] via-[#fb6b45] to-[#b91c1c] transition-[width] duration-300" style={{ width: `${(snap.boss.hp / snap.boss.max) * 100}%` }} />
            {snap.boss.shield > 0 && <div className="-mt-2.5 h-2.5 bg-[#38bdf8]/70" style={{ width: `${Math.min(100, (snap.boss.shield / snap.boss.max) * 100)}%` }} />}
          </div>
        </div>
      )}

      {/* 战场 */}
      <div className="battle-stage relative min-h-0 flex-1">
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full touch-none" />

        {waveCountdown !== null && (
          <div className="pointer-events-none absolute left-1/2 top-1/3 z-20 -translate-x-1/2 -translate-y-1/2 text-center">
            <div className="wave-countdown text-sm tracking-[0.35em] text-[#7a5a34]">下一波</div>
            <div className="wave-countdown ink-title text-7xl leading-none text-[#8a2b1f] drop-shadow-[0_2px_0_rgba(255,255,255,0.8)]">{waveCountdown}</div>
          </div>
        )}

        {/* 教学（上方） */}
        {tut >= 0 && tut < TUT.length && (
          <div className={`absolute left-1/2 top-2 z-30 w-[92%] -translate-x-1/2 ${TUT[tut].wait === 'tap' ? '' : 'pointer-events-none'}`}
            onClick={() => { if (TUT[tut].wait === 'tap') setTut(tut + 1); }}>
            <div className="anim-pop rounded-2xl border-2 border-[#d8a94a] bg-[#2b1a17]/92 px-4 py-2.5 text-center text-[13px] leading-snug text-[#f7e6cf]">
              <span className="mr-1 text-[#d8a94a]">{tut + 1}/{TUT.length}</span>{TUT[tut].text}
              {TUT[tut].wait === 'tap' && <div className="mt-0.5 text-[11px] text-[#d8a94a]">（点击继续）</div>}
            </div>
          </div>
        )}

        {/* 提示 */}
        <div className="pointer-events-none absolute left-1/2 top-14 z-10 flex -translate-x-1/2 flex-col items-center gap-1">
          {toasts.map(t => (
            <div key={t.id} className="toast-in rounded-full border border-[#ffcf8a]/20 bg-[#2b1a17]/88 px-3 py-1 text-center text-xs text-[#f7e6cf] shadow-[0_6px_18px_rgba(45,26,16,0.2)]">
              <b className="text-[#ffcf8a]">{t.text}</b>{t.sub ? <span className="ml-1 opacity-80">{t.sub}</span> : null}
            </div>
          ))}
        </div>

        {/* 单位信息（战场选中 / 池点按） */}
        {(snap?.selected || poolInfo) && (
          <div className="pointer-events-none absolute bottom-1 left-1/2 z-10 w-[94%] -translate-x-1/2">
            <div className="ink-glass rounded-xl border border-[#3b3229]/20 bg-[#fbf6e9]/90 px-3 py-1.5 text-[11px] text-[#3b3229] shadow">
              <div className="flex items-center gap-2">
                {(() => {
                  const s = poolInfo ?? snap!.selected!;
                  return (<>
                    <b className="ink-title text-sm">{s.name}</b>
                    <span className="text-[#a8761f]">{s.hero ? '★'.repeat(s.lv) : `${s.lv}阶`}</span>
                    <span>攻击 {s.dmg}</span>
                    <span>攻速 {s.aspd}/s</span>
                    {s.range > 0 && <span>射程 {s.range}</span>}
                  </>);
                })()}
              </div>
              {(() => {
                const s = poolInfo ?? snap!.selected!;
                return s.skill ? (
                  <div className="mt-0.5 flex items-center gap-1">
                    <span className="text-[#8a2b1f]">{s.skill}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#3b3229]/15">
                      <div className="h-full bg-[#8a2b1f]" style={{ width: `${(s.skillPct || 0) * 100}%` }} />
                    </div>
                    <span>{(s.skillPct || 0) >= 1 ? '就绪' : '充能'}</span>
                  </div>
                ) : null;
              })()}
            </div>
          </div>
        )}
      </div>

      {/* 底部：征兵 + 将魂池 */}
      <div className="battle-pool relative z-20 border-t border-[#3b3229]/15 px-3 pb-3 pt-2">
        {snap && snap.boons.length > 0 && (
          <div className="mb-1.5 flex gap-1 overflow-x-auto pb-1 text-[10px]">
            {snap.boons.map(b => (
              <span key={b.id} className="whitespace-nowrap rounded-full bg-[#3b3229]/10 px-2 py-0.5 text-[#3b3229]">{b.name}{b.n > 1 ? ` ×${b.n}` : ''}</span>
            ))}
          </div>
        )}
        <div className="flex items-center gap-3">
          <div className="shrink-0">
            <div className="text-[10px] leading-none text-[#7a6a55]">军粮</div>
            <div className="text-2xl font-bold leading-tight text-[#a8761f]">{snap?.gold ?? 0}</div>
          </div>
          <button
            disabled={!canRecruit}
            onClick={() => { gameRef.current?.recruit(); setPoolInfo(null); }}
            className={`flex-1 rounded-2xl py-2.5 text-center font-bold tracking-widest transition active:scale-[0.98] ${canRecruit
              ? 'bg-gradient-to-b from-[#b13a2e] to-[#7d2318] text-[#ffeede] shadow-[0_4px_0_#511208]'
              : 'bg-[#3b3229]/20 text-[#7a6a55]'} ${tut === 0 ? 'ring-4 ring-[#d8a94a] animate-pulse' : ''}`}>
            <span className="text-base">征 兵</span>
            <span className="ml-2 text-xs opacity-90">{snap?.cost ?? 0} 粮 · 刷新将魂池</span>
          </button>
          <div className="shrink-0 text-right">
            <div className="text-[10px] leading-none text-[#7a6a55]">军阵</div>
            <div className="text-lg font-bold text-[#2c251d]">{snap?.boardCount ?? 0}/16</div>
          </div>
        </div>
        <div ref={poolRef} className="mt-2 grid grid-cols-5 gap-1.5">
          {poolTiles.map((t, i) => {
            const draggingThis = drag?.key === t.key;
            return (
              <div key={i}
                onPointerDown={e => onTileDown(e, i, t)}
                className={`piece-slot flex aspect-square cursor-grab touch-none flex-col items-center justify-center rounded-xl border-2 transition
                  ${t.key ? 'border-[#8a6d3b]/60 bg-[#fbf6e9]' : 'border-dashed border-[#3b3229]/25 bg-[#e8e0cd]/60'}
                  ${draggingThis ? 'opacity-30' : ''}`}>
                {t.key ? (
                  <>
                    <Piece char={t.char} color={t.color} hero={t.kind === 'hero'} token={t.kind === 'token'}
                      lv={t.kind !== 'hero' ? t.lv : 0} size={40} />
                    {t.kind === 'hero' && t.part === 0 && (
                      <div className="mt-0.5 leading-none text-[#d4a12a]">{'★'.repeat(t.lv)}</div>
                    )}
                    {t.kind === 'token' && <div className="mt-0.5 text-[9px] leading-none text-[#8a6d3b]">将魂</div>}
                  </>
                ) : (
                  <span className="text-[10px] text-[#7a6a55]/60">空</span>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-1 text-center text-[10px] text-[#7a6a55]">将魂按顺序相邻即可觉醒武将 · 拖动武将任一半可拆分 · 征兵时池中棋子全部销毁</div>
      </div>

      {/* 拖拽幽灵 */}
      {drag?.moved && drag.tile.key && (
        <div className="pointer-events-none fixed z-[60]" style={{ left: drag.x - 24, top: drag.y - 24 }}>
          <Piece char={drag.tile.char} color={drag.tile.color} hero={drag.tile.kind === 'hero'} token={drag.tile.kind === 'token'}
            lv={drag.tile.kind !== 'hero' ? drag.tile.lv : 0} size={48} />
        </div>
      )}

      {/* 武将诞生 */}
      {hero && (
        <div className="hero-overlay pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(128,88,26,0.38),rgba(17,12,8,0.72)_72%)]">
          <div className="hero-burst ink-title text-[130px] leading-none text-[#ffe6a8] drop-shadow-[0_0_28px_rgba(255,180,60,0.85)]">{hero.char}</div>
          <div className="anim-pop mt-2 ink-title text-3xl text-[#fff3d6]">{hero.name} {'★'.repeat(hero.star)}</div>
          <div className="ink-scan anim-pop mt-2 rounded-full border border-[#ffcf8a]/40 bg-[#2b1a17]/35 px-4 py-1 text-sm tracking-widest text-[#ffcf8a]">{hero.up ? '将星升华' : `将星降世 · ${hero.skill}`}</div>
        </div>
      )}

      {/* Boss 登场 */}
      {boss && (
        <div className="boss-overlay pointer-events-none absolute inset-0 z-40 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(128,24,13,0.42),rgba(14,8,7,0.86)_72%)]">
          <div className="boss-in ink-title text-[150px] leading-none text-[#ff6b52] drop-shadow-[0_0_36px_rgba(255,60,20,0.9)]">{boss.char}</div>
          <div className="anim-pop ink-title text-4xl text-[#ffe1d5]">{boss.name}</div>
          <div className="ink-scan anim-pop mt-2 rounded-full border border-[#ff6b52]/60 bg-[#2b1a17]/35 px-4 py-1 text-sm text-[#ffb9a5]">【{boss.mech}】{boss.desc}</div>
        </div>
      )}

      {/* 军策 */}
      {boons && (
        <div className="result-backdrop absolute inset-0 z-50 flex flex-col items-center justify-center px-5">
          <div className="ink-title mb-1 text-3xl text-[#ffe6a8]">军 策</div>
          <div className="mb-4 text-xs tracking-widest text-[#d9c8a8]">三选其一，永久生效于本局</div>
          <div className="w-full max-w-[360px] space-y-3">
            {boons.map(b => (
              <button key={b.id} onClick={() => { sfx('star'); gameRef.current?.pickBoon(b.id); setBoons(null); }}
                className="luxe-card w-full rounded-2xl border-2 border-[#d8a94a]/60 bg-[#fbf6e9] p-3 text-left transition duration-200 hover:-translate-y-1 hover:border-[#d8a94a] hover:shadow-[0_16px_28px_rgba(216,169,74,0.2)] active:scale-[0.98]">
                <div className="flex items-center gap-2">
                  <span className="ink-title text-lg text-[#2c251d]">{b.name}</span>
                  <span className="rounded bg-[#3b3229]/10 px-1.5 py-0.5 text-[10px] text-[#6b5b45]">{b.tag}</span>
                </div>
                <div className="mt-0.5 text-sm text-[#6b5b45]">{b.desc}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 暂停菜单 */}
      {menu && (
        <div className="result-backdrop absolute inset-0 z-50 flex items-center justify-center px-8">
          <Card className="result-panel w-full max-w-[320px]">
            <div className="ink-title mb-3 text-center text-2xl text-[#2c251d]">暂 停</div>
            <div className="mb-3 text-center text-xs text-[#6b5b45]">{lv.chapter + 1}-{lv.index + 1} {lv.name} · 击杀 {snap?.kills ?? 0}</div>
            <div className="space-y-2">
              <InkButton className="w-full" onClick={() => { setMenu(false); pauseFor(false); }}>继续战斗</InkButton>
              <InkButton variant="ghost" className="w-full" onClick={() => { setMenu(false); p.onRetry(); }}>重新开始</InkButton>
              <InkButton variant="danger" className="w-full" onClick={() => { setMenu(false); p.onQuit(); }}>撤退返回</InkButton>
            </div>
          </Card>
        </div>
      )}

      {/* 失败 / 复活 */}
      {dead && (
        <div className="result-backdrop absolute inset-0 z-50 flex items-center justify-center px-6">
          <Card className="result-panel w-full max-w-[340px] text-center">
            <div className="relative z-10 mb-1 text-[10px] tracking-[0.28em] text-[#8a2b1f]">BATTLE LOST · 战线告急</div>
            <div className="relative z-10 ink-title text-3xl text-[#8a2b1f]">阿 斗 危 矣</div>
            <div className="mt-2 text-sm text-[#3b3229]">坚持到第 {dead.wave} 波 · 击杀 {dead.kills}</div>
            <div className="text-sm text-[#3b3229]">最强单位：{dead.bestHero ? `${dead.bestHero.name}（${dead.bestHero.kills}杀）` : '无'}</div>
            <div className="mt-4 space-y-2">
              <InkButton variant="gold" className="w-full" onClick={() => { sfx('star'); gameRef.current?.revive(); setDead(null); }}>
                援军来援！复活续战（本局仅一次，放弃三星）
              </InkButton>
              <InkButton variant="danger" className="w-full" onClick={() => {
                const rw = p.onEnd(dead); setResult({ res: dead, rw }); setDead(null);
              }}>接受战败</InkButton>
            </div>
          </Card>
        </div>
      )}

      {/* 结算 */}
      {result && (
        <div className={`result-backdrop ${result.res.win ? 'result-win' : ''} absolute inset-0 z-50 flex items-center justify-center px-5`}>
          <Card className="result-panel w-full max-w-[360px]">
            <div className="relative z-10 text-center"><div className={`text-[10px] tracking-[0.28em] ${result.res.win ? 'text-[#a8761f]' : 'text-[#8a2b1f]'}`}>{result.res.win ? 'VICTORY REPORT · 战果回收' : 'DEFEAT REPORT · 战线总结'}</div><div className={`ink-title mt-1 text-4xl ${result.res.win ? 'text-[#8a2b1f]' : 'text-[#3b3229]'}`}>{result.res.win ? '大 获 全 胜' : '力 战 不 支'}</div></div>
            {result.res.win && <div className="relative z-10 mt-3 flex justify-center gap-1.5">{[0, 1, 2].map(i => <svg key={i} style={{ '--star': i } as CSSProperties} width="38" height="38" viewBox="0 0 24 24" className={`result-star ${i < result.res.stars ? 'text-[#d8a94a]' : 'text-[#3b3229]/15'}`} fill="currentColor"><path d="M12 2l2.9 6.2 6.6.9-4.8 4.6 1.2 6.6L12 17.2 6.1 20.3l1.2-6.6L2.5 9.1l6.6-.9z" /></svg>)}</div>}
            <div className="relative z-10 mt-4 grid grid-cols-2 gap-2">
              <ResultMetric k="坚持波次" v={`${result.res.wave} / ${lv.waves}`} />
              <ResultMetric k="击杀数量" v={String(result.res.kills)} />
              <ResultMetric k="最强单位" v={result.res.bestHero ? `${result.res.bestHero.name} · ${result.res.bestHero.kills}杀` : '无'} />
              <ResultMetric k="阿斗生命" v={`${result.res.adouHp} / ${result.res.adouMax}`} />
              <ResultMetric k="剩余军粮" v={String(result.res.goldLeft)} />
              <ResultMetric k="用时" v={`${Math.floor(result.res.timeSec / 60)}分${result.res.timeSec % 60}秒`} />
            </div>
            <div className="relative z-10 mt-3 flex items-center justify-between rounded-xl border border-[#d8a94a]/35 bg-[#fdf3dc]/75 px-3 py-2"><span className="text-xs text-[#7a6a55]">本局军功</span><b className="text-xl text-[#a8761f]">+{result.rw.merit}</b>{result.rw.firstClear && <span className="rounded-full bg-[#a8761f]/15 px-2 py-0.5 text-[10px] text-[#a8761f]">首通奖励</span>}</div>
            {result.res.win && <div className="relative z-10 mt-2 text-center text-[10px] text-[#6b5b45]">★二：阿斗生命 ≥ 60%　·　★三：不使用复活</div>}
            {result.rw.newAch.length > 0 && <div className="relative z-10 mt-2 rounded-lg bg-[#fdf3dc] p-2 text-center text-xs text-[#a8761f]">达成军功：{result.rw.newAch.join(' · ')}</div>}
            <div className="relative z-10 mt-4 grid grid-cols-2 gap-2">
              {result.res.win && p.levelId < 23
                ? <InkButton variant="gold" onClick={p.onNext}>下一关</InkButton>
                : <InkButton variant="gold" onClick={p.onRetry}>再次挑战</InkButton>}
              {result.res.win
                ? <InkButton variant="ghost" onClick={p.onRetry}>再战一次</InkButton>
                : <InkButton variant="ghost" onClick={p.onRetry}>再 战</InkButton>}
              <InkButton className="col-span-2" onClick={p.onQuit}>返回首页</InkButton>
            </div>
          </Card>
        </div>
      )}
      {!snap && <div className="absolute inset-0 z-10 flex items-center justify-center text-[#7a6a55]">列阵中…</div>}
    </div>
  );
}

function ResultMetric({ k, v }: { k: string; v: string }) {
  return <div className="result-metric"><div className="result-metric-label">{k}</div><div className="result-metric-value truncate">{v}</div></div>;
}
