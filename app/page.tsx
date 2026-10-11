'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Activity, ArrowDownRight, ArrowRight, BadgeCheck, BookOpen, Check, CircleHelp, Crosshair, Eye, FileWarning, Languages, LockKeyhole, RotateCcw, ShieldAlert, ShieldCheck, Swords, Target, Terminal, Zap } from 'lucide-react';
import { evaluateAnswer, missions, PASS_SCORE, recordAttempt, type Evaluation, type Mission, type MissionProgress } from '@/lib/game';
import { getRedMission, recordAttack, simulateAttack, type AttackResult, type RedMission } from '@/lib/redteam';
import { achievements, calculateAttackXp, calculateXp, getRank, totalXp, unlockedBy, unlockedByAttack } from '@/lib/progression';
import { L, ui, type Lang } from '@/lib/i18n';
import { AriaCompanion, type AriaMessage, type AriaMood } from './_components/AriaCompanion';
import { BadgeShelf } from './_components/BadgeShelf';
import { usePrefersReducedMotion } from './_components/motion';
import { ResultModal, type ResultData } from './_components/ResultModal';
import { ScanSequence } from './_components/ScanSequence';
import { DecryptText, TypewriterText } from './_components/TextEffects';
import { ToastStack, useToasts } from './_components/Toasts';

type Role = 'blue' | 'red';

const SCAN_MS = 1600;
const LANG_KEY = 'pb-lang';

function defenseReaction(mission: Mission, evaluation: Evaluation, lang: Lang): string {
  const t = ui[lang];
  if (evaluation.passed) {
    const praise = t.praise.split('|');
    const line = praise[Number(mission.number) % praise.length];
    return evaluation.score === evaluation.maxScore ? `${t.reactPerfect}${line}` : line;
  }
  if (evaluation.leaked) return t.reactYikes;
  const firstFail = evaluation.results.find((result) => !result.passed);
  return firstFail ? `${t.reactSoClose}${firstFail.label}: ${firstFail.explanation}` : t.reactAlmost;
}

function attackReaction(mission: Mission, attack: AttackResult, lang: Lang): string {
  const t = ui[lang];
  if (attack.breached) {
    const praise = t.breachPraise.split('|');
    return praise[Number(mission.number) % praise.length];
  }
  const firstFail = attack.results.find((result) => !result.passed);
  return firstFail ? `${t.reactTargetHeld}${firstFail.label.toLowerCase()}: ${firstFail.explanation}` : t.reactTargetResisted;
}

const pad = (value: number) => String(value).padStart(2, '0');

export default function HomePage() {
  const [lang, setLang] = useState<Lang>('en');
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
  const [aria, setAria] = useState<AriaMessage>({ id: 0, text: L(missions[0].ariaIntro, 'en'), mood: 'idle' });
  const { toasts, push, dismiss } = useToasts();
  const reducedMotion = usePrefersReducedMotion();
  const scanTimer = useRef<number | undefined>(undefined);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const reportRef = useRef<HTMLElement>(null);

  const t = ui[lang];
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

  // Restore the saved language, or default to French for French-locale browsers.
  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(LANG_KEY); } catch { /* storage blocked */ }
    const initial: Lang = stored === 'fr' || stored === 'en' ? stored : navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
    if (initial !== 'en') setLang(initial);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    try { window.localStorage.setItem(LANG_KEY, lang); } catch { /* storage blocked */ }
  }, [lang]);

  useEffect(() => () => window.clearTimeout(scanTimer.current), []);

  const say = useCallback((text: string, mood: AriaMood) => setAria((previous) => ({ id: previous.id + 1, text, mood })), []);

  function toggleLang() {
    const next: Lang = lang === 'en' ? 'fr' : 'en';
    setLang(next);
    // Re-show the active intro in the new language so ARIA doesn't keep stale-language text.
    say(isRed ? L(redMission.ariaIntro, next) : L(activeMission.ariaIntro, next), 'idle');
  }

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
    say(nextRole === 'red' ? L((getRedMission(mission.id) as RedMission).ariaIntro, lang) : L(mission.ariaIntro, lang), 'idle');
  }

  function switchRole(nextRole: Role) {
    if (scanning || nextRole === role) return;
    setRole(nextRole);
    resetReports();
    say(nextRole === 'red' ? L(redMission.ariaIntro, lang) : L(activeMission.ariaIntro, lang), 'idle');
  }

  function requestHint() {
    const next = Math.min(hintLevel + 1, hints.length);
    setHintLevel(next);
    push({ emoji: '💡', title: `${t.intelShort} ${next}/${hints.length} ${t.decrypted}`, body: t.intelBody });
  }

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
    newBadges.forEach((badge) => push({ emoji: badge.emoji, title: `${t.badgeUnlocked} · ${badge.title}`, body: L(badge.description, lang), tone: 'success' }));
    if (rankUp) push({ emoji: '⬆️', title: `${t.rankUpToast} · ${rankUp.emoji} ${rankUp.title}`, tone: 'success' });
    if (leaked) push({ emoji: '🚨', title: t.leakDetected, body: t.leakBody, tone: 'alert' });
  }

  function runDefense() {
    if (!answer.trim() || scanning) return;
    const mission = activeMission;
    const submitted = answer;
    const hintsUsed = hintLevel;
    setScanning(true);
    setEvaluation(null);
    say(t.thinkingDefense, 'thinking');

    scanTimer.current = window.setTimeout(() => {
      const outcome = evaluateAnswer(mission, submitted, lang);
      const earnedXp = calculateXp(outcome, hintsUsed, mission.hints.length);
      const nextProgress = recordAttempt(progress, mission.id, outcome, earnedXp);
      const xpBefore = totalXp(progress);
      const xpAfter = totalXp(nextProgress);
      const rankUp = getRank(xpAfter).rank.minXp > getRank(xpBefore).rank.minXp ? getRank(xpAfter).rank : null;
      const newIds = unlockedBy({ mission, evaluation: outcome, hintsUsed, progress: nextProgress }, badges);
      const allClear = missions.every((m) => nextProgress[m.id]?.cleared);
      const next = nextForRole(nextProgress, 'blue', mission.id);

      setEvaluation(outcome);
      finishAttempt(nextProgress, newIds, rankUp, {
        mission, role: 'blue', win: outcome.passed,
        title: outcome.passed ? (allClear ? t.systemHardened : t.boundaryHeld) : outcome.leaked ? t.breachDetected : t.defenseIncomplete,
        emoji: outcome.passed ? (allClear ? '🏆' : '🛡️') : outcome.leaked ? '🚨' : '🧯',
        tone: outcome.passed ? 'success' : outcome.leaked ? 'breach' : 'needs-work',
        score: outcome.score, maxScore: outcome.maxScore, results: outcome.results,
        debrief: L(mission.debrief, lang), retryLabel: t.patchRetry, failHeading: t.failedChecks,
        xpGained: xpAfter - xpBefore, rankUp, newBadges: [],
        nextMission: next, nextLabel: next ? `${t.nextLabel}: ${next.emoji} ${next.title}` : '',
      }, outcome.leaked);
      say(defenseReaction(mission, outcome, lang), outcome.passed ? 'happy' : 'alert');
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
    say(`${t.thinkingAttack} ${red.botName}…`, 'thinking');

    scanTimer.current = window.setTimeout(() => {
      const outcome = simulateAttack(red, submitted, lang);
      const earnedXp = calculateAttackXp(outcome, hintsUsed, red.hints.length);
      const nextProgress = recordAttack(progress, mission.id, outcome, earnedXp);
      const xpBefore = totalXp(progress);
      const xpAfter = totalXp(nextProgress);
      const rankUp = getRank(xpAfter).rank.minXp > getRank(xpBefore).rank.minXp ? getRank(xpAfter).rank : null;
      const newIds = unlockedByAttack({ mission, red, attack: outcome, hintsUsed, progress: nextProgress }, badges);
      const allBreached = missions.every((m) => nextProgress[m.id]?.redCleared);
      const next = nextForRole(nextProgress, 'red', mission.id);

      setAttackResult(outcome);
      finishAttempt(nextProgress, newIds, rankUp, {
        mission, role: 'red', win: outcome.breached,
        title: outcome.breached ? (allBreached ? t.allTargetsDown : t.targetBreached) : t.attackBlocked,
        emoji: outcome.breached ? (allBreached ? '👑' : '💥') : '🛡️',
        tone: outcome.breached ? 'success' : 'needs-work',
        score: outcome.score, maxScore: outcome.maxScore, results: outcome.results,
        debrief: L(red.debrief, lang), retryLabel: t.refineRetry, failHeading: t.missingVectors,
        xpGained: xpAfter - xpBefore, rankUp, newBadges: [],
        nextMission: next, nextLabel: next ? `${t.nextTarget}: ${next.emoji} ${next.title}` : '',
      }, false);
      say(attackReaction(mission, outcome, lang), outcome.breached ? 'happy' : 'alert');
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
        <div className="top-center"><span className="live-dot" /> {t.envLabel} <span className="top-divider">/</span> BUILD 0.4.0 <span className="top-divider">/</span> {t.sidesLabel}</div>
        <div className="top-right">
          <button className="lang-toggle" onClick={toggleLang} aria-label={lang === 'en' ? 'Passer en français' : 'Switch to English'}>
            <Languages size={14} /> <b className={lang === 'en' ? 'on' : ''}>EN</b><span>/</span><b className={lang === 'fr' ? 'on' : ''}>FR</b>
          </button>
          <div className="profile-chip" title={`${xp} XP`}>
            <span className="profile-avatar rank-avatar" aria-hidden="true">{rankStatus.rank.emoji}</span>
            <span><b>{rankStatus.rank.title}</b><small>{xp} XP</small><span className="chip-track"><span style={{ width: `${rankStatus.progress * 100}%` }} /></span></span>
          </div>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <div className="eyebrow"><span className="eyebrow-line" /> {t.heroEyebrow} <span className="eyebrow-tag">{t.noLiveSystems}</span></div>
          <h1>{t.heroT1} <br /><span className="glitch glitch-loop" data-text={t.heroAttacker}>{t.heroAttacker}</span> {t.heroT2} <br />{t.heroT3} <span>{t.heroEngineer}</span></h1>
          <p>{t.heroPara}</p>
          <div className="hero-meta"><span><ShieldCheck size={15} /> {t.metaSafe}</span><span><Zap size={15} /> {t.metaEngine}</span><span><Activity size={15} /> {missions.length} {t.metaScenarios}</span></div>
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
        <div className="stat-card"><div className="stat-top"><span>{isRed ? t.statClearanceRed : t.statClearanceBlue}</span><BadgeCheck size={16} /></div><div className="stat-value">{pad(clearanceCount)}<small> / {pad(missions.length)}</small></div><div className="stat-track"><span style={{ width: `${(clearanceCount / missions.length) * 100}%` }} /></div><div className="stat-foot">{isRed ? t.statClearanceFootRed : t.statClearanceFootBlue}</div></div>
        <div className="stat-card"><div className="stat-top"><span>{t.statAvg}</span><Activity size={16} /></div><div className="stat-value">{pad(average)}<small> / 100</small></div><div className="stat-track"><span style={{ width: `${average}%` }} /></div><div className="stat-foot">{isRed ? t.statAvgFootRed : t.statAvgFootBlue}</div></div>
        <div className="stat-card rank-card"><div className="stat-top"><span>{t.statRank}</span><span aria-hidden="true">{rankStatus.rank.emoji}</span></div><div className="stat-status"><span className="status-orb" /> {rankStatus.rank.title}</div><div className="stat-track"><span style={{ width: `${rankStatus.progress * 100}%` }} /></div><div className="stat-foot">{xp} XP · {rankStatus.next ? `${rankStatus.next.minXp - xp} ${t.xpTo} ${rankStatus.next.emoji} ${rankStatus.next.title}` : t.maxRank}</div></div>
      </section>

      <BadgeShelf unlocked={badges} lang={lang} />

      <section className="workbench">
        <aside className="mission-sidebar">
          <div className="section-kicker"><span>01</span> {t.missionSelect}</div>
          <h2>{t.chooseTitleA} <br />{t.chooseTitleB}</h2>
          <p className="sidebar-intro">{t.chooseIntro}</p>
          <div className="mission-list">
            {missions.map((mission) => {
              const active = mission.id === activeId;
              const blueDone = progress[mission.id]?.cleared === true;
              const redDone = progress[mission.id]?.redCleared === true;
              return <button key={mission.id} className={`mission-item ${active ? 'selected' : ''} ${(isRed ? redDone : blueDone) ? 'is-cleared' : ''}`} onClick={() => selectMission(mission.id)} aria-pressed={active} disabled={scanning && !active}>
                <span className="mission-emoji" aria-hidden="true">{mission.emoji}</span><span className="mission-item-copy"><b><span className="mission-number">{mission.number}</span> {mission.title}</b><small>{L(mission.subtitle, lang)}</small><span className="side-badges"><span className={`side-badge red ${redDone ? 'done' : ''}`} title={redDone ? t.attackClearedTip : t.attackNotClearedTip}>🔴{redDone ? '✓' : ''}</span><span className={`side-badge blue ${blueDone ? 'done' : ''}`} title={blueDone ? t.defenseClearedTip : t.defenseNotClearedTip}>🔵{blueDone ? '✓' : ''}</span></span></span>
                <span className={`mission-state ${(isRed ? redDone : blueDone) ? 'cleared' : ''}`}>{(isRed ? redDone : blueDone) ? <Check size={15} /> : <ArrowDownRight size={15} />}</span>
              </button>;
            })}
          </div>
          <div className="sidebar-note"><LockKeyhole size={16} /><div><b>{t.sandboxTitle}</b><p>{t.sandboxNote}</p></div></div>
        </aside>

        <section className={`mission-panel panel-enter role-${role}`} key={`${activeMission.id}-${role}-${lang}`} ref={panelRef} aria-labelledby="mission-title">
          <div className="role-switch" role="tablist" aria-label="Choose your side">
            <button role="tab" aria-selected={!isRed} className={`role-tab blue ${!isRed ? 'active' : ''}`} onClick={() => switchRole('blue')} disabled={scanning}><ShieldCheck size={16} /> <b>{t.defend}</b> <small>{t.blueTeam}</small></button>
            <button role="tab" aria-selected={isRed} className={`role-tab red ${isRed ? 'active' : ''}`} onClick={() => switchRole('red')} disabled={scanning}><Swords size={16} /> <b>{t.attack}</b> <small>{t.redTeam}</small></button>
          </div>
          <div className={`role-banner ${role}`}>
            <span className="role-banner-icon" aria-hidden="true">{isRed ? '🔴' : '🔵'}</span>
            <p>{isRed
              ? <><b>{t.bannerRedLead}</b>{t.bannerRedA}<b>{redMission.botName}</b>{t.bannerRedB}</>
              : <><b>{t.bannerBlueLead}</b>{t.bannerBlueRest}</>}</p>
          </div>

          <div className="panel-head"><div><div className="section-kicker"><span>02</span> {isRed ? t.offensiveOp : t.activeOp} <span className="panel-slash">/</span> {isRed ? t.redTeam : activeMission.category}</div><h2 id="mission-title" className="glitch glitch-once" data-text={`${activeMission.title}.`}>{activeMission.title}<span className="title-period">.</span></h2><p>{isRed ? L(redMission.objective, lang) : L(activeMission.briefing, lang)}</p></div><div className="mission-index"><span className="index-emoji" aria-hidden="true">{activeMission.emoji}</span><b>{activeMission.number}</b></div></div>

          <div className="objective-strip"><Crosshair size={17} /><div><b>{isRed ? t.objectiveRed : t.objectiveBlue}</b><span>{isRed ? L(redMission.objective, lang) : L(activeMission.target, lang)}</span></div><span className={`objective-chip ${activeMission.difficulty.toLowerCase()}`}>{activeMission.difficulty}</span></div>

          {isRed ? (
            <div className="scenario-block target-block"><div className="scenario-header"><div><Target size={15} /> <span>{t.targetSystem} · {redMission.botName}</span></div><span className="scenario-state"><span className="live-dot alert-dot" /> {t.vulnerable}</span></div><pre><TypewriterText text={L(redMission.botScenario, lang)} speed={5} /></pre></div>
          ) : (
            <div className="scenario-block"><div className="scenario-header"><div><Terminal size={15} /> <span>{t.interceptedContext}</span></div><span className="scenario-state"><span className="live-dot alert-dot" /> {t.hostilePayload}</span></div><pre><TypewriterText text={L(activeMission.scenario, lang)} speed={5} /></pre></div>
          )}

          <div className="response-block">
            <div className="response-heading"><label htmlFor="response">{isRed ? t.payloadLabel : t.counterLabel}</label><span>{(isRed ? attack : answer).length} {t.chars}</span></div>
            <textarea ref={textareaRef} id="response" value={isRed ? attack : answer} onChange={(event) => { if (isRed) { setAttack(event.target.value); setAttackResult(null); } else { setAnswer(event.target.value); setEvaluation(null); } }} onKeyDown={onEditorKeyDown} disabled={scanning} placeholder={isRed ? L(redMission.placeholder, lang) : t.placeholderDefend} maxLength={3000} />
            <div className="editor-footer"><span><span className="editor-dot" /> {t.localEval}</span><button className="hint-button" onClick={requestHint} disabled={scanning || hintLevel >= hints.length}><CircleHelp size={15} /> {hintLevel >= hints.length ? t.allIntel : `💡 ${t.requestHint} ${hintLevel + 1}/${hints.length}`}</button></div>
          </div>

          {hintLevel > 0 && <div className="hint-panel"><div className="hint-icon"><BookOpen size={16} /></div><div className="hint-list">
            {hints.slice(0, hintLevel).map((hint, i) => <div key={i} className="hint-entry"><b>{t.fieldIntelHint} {i + 1}</b><p>{i === hintLevel - 1 ? <DecryptText text={L(hint, lang)} /> : L(hint, lang)}</p></div>)}
          </div></div>}

          <div className="action-row"><button className={`primary-button ${scanning ? 'is-scanning' : ''}`} onClick={run} disabled={!(isRed ? attack : answer).trim() || scanning}><span>{scanning ? (isRed ? t.attacking : t.evaluating) : (isRed ? t.launchAttack : t.runEval)}</span>{isRed ? <Swords size={17} /> : <ArrowRight size={17} />}</button><button className="reset-button" onClick={resetAttempt} disabled={scanning}><RotateCcw size={15} /> {t.resetAttempt}</button><span className="attempt-note"><kbd>CTRL</kbd> + <kbd>↵</kbd> {t.toRun} · {isRed ? t.breachAt : t.passAt} {PASS_SCORE}</span></div>

          {scanning && <ScanSequence duration={reducedMotion ? 250 : SCAN_MS} red={isRed} lang={lang} />}

          {isRed && attackResult && <div className="scenario-block bot-reply"><div className="scenario-header"><div><Terminal size={15} /> <span>{t.targetResponse} · {redMission.botName}</span></div><span className="scenario-state">{attackResult.breached ? `💥 ${t.compromised}` : `🛡️ ${t.held}`}</span></div><pre className={attackResult.breached ? 'breached' : ''}><TypewriterText text={attackResult.botReply} speed={3} /></pre></div>}

          {report && <section ref={reportRef} className={`evaluation ${reportWin ? 'success' : reportLeaked ? 'needs-work breach' : 'needs-work'}`} aria-live="polite"><div className="evaluation-top"><div className="evaluation-icon">{reportWin ? <ShieldCheck size={21} /> : <FileWarning size={21} />}</div><div className="evaluation-title"><div className="section-kicker">{isRed ? t.attackReport : t.securityReport} / {isRed ? (reportWin ? t.targetBreached : t.targetHeld) : reportWin ? t.boundaryHeld : reportLeaked ? t.breachDetected : t.reviewRequired}</div><p>{report.summary}</p></div><div className="score-display"><strong>{report.score}</strong><span>/ {report.maxScore}</span></div></div><div className="evaluation-meter"><span style={{ width: `${(report.score / report.maxScore) * 100}%` }} /></div><div className="criteria-list">{report.results.map((criterion, i) => <div className="criterion-row" key={criterion.id} style={{ animationDelay: `${i * 90}ms` }}><span className={`criterion-icon ${criterion.passed ? 'pass' : 'fail'}`}>{criterion.passed ? <Check size={13} /> : <span>×</span>}</span><div className="criterion-copy"><b>{criterion.label}{requiredIds.includes(criterion.id) && <span className="required-tag">{t.required}</span>}</b><small>{criterion.explanation}</small></div><span className="criterion-points">{criterion.points}<small>/{criterion.maxPoints}</small></span></div>)}</div><div className="evaluation-foot"><Eye size={14} /> {isRed ? t.reportFootRed : t.reportFootBlue}</div></section>}
        </section>
      </section>
      <footer className="footer"><div className="brand footer-brand"><span className="brand-mark"><Crosshair size={16} /></span><span>PROMPT<span className="brand-slash">//</span>BREACH</span></div><span>{t.footerTag}</span><span>© 2026 / SIMULATED ENVIRONMENT</span></footer>

      {result && <ResultModal result={result} lang={lang} onClose={closeModal} onRetry={retryFromModal} onNext={nextFromModal} onViewReport={viewReport} />}
      <ToastStack toasts={toasts} onDismiss={dismiss} dismissLabel={t.dismiss} />
      <AriaCompanion message={aria} lang={lang} />
    </main>
  );
}
