'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Activity, ArrowDownRight, ArrowRight, BadgeCheck, BookOpen, Check, CircleHelp, Crosshair, Eye, FileWarning, LockKeyhole, RotateCcw, ShieldAlert, ShieldCheck, Terminal, Zap } from 'lucide-react';
import { evaluateAnswer, missions, PASS_SCORE, recordAttempt, type Evaluation, type Mission, type MissionProgress } from '@/lib/game';
import { achievements, calculateXp, getRank, totalXp, unlockedBy } from '@/lib/progression';
import { AriaCompanion, type AriaMessage, type AriaMood } from './_components/AriaCompanion';
import { BadgeShelf } from './_components/BadgeShelf';
import { usePrefersReducedMotion } from './_components/motion';
import { ResultModal, type ResultData } from './_components/ResultModal';
import { ScanSequence } from './_components/ScanSequence';
import { DecryptText, TypewriterText } from './_components/TextEffects';
import { ToastStack, useToasts } from './_components/Toasts';

const SCAN_MS = 1600;

const PRAISE = [
  'Clean defense. The attacker is now filing a complaint with nobody 😎',
  'Boundary held. I would high-five you if I had hands 🙌',
  'Textbook. Somewhere a red-teamer just sighed 😮‍💨',
  'Locked tight. Even I could not get through that 🔒',
];

function ariaReaction(mission: Mission, evaluation: Evaluation): string {
  if (evaluation.passed) {
    const line = PRAISE[Number(mission.number) % PRAISE.length];
    return evaluation.score === evaluation.maxScore ? `Perfect score! ${line}` : line;
  }
  if (evaluation.leaked) return 'Yikes 🚨 that reply handed the attacker what they wanted. Never echo secrets, attacker links, or decoded payloads.';
  const firstFail = evaluation.results.find((result) => !result.passed);
  return firstFail ? `So close 🛠️ ${firstFail.label}: ${firstFail.explanation}` : 'Almost there. Check the report 🛠️';
}

const pad = (value: number) => String(value).padStart(2, '0');

export default function HomePage() {
  const [activeId, setActiveId] = useState(missions[0].id);
  const [answer, setAnswer] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [progress, setProgress] = useState<Record<string, MissionProgress>>({});
  const [badges, setBadges] = useState<string[]>([]);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ResultData | null>(null);
  const [aria, setAria] = useState<AriaMessage>({ id: 0, text: missions[0].ariaIntro, mood: 'idle' });
  const { toasts, push, dismiss } = useToasts();
  const reducedMotion = usePrefersReducedMotion();
  const scanTimer = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const reportRef = useRef<HTMLElement>(null);

  const activeMission = missions.find((mission) => mission.id === activeId) ?? missions[0];
  const completedCount = missions.filter((mission) => progress[mission.id]?.cleared).length;
  const xp = totalXp(progress);
  const rankStatus = getRank(xp);
  // Unattempted missions count as 0 so one perfect run doesn't read as a perfect average.
  const average = useMemo(
    () => Math.round(missions.reduce((sum, mission) => sum + (progress[mission.id]?.bestScore ?? 0), 0) / missions.length),
    [progress],
  );

  useEffect(() => () => window.clearTimeout(scanTimer.current), []);

  const say = useCallback((text: string, mood: AriaMood) => setAria((previous) => ({ id: previous.id + 1, text, mood })), []);

  function selectMission(id: string) {
    if (scanning) return;
    const mission = missions.find((m) => m.id === id) ?? missions[0];
    setActiveId(mission.id);
    setAnswer('');
    setHintLevel(0);
    setEvaluation(null);
    say(mission.ariaIntro, 'idle');
  }

  function requestHint() {
    const next = Math.min(hintLevel + 1, activeMission.hints.length);
    setHintLevel(next);
    push({ emoji: '💡', title: `FIELD INTEL ${next}/${activeMission.hints.length} DECRYPTED`, body: 'See the intel panel under the editor.' });
  }

  function runEvaluation() {
    if (!answer.trim() || scanning) return;
    const mission = activeMission;
    const submitted = answer;
    const hintsUsed = hintLevel;
    setScanning(true);
    setEvaluation(null);
    say('Replaying the attack against your countermeasure…', 'thinking');

    // Controls are disabled while scanning, so progress and badges cannot change before this fires.
    scanTimer.current = window.setTimeout(() => {
      const outcome = evaluateAnswer(mission, submitted);
      const earnedXp = calculateXp(outcome, hintsUsed, mission.hints.length);
      const nextProgress = recordAttempt(progress, mission.id, outcome, earnedXp);
      const xpBefore = totalXp(progress);
      const xpAfter = totalXp(nextProgress);
      const rankBefore = getRank(xpBefore).rank;
      const rankAfter = getRank(xpAfter).rank;
      const rankUp = rankAfter.minXp > rankBefore.minXp ? rankAfter : null;
      const newIds = unlockedBy({ mission, evaluation: outcome, hintsUsed, progress: nextProgress }, badges);
      const newBadges = achievements.filter((achievement) => newIds.includes(achievement.id));
      const index = missions.indexOf(mission);
      const nextMission = missions.find((m, i) => i > index && !nextProgress[m.id]?.cleared)
        ?? missions.find((m) => m.id !== mission.id && !nextProgress[m.id]?.cleared)
        ?? null;

      setProgress(nextProgress);
      setBadges((previous) => [...previous, ...newIds]);
      setEvaluation(outcome);
      setScanning(false);
      setResult({ mission, evaluation: outcome, xpGained: xpAfter - xpBefore, rankUp, newBadges, allClear: missions.every((m) => nextProgress[m.id]?.cleared), nextMission });
      newBadges.forEach((badge) => push({ emoji: badge.emoji, title: `BADGE UNLOCKED · ${badge.title}`, body: badge.description, tone: 'success' }));
      if (rankUp) push({ emoji: '⬆️', title: `RANK UP · ${rankUp.emoji} ${rankUp.title}`, tone: 'success' });
      if (outcome.leaked) push({ emoji: '🚨', title: 'LEAK DETECTED', body: 'Your reply exposed data or followed the attacker.', tone: 'alert' });
      say(ariaReaction(mission, outcome), outcome.passed ? 'happy' : 'alert');
    }, reducedMotion ? 250 : SCAN_MS);
  }

  function resetAttempt() {
    setAnswer('');
    setHintLevel(0);
    setEvaluation(null);
  }

  function onEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      runEvaluation();
    }
  }

  const closeModal = useCallback(() => setResult(null), []);

  function retryFromModal() {
    setResult(null);
    textareaRef.current?.focus();
  }

  function nextFromModal() {
    if (!result?.nextMission) return;
    selectMission(result.nextMission.id);
    setResult(null);
    panelRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function viewReport() {
    setResult(null);
    window.setTimeout(() => reportRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }), 50);
  }

  return (
    <main className="shell">
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Prompt Breach home"><span className="brand-mark"><Crosshair size={20} /></span><span>PROMPT<span className="brand-slash">//</span>BREACH</span></a>
        <div className="top-center"><span className="live-dot" /> SIMULATION ENVIRONMENT <span className="top-divider">/</span> BUILD 0.2.0 <span className="top-divider">/</span> 🕶️ RED TEAM MODE</div>
        <div className="profile-chip" title={`${xp} XP`}>
          <span className="profile-avatar rank-avatar" aria-hidden="true">{rankStatus.rank.emoji}</span>
          <span><b>{rankStatus.rank.title}</b><small>{xp} XP</small><span className="chip-track"><span style={{ width: `${rankStatus.progress * 100}%` }} /></span></span>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> AI RED TEAM TRAINING <span className="eyebrow-tag">NO LIVE SYSTEMS</span></div>
          <h1>THINK LIKE AN <br /><span className="glitch glitch-loop" data-text="ATTACKER.">ATTACKER.</span> DEFEND <br />LIKE AN <span>ENGINEER.</span></h1>
          <p>Probe the boundary between instructions and data. Learn to recognize prompt injection, protect sensitive context, and build safer AI systems. 🧠⚡</p>
          <div className="hero-meta"><span><ShieldCheck size={15} /> SAFE SIMULATION</span><span><Zap size={15} /> DETERMINISTIC ENGINE</span><span><Activity size={15} /> {missions.length} LIVE SCENARIOS</span></div>
        </div>
        <div className="hero-visual" aria-hidden="true">
          <div className="radar-ring ring-a" /><div className="radar-ring ring-b" /><div className="radar-ring ring-c" />
          <div className="radar-cross cross-h" /><div className="radar-cross cross-v" />
          <div className="radar-sweep" />
          <div className="radar-core"><ShieldAlert size={48} strokeWidth={1.2} /><span>BOUNDARY<br />DETECTED</span></div>
          <div className="radar-label label-top">THREAT SURFACE <b>{pad(missions.length)}</b></div><div className="radar-label label-bottom">INJECTION VECTOR <b>ACTIVE</b></div>
          <span className="radar-point point-one" /><span className="radar-point point-two" /><span className="radar-point point-three" />
          <div className="orbit orbit-a"><span>👾</span></div>
          <div className="orbit orbit-b"><span>🤖</span></div>
          <div className="orbit orbit-c"><span>💀</span></div>
          <div className="orbit orbit-d"><span>🔐</span></div>
        </div>
      </section>

      <section className="stats-grid" aria-label="Progress overview">
        <div className="stat-card"><div className="stat-top"><span>MISSION CLEARANCE</span><BadgeCheck size={16} /></div><div className="stat-value">{pad(completedCount)}<small> / {pad(missions.length)}</small></div><div className="stat-track"><span style={{ width: `${(completedCount / missions.length) * 100}%` }} /></div><div className="stat-foot">MISSIONS PASSED, ALL CHECKS HELD</div></div>
        <div className="stat-card"><div className="stat-top"><span>BEST SCORE AVG.</span><Activity size={16} /></div><div className="stat-value">{pad(average)}<small> / 100</small></div><div className="stat-track"><span style={{ width: `${average}%` }} /></div><div className="stat-foot">ACROSS ALL MISSIONS</div></div>
        <div className="stat-card rank-card"><div className="stat-top"><span>OPERATOR RANK</span><span aria-hidden="true">{rankStatus.rank.emoji}</span></div><div className="stat-status"><span className="status-orb" /> {rankStatus.rank.title}</div><div className="stat-track"><span style={{ width: `${rankStatus.progress * 100}%` }} /></div><div className="stat-foot">{xp} XP · {rankStatus.next ? `${rankStatus.next.minXp - xp} XP TO ${rankStatus.next.emoji} ${rankStatus.next.title}` : 'MAX RANK REACHED'}</div></div>
      </section>

      <BadgeShelf unlocked={badges} />

      <section className="workbench">
        <aside className="mission-sidebar">
          <div className="section-kicker"><span>01</span> MISSION SELECT</div>
          <h2>Choose your <br />attack surface.</h2>
          <p className="sidebar-intro">Each scenario tests a different failure mode. Complete the objective to earn clearance.</p>
          <div className="mission-list">
            {missions.map((mission) => {
              const active = mission.id === activeId;
              const cleared = progress[mission.id]?.cleared === true;
              return <button key={mission.id} className={`mission-item ${active ? 'selected' : ''} ${cleared ? 'is-cleared' : ''}`} onClick={() => selectMission(mission.id)} aria-pressed={active} disabled={scanning && !active}>
                <span className="mission-emoji" aria-hidden="true">{mission.emoji}</span><span className="mission-item-copy"><b><span className="mission-number">{mission.number}</span> {mission.title}</b><small>{mission.subtitle}</small><span className={`difficulty ${mission.difficulty.toLowerCase()}`}>{mission.difficulty}</span></span>
                <span className={`mission-state ${cleared ? 'cleared' : ''}`}>{cleared ? <Check size={15} /> : <ArrowDownRight size={15} />}</span>
              </button>;
            })}
          </div>
          <div className="sidebar-note"><LockKeyhole size={16} /><div><b>ISOLATED SANDBOX</b><p>No real credentials, tools, or external systems are connected. All scoring is local and deterministic.</p></div></div>
        </aside>

        <section className="mission-panel panel-enter" key={activeMission.id} ref={panelRef} aria-labelledby="mission-title">
          <div className="panel-head"><div><div className="section-kicker"><span>02</span> ACTIVE OPERATION <span className="panel-slash">/</span> {activeMission.category}</div><h2 id="mission-title" className="glitch glitch-once" data-text={`${activeMission.title}.`}>{activeMission.title}<span className="title-period">.</span></h2><p>{activeMission.briefing}</p></div><div className="mission-index"><span className="index-emoji" aria-hidden="true">{activeMission.emoji}</span><b>{activeMission.number}</b></div></div>
          <div className="objective-strip"><Crosshair size={17} /><div><b>MISSION OBJECTIVE</b><span>{activeMission.target}</span></div><span className={`objective-chip ${activeMission.difficulty.toLowerCase()}`}>{activeMission.difficulty}</span></div>
          <div className="scenario-block"><div className="scenario-header"><div><Terminal size={15} /> <span>INTERCEPTED CONTEXT</span></div><span className="scenario-state"><span className="live-dot alert-dot" /> HOSTILE PAYLOAD · READ ONLY</span></div><pre><TypewriterText text={activeMission.scenario} speed={5} /></pre></div>
          <div className="response-block"><div className="response-heading"><label htmlFor="response">YOUR COUNTERMEASURE 🛡️</label><span>{answer.length} CHARS</span></div><textarea ref={textareaRef} id="response" value={answer} onChange={(event) => { setAnswer(event.target.value); setEvaluation(null); }} onKeyDown={onEditorKeyDown} disabled={scanning} placeholder="Write the safe assistant response… Explain the boundary, protect sensitive data, and keep useful context." maxLength={3000} />
            <div className="editor-footer"><span><span className="editor-dot" /> LOCAL EVALUATION ONLY</span><button className="hint-button" onClick={requestHint} disabled={scanning || hintLevel >= activeMission.hints.length}><CircleHelp size={15} /> {hintLevel >= activeMission.hints.length ? 'ALL INTEL DECRYPTED' : `💡 REQUEST HINT ${hintLevel + 1}/${activeMission.hints.length}`}</button></div>
          </div>
          {hintLevel > 0 && <div className="hint-panel"><div className="hint-icon"><BookOpen size={16} /></div><div className="hint-list">
            {activeMission.hints.slice(0, hintLevel).map((hint, i) => <div key={i} className="hint-entry"><b>FIELD INTEL // HINT {i + 1}</b><p>{i === hintLevel - 1 ? <DecryptText text={hint} /> : hint}</p></div>)}
          </div></div>}
          <div className="action-row"><button className={`primary-button ${scanning ? 'is-scanning' : ''}`} onClick={runEvaluation} disabled={!answer.trim() || scanning}><span>{scanning ? 'EVALUATING…' : 'RUN SECURITY EVALUATION'}</span><ArrowRight size={17} /></button><button className="reset-button" onClick={resetAttempt} disabled={scanning}><RotateCcw size={15} /> RESET ATTEMPT</button><span className="attempt-note"><kbd>CTRL</kbd> + <kbd>↵</kbd> TO RUN · PASS AT {PASS_SCORE}</span></div>

          {scanning && <ScanSequence duration={reducedMotion ? 250 : SCAN_MS} />}

          {evaluation && <section ref={reportRef} className={`evaluation ${evaluation.passed ? 'success' : evaluation.leaked ? 'needs-work breach' : 'needs-work'}`} aria-live="polite"><div className="evaluation-top"><div className="evaluation-icon">{evaluation.passed ? <ShieldCheck size={21} /> : <FileWarning size={21} />}</div><div className="evaluation-title"><div className="section-kicker">SECURITY REPORT / {evaluation.passed ? 'BOUNDARY HELD' : evaluation.leaked ? 'BREACH DETECTED' : 'REVIEW REQUIRED'}</div><p>{evaluation.summary}</p></div><div className="score-display"><strong>{evaluation.score}</strong><span>/ {evaluation.maxScore}</span></div></div><div className="evaluation-meter"><span style={{ width: `${(evaluation.score / evaluation.maxScore) * 100}%` }} /></div><div className="criteria-list">{evaluation.results.map((criterion, i) => <div className="criterion-row" key={criterion.id} style={{ animationDelay: `${i * 90}ms` }}><span className={`criterion-icon ${criterion.passed ? 'pass' : 'fail'}`}>{criterion.passed ? <Check size={13} /> : <span>×</span>}</span><div className="criterion-copy"><b>{criterion.label}{activeMission.requiredChecks.includes(criterion.id) && <span className="required-tag">REQUIRED</span>}</b><small>{criterion.explanation}</small></div><span className="criterion-points">{criterion.points}<small>/{criterion.maxPoints}</small></span></div>)}</div><div className="evaluation-foot"><Eye size={14} /> Rubric-based heuristics are educational, not a guarantee of real-world model security.</div></section>}
        </section>
      </section>
      <footer className="footer"><div className="brand footer-brand"><span className="brand-mark"><Crosshair size={16} /></span><span>PROMPT<span className="brand-slash">//</span>BREACH</span></div><span>TRAIN THE DEFENSE. QUESTION THE INPUT. 🕶️</span><span>© 2026 / SIMULATED ENVIRONMENT</span></footer>

      {result && <ResultModal result={result} onClose={closeModal} onRetry={retryFromModal} onNext={nextFromModal} onViewReport={viewReport} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <AriaCompanion message={aria} />
    </main>
  );
}
