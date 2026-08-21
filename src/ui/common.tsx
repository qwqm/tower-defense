import type { CSSProperties, ReactNode } from 'react';
import { sfx } from '../game/audio';

export function InkButton({ children, onClick, variant = 'primary', disabled, className = '' }: {
  children: ReactNode; onClick?: () => void; variant?: 'primary' | 'ghost' | 'danger' | 'gold'; disabled?: boolean; className?: string;
}) {
  const base = 'ink-sheen relative select-none rounded-xl px-4 py-2.5 font-semibold tracking-wide transition duration-200 hover:-translate-y-0.5 active:translate-y-[1px] active:scale-[0.97] disabled:opacity-40 disabled:active:scale-100 disabled:hover:translate-y-0';
  const styles: Record<string, string> = {
    primary: 'border border-[#5c5246]/40 bg-gradient-to-b from-[#514a40] to-[#24211d] text-[#f4e9d2] shadow-[0_4px_0_#15130f,0_10px_18px_rgba(39,28,18,0.12)]',
    gold: 'border border-[#efce78]/45 bg-gradient-to-b from-[#e5bc5d] to-[#a8761f] text-[#241a06] shadow-[0_4px_0_#6d4a10,0_10px_18px_rgba(112,74,16,0.14)]',
    ghost: 'border border-[#3b3229]/25 bg-[#efe6d2]/80 text-[#3b3229] shadow-[0_5px_12px_rgba(60,45,25,0.06)]',
    danger: 'border border-[#f08a68]/40 bg-gradient-to-b from-[#c44a35] to-[#7d2318] text-[#ffeede] shadow-[0_4px_0_#511208,0_10px_18px_rgba(112,27,15,0.16)]',
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
    <span className="stars-row inline-flex gap-0.5">
      {[0, 1, 2].map(i => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24"
          className={i < n ? 'star-on text-[#d8a94a]' : 'text-[#3b3229]/20'} fill="currentColor">
          <path d="M12 2l2.9 6.2 6.6.9-4.8 4.6 1.2 6.6L12 17.2 6.1 20.3l1.2-6.6L2.5 9.1l6.6-.9z" />
        </svg>
      ))}
    </span>
  );
}

export function Screen({ title, onBack, children, right }: { title: string; onBack: () => void; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="ink-noise ink-vignette screen-shell relative flex h-full flex-col overflow-hidden bg-[#f2ebdc]">
      <div className="screen-ambient screen-ambient-a pointer-events-none absolute -left-20 top-12 h-64 w-64 rounded-full" />
      <div className="screen-ambient screen-ambient-b pointer-events-none absolute -right-24 bottom-16 h-72 w-72 rounded-full" />
      <div className="screen-header relative z-10 flex items-center gap-3 border-b border-[#3b3229]/15 px-4 py-3">
        <button onClick={() => { sfx('click'); onBack(); }} className="back-button rounded-lg border border-[#3b3229]/20 bg-[#3b3229]/10 px-3 py-1.5 text-[#3b3229] transition hover:bg-[#3b3229]/15 active:scale-95">返回</button>
        <div className="screen-title ink-title ink-reveal text-xl text-[#2c251d]">{title}</div>
        <div className="ml-auto">{right}</div>
      </div>
      <div className="screen-scroll relative z-10 min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
    </div>
  );
}

export function Card({ children, className = '', style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return <div style={style} className={`ink-noise luxe-card relative overflow-hidden rounded-2xl border border-[#3b3229]/15 bg-[#fbf6e9]/92 p-3 shadow-[0_5px_16px_rgba(60,45,25,0.09)] ${className}`}>{children}</div>;
}

export function Metric({ label, value, hint, tone = 'ink' }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'ink' | 'gold' | 'red' | 'green' }) {
  return (
    <div className={`metric-tile metric-${tone}`}>
      <div className="metric-label">{label}</div>
      <div className="metric-value">{value}</div>
      {hint !== undefined && <div className="metric-hint">{hint}</div>}
    </div>
  );
}

export function SectionTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return (
    <div className="section-title-row">
      <div>
        {eyebrow && <div className="section-eyebrow">{eyebrow}</div>}
        <div className="ink-title section-title">{title}</div>
      </div>
      {right && <div>{right}</div>}
    </div>
  );
}

export function Piece({ char, color, hero, token, lv, size = 44 }: { char: string; color: string; hero?: boolean; token?: boolean; lv?: number; size?: number }) {
  return (
    <div className={`relative shrink-0 ${hero ? 'piece-hero' : token ? 'piece-token' : ''}`} style={{ width: size, height: size }}>
      <div
        className="ink-noise flex h-full w-full items-center justify-center font-serif transition-transform duration-200"
        style={{
          borderRadius: token ? '18%' : hero ? '18%' : '50%',
          border: token ? `2.5px solid #c79a3b` : `2.5px solid ${color}`,
          background: hero || token ? 'linear-gradient(#fdf7e6,#e8dcbd)' : 'linear-gradient(#faf5ea,#e6ddca)',
          color, fontSize: size * 0.5, fontWeight: 700,
          boxShadow: hero ? '0 0 0 1.5px #c79a3b inset'
            : token ? `inset 0 0 0 2px ${color}, 0 0 6px rgba(212,161,42,0.55)`
              : 'inset 0 1px 0 rgba(255,255,255,0.85), 0 3px 8px rgba(59,50,41,0.14)',
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
