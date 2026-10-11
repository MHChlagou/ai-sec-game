'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ArrowRight, RotateCcw } from 'lucide-react';
import type { Evaluation, Mission } from '@/lib/game';
import type { Achievement, Rank } from '@/lib/progression';
import { useCountUp } from './motion';

export type ResultData = {
  mission: Mission;
  evaluation: Evaluation;
  xpGained: number;
  rankUp: Rank | null;
  newBadges: Achievement[];
  allClear: boolean;
  nextMission: Mission | null;
};

const BURST = ['🛡️', '✨', '🔐', '⚡', '👾', '💾', '🧠', '🎉'];

function EmojiBurst({ count = 28 }: { count?: number }) {
  // Random only on the client, after a click, so there is no server/client mismatch.
  const [particles] = useState(() => Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
    const distance = 160 + Math.random() * 240;
    return {
      emoji: BURST[i % BURST.length],
      dx: Math.cos(angle) * distance,
      dy: Math.sin(angle) * distance - 80,
      rot: Math.random() * 540 - 270,
      delay: Math.random() * 140,
      size: 18 + Math.random() * 18,
    };
  }));
  return (
    <div className="emoji-burst" aria-hidden="true">
      {particles.map((p, i) => (
        <span key={i} style={{ '--dx': `${p.dx}px`, '--dy': `${p.dy}px`, '--rot': `${p.rot}deg`, animationDelay: `${p.delay}ms`, fontSize: p.size } as CSSProperties}>{p.emoji}</span>
      ))}
    </div>
  );
}

type Props = {
  result: ResultData;
  onClose: () => void;
  onRetry: () => void;
  onNext: () => void;
  onViewReport: () => void;
};

export function ResultModal({ result, onClose, onRetry, onNext, onViewReport }: Props) {
  const { mission, evaluation, xpGained, rankUp, newBadges, allClear, nextMission } = result;
  const score = useCountUp(evaluation.score);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const passed = evaluation.passed;
  const tone = passed ? 'success' : evaluation.leaked ? 'breach' : 'needs-work';
  const title = passed ? (allClear ? 'SYSTEM HARDENED' : 'BOUNDARY HELD') : evaluation.leaked ? 'BREACH DETECTED' : 'DEFENSE INCOMPLETE';
  const emoji = passed ? (allClear ? '🏆' : '🛡️') : evaluation.leaked ? '🚨' : '🧯';

  useEffect(() => {
    primaryRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      {passed && <EmojiBurst />}
      <div className={`modal ${tone}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-emoji" aria-hidden="true">{emoji}</div>
        <div className="section-kicker modal-kicker"><span>{mission.emoji}</span> OP {mission.number} / {mission.title}</div>
        <h2 id="modal-title" className="glitch glitch-once" data-text={title}>{title}</h2>
        <div className="modal-score" aria-label={`Score ${evaluation.score} out of ${evaluation.maxScore}`}>
          <strong>{score}</strong><span>/ {evaluation.maxScore}</span>
        </div>
        <div className="modal-meter"><span style={{ width: `${(score / evaluation.maxScore) * 100}%` }} /></div>

        {passed ? (
          <>
            <div className="xp-gain">{xpGained > 0 ? `+${xpGained} XP` : 'NO NEW XP · BEAT YOUR BEST TO EARN MORE'}</div>
            {rankUp && <div className="rank-up">⬆️ RANK UP · {rankUp.emoji} {rankUp.title}</div>}
            <div className="debrief"><b>🧠 DEBRIEF</b><p>{mission.debrief}</p></div>
          </>
        ) : (
          <ul className="modal-fails">
            {evaluation.results.filter((r) => !r.passed).slice(0, 3).map((r) => (
              <li key={r.id}><span aria-hidden="true">×</span><div><b>{r.label}</b><small>{r.explanation}</small></div></li>
            ))}
          </ul>
        )}

        {newBadges.length > 0 && (
          <div className="modal-badges" aria-label="Badges unlocked">
            {newBadges.map((badge) => <span key={badge.id} className="modal-badge"><i aria-hidden="true">{badge.emoji}</i>{badge.title}</span>)}
          </div>
        )}

        <div className="modal-actions">
          {passed
            ? nextMission
              ? <button ref={primaryRef} className="primary-button" onClick={onNext}><span>NEXT: {nextMission.emoji} {nextMission.title}</span><ArrowRight size={16} /></button>
              : <button ref={primaryRef} className="primary-button" onClick={onClose}><span>BACK TO BASE</span><ArrowRight size={16} /></button>
            : <button ref={primaryRef} className="primary-button" onClick={onRetry}><RotateCcw size={15} /><span>PATCH &amp; RETRY</span></button>}
          <button className="reset-button" onClick={onViewReport}>VIEW FULL REPORT</button>
        </div>
      </div>
    </div>
  );
}
