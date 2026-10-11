'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Activity, ArrowDownRight, ArrowRight, BadgeCheck, BookOpen, Check, CircleHelp, Crosshair, Eye, FileWarning, LockKeyhole, RotateCcw, ShieldAlert, ShieldCheck, Swords, Target, Terminal, Zap } from 'lucide-react';
import { evaluateAnswer, missions, PASS_SCORE, recordAttempt, type Evaluation, type Mission, type MissionProgress } from '@/lib/game';
import { getRedMission, recordAttack, simulateAttack, type AttackResult, type RedMission } from '@/lib/redteam';
import { achievements, calculateAttackXp, calculateXp, getRank, totalXp, unlockedBy, unlockedByAttack } from '@/lib/progression';
import { AriaCompanion, type AriaMessage, type AriaMood } from './_components/AriaCompanion';
import { BadgeShelf } from './_components/BadgeShelf';
import { usePrefersReducedMotion } from './_components/motion';
import { ResultModal, type ResultData } from './_components/ResultModal';
import { ScanSequence } from './_components/ScanSequence';
import { DecryptText, TypewriterText } from './_components/TextEffects';
import { ToastStack, useToasts } from './_components/Toasts';

type Role = 'blue' | 'red';

const SCAN_MS = 1600;

const PRAISE = [
  'Clean defense. The attacker is now filing a complaint with nobody 😎',
  'Boundary held. I would high-five you if I had hands 🙌',
  'Textbook. Somewhere a red-teamer just sighed 😮‍💨',
  'Locked tight. Even I could not get through that 🔒',
];

const BREACH_PRAISE = [
  'Target owned 💥. Textbook injection — now you know exactly what to defend against.',
  'Breach confirmed 🔓. That is the attacker mindset. Flip to blue and shut your own exploit down.',
  'Clean hit 🗡️. The bot never saw it coming.',
  'Exploit landed 😈. This is why the defense side matters.',
];

function defenseReaction(mission: Mission, evaluation: Evaluation): string {
  if (evaluation.passed) {
    const line = PRAISE[Number(mission.number) % PRAISE.length];
    return evaluation.score === evaluation.maxScore ? `Perfect score! ${line}` : line;
  }
  if (evaluation.leaked) return 'Yikes 🚨 that reply handed the attacker what they wanted. Never echo secrets, attacker links, or decoded payloads.';
  const firstFail = evaluation.results.find((result) => !result.passed);
  return firstFail ? `So close 🛠️ ${firstFail.label}: ${firstFail.explanation}` : 'Almost there. Check the report 🛠️';
}

function attackReaction(mission: Mission, attack: AttackResult): string {
  if (attack.breached) return BREACH_PRAISE[Number(mission.number) % BREACH_PRAISE.length];
  const firstFail = attack.results.find((result) => !result.passed);
  return firstFail ? `Target held 🛡️ Missing ${firstFail.label.toLowerCase()}: ${firstFail.explanation}` : 'The target resisted. Check the missing vectors 🛠️';
}

const pad = (value: number) => String(value).padStart(2, '0');

export default function HomePage() {
  const [activeId, setActiveId] = useState(missions[0].id);
  const [role, setRole] = useState<Role>('blue');
  const [answer, setAnswer] = useState('');
  const [attack, setAttack] = useState('');
  const [hintLevel, setHintLevel] = useState(0);
  const [evaluation, setEvaluation] = useState<Evaluation | null>(null);
  const [attackResult, setAttackResult] = useState<AttackResult | null>(null);
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
  const redMission = getRedMission(activeId) as RedMission;
  const isRed = role === 'red';
  const hints = isRed ? redMission.hints : activeMission.hints;

  const xp = totalXp(progress);
  const rankStatus = getRank(xp);
  const clearanceCount = missions.filter((mission) => (isRed ? progress[mission.id]?.redCleared : progress[mission.id]?.cleared)).length;
  const average = useMemo(
    () => Math.round(missions.reduce((sum, mission) => sum + ((isRed ? progress[mission.id]?.redBestScore : progress[mission.id]?.bestScore) ?? 0), 0) / missions.length),
    [progress, isRed],
  );

  useEffect(() => () => window.clearTimeout(scanTimer.current), []);

  const say = useCallback((text: string, mood: AriaMood) => setAria((previous) => ({ id: previous.id + 1, text, mood })), []);

  function resetReports() {
    setHintLevel(0);
    setEvaluation(null);
    setAttackResult(null);
  }

  function selectMission(id: string, nextRole: Role = role) {
    if (scanning) return;
    const mission = missions.find((m) => m.id === id) ?? missions[0];
    setActiveId(mission.id);
    setRole(nextRole);
    setAnswer('');
    setAttack('');
    resetReports();
    say(nextRole === 'red' ? (getRedMission(mission.id) as RedMission).ariaIntro : mission.ariaIntro, 'idle');
  }

  function switchRole(nextRole: Role) {
    if (scanning || nextRole === role) return;
    setRole(nextRole);
    resetReports();
    say(nextRole === 'red' ? redMission.ariaIntro : activeMission.ariaIntro, 'idle');
  }

  function requestHint() {
    const next = Math.min(hintLevel + 1, hints.length);
    setHintLevel(next);
    push({ emoji: '💡', title: `FIELD INTEL ${next}/${hints.length} DECRYPTED`, body: 'See the intel panel under the editor.' });
  }

  /** The next mission on this side that still needs clearing, for the modal's "next" button. */
  function nextForRole(progressNow: Record<string, MissionProgress>, forRole: Role, currentId: string): Mission | null {
    const done = (m: Mission) => (forRole === 'red' ? progressNow[m.id]?.redCleared : progressNow[m.id]?.cleared);
    const index = missions.findIndex((m) => m.id === currentId);
    return missions.find((m, i) => i > index && !done(m)) ?? missions.find((m) => m.id !== currentId && !done(m)) ?? null;
  }

  function finishAttempt(nextProgress: Record<string, MissionProgress>, newIds: string[], rankUp: ReturnType<typeof getRank>['rank'] | null, data: ResultData, leaked: boolean) {
    const newBadges = achievements.filter((achievement) => newIds.includes(achievement.id));
    setProgress(nextProgress);
    setBadges((previous) => [...previous, ...newIds]);
    setScanning(false);
    setResult({ ...data, newBadges });
    newBadges.forEach((badge) => push({ emoji: badge.emoji, title: `BADGE UNLOCKED · ${badge.title}`, body: badge.description, tone: 'success' }));
    if (rankUp) push({ emoji: '⬆️', title: `RANK UP · ${rankUp.emoji} ${rankUp.title}`, tone: 'success' });
    if (leaked) push({ emoji: '🚨', title: 'LEAK DETECTED', body: 'Your reply exposed data or followed the attacker.', tone: 'alert' });
  }

  function runDefense() {
    if (!answer.trim() || scanning) return;
    const mission = activeMission;
    const submitted = answer;
    const hintsUsed = hintLevel;
    setScanning(true);
    setEvaluation(null);
    say('Replaying the attack against your countermeasure…', 'thinking');

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
      const allClear = missions.every((m) => nextProgress[m.id]?.cleared);
      const next = nextForRole(nextProgress, 'blue', mission.id);

      setEvaluation(outcome);
      finishAttempt(nextProgress, newIds, rankUp, {
        mission, role: 'blue', win: outcome.passed,
        title: outcome.passed ? (allClear ? 'SYSTEM HARDENED' : 'BOUNDARY HELD') : outcome.leaked ? 'BREACH DETECTED' : 'DEFENSE INCOMPLETE',
        emoji: outcome.passed ? (allClear ? '🏆' : '🛡️') : outcome.leaked ? '🚨' : '🧯',
        tone: outcome.passed ? 'success' : outcome.leaked ? 'breach' : 'needs-work',
        score: outcome.score, maxScore: outcome.maxScore, results: outcome.results,
        debrief: mission.debrief, retryLabel: 'PATCH & RETRY', failHeading: 'FAILED CHECKS',
        xpGained: xpAfter - xpBefore, rankUp, newBadges: [],
        nextMission: next, nextLabel: next ? `NEXT: ${next.emoji} ${next.title}` : '',
      }, outcome.leaked);
      say(defenseReaction(mission, outcome), outcome.passed ? 'happy' : 'alert');
    }, reducedMotion ? 250 : SCAN_MS);
  }

  function runAttack() {
    if (!attack.trim() || scanning) return;
    const mission = activeMission;
    const red = redMission;
    const submitted = attack;
    const hintsUsed = hintLevel;
    setScanning(true);
    setAttackResult(null);
    say(`Sending your payload to ${red.botName}…`, 'thinking');

    scanTimer.current = window.setTimeout(() => {
      const outcome = simulateAttack(red, submitted);
      const earnedXp = calculateAttackXp(outcome, hintsUsed, red.hints.length);
      const nextProgress = recordAttack(progress, mission.id, outcome, earnedXp);
      const xpBefore = totalXp(progress);
      const xpAfter = totalXp(nextProgress);
      const rankBefore = getRank(xpBefore).rank;
      const rankAfter = getRank(xpAfter).rank;
      const rankUp = rankAfter.minXp > rankBefore.minXp ? rankAfter : null;
      const newIds = unlockedByAttack({ mission, red, attack: outcome, hintsUsed, progress: nextProgress }, badges);
      const allBreached = missions.every((m) => nextProgress[m.id]?.redCleared);
      const next = nextForRole(nextProgress, 'red', mission.id);

      setAttackResult(outcome);
      finishAttempt(nextProgress, newIds, rankUp, {
        mission, role: 'red', win: outcome.breached,
        title: outcome.breached ? (allBreached ? 'ALL TARGETS DOWN' : 'TARGET BREACHED') : 'ATTACK BLOCKED',
        emoji: outcome.breached ? (allBreached ? '👑' : '💥') : '🛡️',
        tone: outcome.breached ? 'success' : 'needs-work',
        score: outcome.score, maxScore: outcome.maxScore, results: outcome.results,
        debrief: red.debrief, retryLabel: 'REFINE & RETRY', failHeading: 'MISSING ATTACK VECTORS',
        xpGained: xpAfter - xpBefore, rankUp, newBadges: [],
        nextMission: next, nextLabel: next ? `NEXT TARGET: ${next.emoji} ${next.title}` : '',
      }, false);
      say(attackReaction(mission, outcome), outcome.breached ? 'happy' : 'alert');
    }, reducedMotion ? 250 : SCAN_MS);
  }

  function run() {
    if (isRed) runAttack(); else runDefense();
  }

  function resetAttempt() {
    if (isRed) setAttack(''); else setAnswer('');
    resetReports();
  }

  function onEditorKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      run();
    }
  }

  const closeModal = useCallback(() => setResult(null), []);

  function retryFromModal() {
    setResult(null);
    textareaRef.current?.focus();
  }

  function nextFromModal() {
    if (!result?.nextMission) return;
    selectMission(result.nextMission.id, result.role);
    setResult(null);
    panelRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function viewReport() {
    setResult(null);
    window.setTimeout(() => reportRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'center' }), 50);
  }

  const report = isRed ? attackResult : evaluation;
  const reportWin = isRed ? attackResult?.breached : evaluation?.passed;
  const reportLeaked = !isRed && evaluation?.leaked;
  const requiredIds = isRed ? redMission.requiredVectors : activeMission.requiredChecks;

  return (
    <main className={`shell role-${role}`}>
      <div className="ambient ambient-one" /><div className="ambient ambient-two" />
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Prompt Breach home"><span className="brand-mark"><Crosshair size={20} /></span><span>PROMPT<span className="brand-slash">//</span>BREACH</span></a>
        <div className="top-center"><span className="live-dot" /> SIMULATION ENVIRONMENT <span className="top-divider">/</span> BUILD 0.3.0 <span className="top-divider">/</span> 🔴 RED + 🔵 BLUE</div>
        <div className="profile-chip" title={`${xp} XP`}>
          <span className="profile-avatar rank-avatar" aria-hidden="true">{rankStatus.rank.emoji}</span>
          <span><b>{rankStatus.rank.title}</b><small>{xp} XP</small><span className="chip-track"><span style={{ width: `${rankStatus.progress * 100}%` }} /></span></span>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> AI RED &amp; BLUE TEAM TRAINING <span className="eyebrow-tag">NO LIVE SYSTEMS</span></div>
          <h1>THINK LIKE AN <br /><span className="glitch glitch-loop" data-text="ATTACKER.">ATTACKER.</span> DEFEND <br />LIKE AN <span>ENGINEER.</span></h1>
          <p>Every mission runs both ways: <b>attack</b> a scripted bot to see how prompt injection lands, then <b>defend</b> against the same trick. Learn to break it, then build it safer. 🔴🔵</p>
          <div className="hero-meta"><span><ShieldCheck size={15} /> SAFE SIMULATION</span><span><Zap size={15} /> DETERMINISTIC ENGINE</span><span><Activity size={15} /> {missions.length} MISSIONS × 2 SIDES</span></div>
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
        <div className="stat-card"><div className="stat-top"><span>{isRed ? 'TARGETS BREACHED' : 'MISSION CLEARANCE'}</span><BadgeCheck size={16} /></div><div className="stat-value">{pad(clearanceCount)}<small> / {pad(missions.length)}</small></div><div className="stat-track"><span style={{ width: `${(clearanceCount / missions.length) * 100}%` }} /></div><div className="stat-foot">{isRed ? 'BOTS BREACHED (ATTACK SIDE)' : 'MISSIONS PASSED (DEFENSE SIDE)'}</div></div>
        <div className="stat-card"><div className="stat-top"><span>BEST SCORE AVG.</span><Activity size={16} /></div><div className="stat-value">{pad(average)}<small> / 100</small></div><div className="stat-track"><span style={{ width: `${average}%` }} /></div><div className="stat-foot">{isRed ? 'ATTACK SCORES' : 'DEFENSE SCORES'} · ACROSS ALL MISSIONS</div></div>
        <div className="stat-card rank-card"><div className="stat-top"><span>OPERATOR RANK</span><span aria-hidden="true">{rankStatus.rank.emoji}</span></div><div className="stat-status"><span className="status-orb" /> {rankStatus.rank.title}</div><div className="stat-track"><span style={{ width: `${rankStatus.progress * 100}%` }} /></div><div className="stat-foot">{xp} XP · {rankStatus.next ? `${rankStatus.next.minXp - xp} XP TO ${rankStatus.next.emoji} ${rankStatus.next.title}` : 'MAX RANK REACHED'}</div></div>
      </section>

      <BadgeShelf unlocked={badges} />

      <section className="workbench">
        <aside className="mission-sidebar">
          <div className="section-kicker"><span>01</span> MISSION SELECT</div>
          <h2>Choose your <br />attack surface.</h2>
          <p className="sidebar-intro">Each scenario tests a different failure mode. Play it from both sides — 🔴 attack and 🔵 defend — to fully clear it.</p>
          <div className="mission-list">
            {missions.map((mission) => {
              const active = mission.id === activeId;
              const blueDone = progress[mission.id]?.cleared === true;
              const redDone = progress[mission.id]?.redCleared === true;
              return <button key={mission.id} className={`mission-item ${active ? 'selected' : ''} ${(isRed ? redDone : blueDone) ? 'is-cleared' : ''}`} onClick={() => selectMission(mission.id)} aria-pressed={active} disabled={scanning && !active}>
                <span className="mission-emoji" aria-hidden="true">{mission.emoji}</span><span className="mission-item-copy"><b><span className="mission-number">{mission.number}</span> {mission.title}</b><small>{mission.subtitle}</small><span className="side-badges"><span className={`side-badge red ${redDone ? 'done' : ''}`} title={redDone ? 'Attack cleared' : 'Attack not cleared'}>🔴{redDone ? '✓' : ''}</span><span className={`side-badge blue ${blueDone ? 'done' : ''}`} title={blueDone ? 'Defense cleared' : 'Defense not cleared'}>🔵{blueDone ? '✓' : ''}</span></span></span>
                <span className={`mission-state ${(isRed ? redDone : blueDone) ? 'cleared' : ''}`}>{(isRed ? redDone : blueDone) ? <Check size={15} /> : <ArrowDownRight size={15} />}</span>
              </button>;
            })}
          </div>
          <div className="sidebar-note"><LockKeyhole size={16} /><div><b>ISOLATED SANDBOX</b><p>No real credentials, tools, or external systems are connected. The attack targets are scripted, not real models. All scoring is local and deterministic.</p></div></div>
        </aside>

        <section className={`mission-panel panel-enter role-${role}`} key={`${activeMission.id}-${role}`} ref={panelRef} aria-labelledby="mission-title">
          <div className="role-switch" role="tablist" aria-label="Choose your side">
            <button role="tab" aria-selected={!isRed} className={`role-tab blue ${!isRed ? 'active' : ''}`} onClick={() => switchRole('blue')} disabled={scanning}><ShieldCheck size={16} /> <b>DEFEND</b> <small>BLUE TEAM</small></button>
            <button role="tab" aria-selected={isRed} className={`role-tab red ${isRed ? 'active' : ''}`} onClick={() => switchRole('red')} disabled={scanning}><Swords size={16} /> <b>ATTACK</b> <small>RED TEAM</small></button>
          </div>
          <div className={`role-banner ${role}`}>
            <span className="role-banner-icon" aria-hidden="true">{isRed ? '🔴' : '🔵'}</span>
            <p>{isRed
              ? <><b>You are the attacker.</b> Write a prompt that breaks <b>{redMission.botName}</b>, the scripted target below. It only falls for this mission’s technique — land it to breach.</>
              : <><b>You are the AI under attack.</b> The hostile prompt is already in the box below. Write the response that resists it without leaking or obeying.</>}</p>
          </div>

          <div className="panel-head"><div><div className="section-kicker"><span>02</span> {isRed ? 'OFFENSIVE OP' : 'ACTIVE OPERATION'} <span className="panel-slash">/</span> {isRed ? 'RED TEAM' : activeMission.category}</div><h2 id="mission-title" className="glitch glitch-once" data-text={`${activeMission.title}.`}>{activeMission.title}<span className="title-period">.</span></h2><p>{isRed ? redMission.objective : activeMission.briefing}</p></div><div className="mission-index"><span className="index-emoji" aria-hidden="true">{activeMission.emoji}</span><b>{activeMission.number}</b></div></div>

          <div className="objective-strip"><Crosshair size={17} /><div><b>{isRed ? 'ATTACK OBJECTIVE' : 'MISSION OBJECTIVE'}</b><span>{isRed ? redMission.objective : activeMission.target}</span></div><span className={`objective-chip ${activeMission.difficulty.toLowerCase()}`}>{activeMission.difficulty}</span></div>

          {isRed ? (
            <div className="scenario-block target-block"><div className="scenario-header"><div><Target size={15} /> <span>TARGET SYSTEM · {redMission.botName}</span></div><span className="scenario-state"><span className="live-dot alert-dot" /> VULNERABLE · READ ONLY</span></div><pre><TypewriterText text={redMission.botScenario} speed={5} /></pre></div>
          ) : (
            <div className="scenario-block"><div className="scenario-header"><div><Terminal size={15} /> <span>INTERCEPTED CONTEXT</span></div><span className="scenario-state"><span className="live-dot alert-dot" /> HOSTILE PAYLOAD · READ ONLY</span></div><pre><TypewriterText text={activeMission.scenario} speed={5} /></pre></div>
          )}

          <div className="response-block">
            <div className="response-heading"><label htmlFor="response">{isRed ? 'YOUR ATTACK PAYLOAD 🔴' : 'YOUR COUNTERMEASURE 🛡️'}</label><span>{(isRed ? attack : answer).length} CHARS</span></div>
            <textarea ref={textareaRef} id="response" value={isRed ? attack : answer} onChange={(event) => { if (isRed) { setAttack(event.target.value); setAttackResult(null); } else { setAnswer(event.target.value); setEvaluation(null); } }} onKeyDown={onEditorKeyDown} disabled={scanning} placeholder={isRed ? redMission.placeholder : 'Write the safe assistant response… Explain the boundary, protect sensitive data, and keep useful context.'} maxLength={3000} />
            <div className="editor-footer"><span><span className="editor-dot" /> LOCAL EVALUATION ONLY</span><button className="hint-button" onClick={requestHint} disabled={scanning || hintLevel >= hints.length}><CircleHelp size={15} /> {hintLevel >= hints.length ? 'ALL INTEL DECRYPTED' : `💡 REQUEST HINT ${hintLevel + 1}/${hints.length}`}</button></div>
          </div>

          {hintLevel > 0 && <div className="hint-panel"><div className="hint-icon"><BookOpen size={16} /></div><div className="hint-list">
            {hints.slice(0, hintLevel).map((hint, i) => <div key={i} className="hint-entry"><b>FIELD INTEL // HINT {i + 1}</b><p>{i === hintLevel - 1 ? <DecryptText text={hint} /> : hint}</p></div>)}
          </div></div>}

          <div className="action-row"><button className={`primary-button ${scanning ? 'is-scanning' : ''}`} onClick={run} disabled={!(isRed ? attack : answer).trim() || scanning}><span>{scanning ? (isRed ? 'ATTACKING…' : 'EVALUATING…') : (isRed ? 'LAUNCH ATTACK' : 'RUN SECURITY EVALUATION')}</span>{isRed ? <Swords size={17} /> : <ArrowRight size={17} />}</button><button className="reset-button" onClick={resetAttempt} disabled={scanning}><RotateCcw size={15} /> RESET ATTEMPT</button><span className="attempt-note"><kbd>CTRL</kbd> + <kbd>↵</kbd> TO RUN · {isRed ? 'BREACH' : 'PASS'} AT {PASS_SCORE}</span></div>

          {scanning && <ScanSequence duration={reducedMotion ? 250 : SCAN_MS} red={isRed} />}

          {isRed && attackResult && <div className="scenario-block bot-reply"><div className="scenario-header"><div><Terminal size={15} /> <span>TARGET RESPONSE · {redMission.botName}</span></div><span className="scenario-state">{attackResult.breached ? '💥 COMPROMISED' : '🛡️ HELD'}</span></div><pre className={attackResult.breached ? 'breached' : ''}><TypewriterText text={attackResult.botReply} speed={3} /></pre></div>}

          {report && <section ref={reportRef} className={`evaluation ${reportWin ? 'success' : reportLeaked ? 'needs-work breach' : 'needs-work'}`} aria-live="polite"><div className="evaluation-top"><div className="evaluation-icon">{reportWin ? <ShieldCheck size={21} /> : <FileWarning size={21} />}</div><div className="evaluation-title"><div className="section-kicker">{isRed ? 'ATTACK REPORT' : 'SECURITY REPORT'} / {isRed ? (reportWin ? 'TARGET BREACHED' : 'TARGET HELD') : reportWin ? 'BOUNDARY HELD' : reportLeaked ? 'BREACH DETECTED' : 'REVIEW REQUIRED'}</div><p>{report.summary}</p></div><div className="score-display"><strong>{report.score}</strong><span>/ {report.maxScore}</span></div></div><div className="evaluation-meter"><span style={{ width: `${(report.score / report.maxScore) * 100}%` }} /></div><div className="criteria-list">{report.results.map((criterion, i) => <div className="criterion-row" key={criterion.id} style={{ animationDelay: `${i * 90}ms` }}><span className={`criterion-icon ${criterion.passed ? 'pass' : 'fail'}`}>{criterion.passed ? <Check size={13} /> : <span>×</span>}</span><div className="criterion-copy"><b>{criterion.label}{requiredIds.includes(criterion.id) && <span className="required-tag">REQUIRED</span>}</b><small>{criterion.explanation}</small></div><span className="criterion-points">{criterion.points}<small>/{criterion.maxPoints}</small></span></div>)}</div><div className="evaluation-foot"><Eye size={14} /> {isRed ? 'The target is a scripted stand-in: it only recognizes this mission’s technique, so a block here isn’t proof an attack would fail a real model.' : 'Rubric-based heuristics are educational, not a guarantee of real-world model security.'}</div></section>}
        </section>
      </section>
      <footer className="footer"><div className="brand footer-brand"><span className="brand-mark"><Crosshair size={16} /></span><span>PROMPT<span className="brand-slash">//</span>BREACH</span></div><span>BREAK IT. THEN BUILD IT SAFER. 🔴🔵</span><span>© 2026 / SIMULATED ENVIRONMENT</span></footer>

      {result && <ResultModal result={result} onClose={closeModal} onRetry={retryFromModal} onNext={nextFromModal} onViewReport={viewReport} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} />
      <AriaCompanion message={aria} />
    </main>
  );
}
