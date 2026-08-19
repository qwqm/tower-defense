import type { ReactNode } from 'react';
import { sfx } from '../game/audio';

export function InkButton({ children, onClick, variant = 'primary', disabled, className = '' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'gold'; disabled?: boolean; className?: string;
}) {
  const base = 'relative select-none rounded-xl px-4 py-2.5 font-semibold tracking-wide transition active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100';
  const styles: Record<string, string> = {
    primary: 'bg-gradient-to-b from-[#3f3a33] to-[#22201c] text-[#f4e9d2] shadow-[0_3px_0_#15130f]',
    gold: 'bg-gradient-to-b from-[#d8a94a] to-[#a8761f] text-[#241a06] shadow-[0_3px_0_#6d4a10]',
    ghost: 'bg-[#efe6d2]/80 text-[#3b3229] border border-[#3b3229]/30',
    danger: 'bg-gradient-to-b from-[#b13a2e] to-[#7d2318] text-[#ffeede] shadow-[0_3px_0_#511208]',
  };
  return (
    <button
      disabled={disabled}
      onClick={() => { if (!disabled) { sfx('click'); onClick?.(); } }}
      className={`${base} ${styles[variant]} ${className}`}
    >{children}</button>
  );
}

export function Stars({ n, size = 14 }: { n: number; size?: number }) {
  return (
    <span className="inline-flex gap-0.5">
      {[0, 1, 2].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          className={i < n ? 'text-[#d8a94a]' : 'text-[#3b3229]/20'} fill="currentColor">
          <path d="M12 2l2.9 6.2 6.6.9-4.8 4.6 1.2 6.6L12 17.2 6.1 20.3l1.2-6.6L2.5 9.1l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}

export function Screen({ title, onBack, children, right }: { title: string; onBack: () => void; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex h-full flex-col bg-[#f2ebdc]">
      <div className="flex items-center gap-3 border-b border-[#3b3229]/15 px-4 py-3">
        <button onClick={() => { sfx('click'); onBack(); }} className="rounded-lg bg-[#3b3229]/10 px-3 py-1.5 text-[#3b3229]">返回</button>
        <div className="ink-title text-xl text-[#2c251d]">{title}</div>
        <div className="ml-auto">{right}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </div>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl border border-[#3b3229]/15 bg-[#fbf6e9] p-3 shadow-[0_2px_8px_rgba(60,45,25,0.08)] ${className}`}>{children}</div>;
}

export function Piece({ char, color, hero, token, lv, size = 44 }: { char: string; color: string; hero?: boolean; token?: boolean; lv?: number; size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex h-full w-full items-center justify-center font-serif"
        style={{
          borderRadius: token ? '18%' : hero ? '18%' : '50%',
          border: token ? `2.5px solid #c79a3b` : `2.5px solid ${color}`,
          background: hero || token ? 'linear-gradient(#fdf7e6,#e8dcbd)' : 'linear-gradient(#faf5ea,#e6ddca)',
          color, fontSize: size * 0.5, fontWeight: 700,
          boxShadow: hero ? '0 0 0 1.5px #c79a3b inset'
            : token ? `inset 0 0 0 2px ${color}, 0 0 6px rgba(212,161,42,0.55)`
              : undefined,
        }}
      >{char}</div>
      {lv ? (
        <div className="absolute -bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
          {Array.from({ length: lv }).map((_, i) => (
            <span key={i} className="block rounded-full" style={{
              width: size * 0.11, height: size * 0.11,
              background: hero ? '#d4a12a' : color,
            }} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
