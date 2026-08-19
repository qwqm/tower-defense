import { useEffect, useRef, useState } from 'react';
import { Home, LevelSelect, Upgrades, Codex, Achievements, SettingsScreen } from './ui/Menus';
import { Battle, type Reward } from './ui/Battle';
import type { EndResult } from './game/engine';
import { LEVELS, UPGRADES, ACHIEVEMENTS } from './game/data';
import { loadSave, writeSave, resetSave, defaultSave, totalStars, isLevelUnlocked, type SaveData } from './game/save';
import { setSfx, setBgmEnabled, startBgm, stopBgm, sfx } from './game/audio';

type ScreenName = 'home' | 'levels' | 'battle' | 'upgrade' | 'codex' | 'ach' | 'settings';

export default function App() {
  const [save, setSave] = useState<SaveData>(() => loadSave());
  const [screen, setScreen] = useState<ScreenName>('home');
  const [levelId, setLevelId] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const saveRef = useRef(save);
  saveRef.current = save;

  useEffect(() => { writeSave(save); }, [save]);
  useEffect(() => { setSfx(save.settings.sfx); setBgmEnabled(save.settings.bgm); }, [save.settings.sfx, save.settings.bgm]);

  useEffect(() => {
    const kick = () => {
      if (saveRef.current.settings.bgm) startBgm();
      window.removeEventListener('pointerdown', kick);
    };
    window.addEventListener('pointerdown', kick);
    return () => window.removeEventListener('pointerdown', kick);
  }, []);
  useEffect(() => {
    if (screen === 'battle') stopBgm();
    else if (save.settings.bgm) startBgm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  const patch = (fn: (d: SaveData) => void) => {
    setSave(prev => {
      const d: SaveData = JSON.parse(JSON.stringify(prev));
      fn(d);
      return d;
    });
  };

  const handleEnd = (res: EndResult): Reward => {
    const d: SaveData = JSON.parse(JSON.stringify(saveRef.current));
    const starsBefore = d.stars[levelId];
    const lv = LEVELS[levelId];
    const firstClear = res.win && starsBefore === 0;
    let merit = res.win ? 25 + res.stars * 12 + lv.chapter * 8 + lv.index * 2 : 8 + res.wave * 2;
    if (firstClear) merit *= 2;
    merit = Math.round(merit);
    d.merit += merit;

    if (res.win) {
      d.stars[levelId] = Math.max(starsBefore, res.stars);
      d.stats.wins++;
      d.stats.threeStarStreak = res.stars === 3 ? d.stats.threeStarStreak + 1 : 0;
      if (res.bossKilled && !d.stats.bossKilled.includes(res.bossKilled)) d.stats.bossKilled.push(res.bossKilled);
    } else {
      d.stats.losses++;
      d.stats.threeStarStreak = 0;
    }
    d.stats.kills += res.kills;
    d.stats.heroesMade += res.madeHeroes.length;

    const add = (arr: string[], items: string[]) => { for (const i of items) if (!arr.includes(i)) arr.push(i); };
    add(d.codex.troops, res.madeTroops);
    add(d.codex.heroes, res.madeHeroes);
    add(d.codex.enemies, res.seenEnemies);
    add(d.codex.bosses, res.seenBoss);

    const unlock: string[] = [];
    const give = (id: string, cond: boolean) => {
      if (cond && !d.achievements.includes(id)) {
        d.achievements.push(id);
        unlock.push(ACHIEVEMENTS.find(a => a.id === id)!.name);
      }
    };
    give('first_win', res.win);
    give('first_hero', res.madeHeroes.length > 0);
    give('zhaoyun', res.madeHeroes.includes('zhaoyun'));
    give('taoyuan', res.taoyuan);
    give('wuhu', res.wuhu);
    give('hero_kill100', res.maxHeroKills >= 100);
    give('fast_clear', res.win && res.timeSec <= 240);
    give('full_hp', res.win && res.adouHp >= res.adouMax);
    give('kill1000', d.stats.kills >= 1000);
    give('kill5000', d.stats.kills >= 5000);
    give('three_star3', d.stats.threeStarStreak >= 3);
    give('board6', res.peakHeroCount >= 6);
    give('star3hero', res.maxStar >= 3);
    give('rich_win', res.win && res.goldLeft >= 400);
    give('onehp', res.win && res.adouHp === 1);
    give('boss_all', d.stats.bossKilled.length >= 4);
    give('all24', d.stars.every(s => s > 0));
    give('star72', totalStars(d) >= 60);

    setSave(d);
    return { merit, firstClear, newAch: unlock, starsBefore };
  };

  const buy = (id: string) => {
    const u = UPGRADES.find(x => x.id === id)!;
    const lv = save.upgrades[id] || 0;
    if (lv >= u.max) return;
    const cost = u.cost(lv);
    if (save.merit < cost) { sfx('error'); return; }
    sfx('star');
    patch(d => { d.merit -= cost; d.upgrades[id] = lv + 1; });
  };

  const startLevel = (id: number) => { setLevelId(id); setAttempt(a => a + 1); setScreen('battle'); };

  return (
    <div className="fixed inset-0 flex justify-center bg-[#1c1814]">
      <div className="relative h-full w-full max-w-[480px] overflow-hidden bg-[#f2ebdc] shadow-2xl">
        {screen === 'home' && <Home save={save} go={s => setScreen(s as ScreenName)} />}
        {screen === 'levels' && <LevelSelect save={save} onBack={() => setScreen('home')} onPlay={startLevel} />}
        {screen === 'upgrade' && <Upgrades save={save} onBack={() => setScreen('home')} onBuy={buy} />}
        {screen === 'codex' && <Codex save={save} onBack={() => setScreen('home')} />}
        {screen === 'ach' && <Achievements save={save} onBack={() => setScreen('home')} />}
        {screen === 'settings' && (
          <SettingsScreen
            save={save}
            onBack={() => setScreen('home')}
            onChange={s => patch(d => { d.settings = { ...d.settings, ...s }; })}
            onReset={() => { resetSave(); setSave(defaultSave()); setScreen('home'); }}
            onReplayTutorial={() => { patch(d => { d.tutorialDone = false; }); setScreen('home'); }}
          />
        )}
        {screen === 'battle' && (
          <Battle
            key={`${levelId}-${attempt}`}
            levelId={levelId}
            save={save}
            tutorial={!save.tutorialDone && levelId === 0}
            onEnd={handleEnd}
            onQuit={() => setScreen('home')}
            onRetry={() => setAttempt(a => a + 1)}
            onNext={() => {
              const nid = Math.min(23, levelId + 1);
              if (nid === levelId || !isLevelUnlocked(saveRef.current, nid)) { setScreen('levels'); return; }
              setLevelId(nid); setAttempt(a => a + 1);
            }}
            onTutorialDone={() => patch(d => { d.tutorialDone = true; })}
          />
        )}
      </div>
    </div>
  );
}
