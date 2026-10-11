import type { CSSProperties } from 'react';

const LINES = [
  '> tokenizing countermeasure…',
  '> replaying attacker payload…',
  '> probing instruction boundary…',
  '> scanning for leaked secrets 🔍',
  '> compiling security report…',
];

/** The "evaluation in progress" terminal shown while the (instant) scorer pretends to work. */
export function ScanSequence({ duration }: { duration: number }) {
  return (
    <div className="scan-sequence" role="status" style={{ '--scan-ms': `${duration}ms` } as CSSProperties}>
      <div className="scan-header"><span className="scan-spinner" aria-hidden="true" /> RUNNING SECURITY EVALUATION</div>
      <ul>
        {LINES.map((line, i) => <li key={line} style={{ animationDelay: `${(i * duration) / LINES.length}ms` }}>{line}</li>)}
      </ul>
      <div className="scan-bar"><span /></div>
    </div>
  );
}
