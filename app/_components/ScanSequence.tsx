import type { CSSProperties } from 'react';
import { ui, type Lang } from '@/lib/i18n';

/** The "in progress" terminal shown while the (instant) scorer pretends to work. */
export function ScanSequence({ duration, red = false, lang }: { duration: number; red?: boolean; lang: Lang }) {
  const t = ui[lang];
  const lines = (red ? t.scanAttack : t.scanDefense).split('|');
  return (
    <div className={`scan-sequence ${red ? 'attack' : ''}`} role="status" style={{ '--scan-ms': `${duration}ms` } as CSSProperties}>
      <div className="scan-header"><span className="scan-spinner" aria-hidden="true" /> {red ? t.launchingAttack : t.runningEval}</div>
      <ul>
        {lines.map((line, i) => <li key={line} style={{ animationDelay: `${(i * duration) / lines.length}ms` }}>{line}</li>)}
      </ul>
      <div className="scan-bar"><span /></div>
    </div>
  );
}
