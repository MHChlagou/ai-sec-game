import type { CSSProperties } from 'react';

const DEFENSE_LINES = [
  '> tokenizing countermeasure…',
  '> replaying attacker payload…',
  '> probing instruction boundary…',
  '> scanning for leaked secrets 🔍',
  '> compiling security report…',
];

const ATTACK_LINES = [
  '> compiling attack payload…',
  '> delivering to target bot…',
  '> probing for weak boundaries…',
  '> checking for compromise 🎯',
  '> compiling attack report…',
];

/** The "in progress" terminal shown while the (instant) scorer pretends to work. */
export function ScanSequence({ duration, red = false }: { duration: number; red?: boolean }) {
  const lines = red ? ATTACK_LINES : DEFENSE_LINES;
  return (
    <div className={`scan-sequence ${red ? 'attack' : ''}`} role="status" style={{ '--scan-ms': `${duration}ms` } as CSSProperties}>
      <div className="scan-header"><span className="scan-spinner" aria-hidden="true" /> {red ? 'LAUNCHING ATTACK' : 'RUNNING SECURITY EVALUATION'}</div>
      <ul>
        {lines.map((line, i) => <li key={line} style={{ animationDelay: `${(i * duration) / lines.length}ms` }}>{line}</li>)}
      </ul>
      <div className="scan-bar"><span /></div>
    </div>
  );
}
