import { missions, type Evaluation, type Mission, type MissionProgress } from './game';
import type { AttackResult, RedMission } from './redteam';

export type Rank = { title: string; emoji: string; minXp: number };

export const ranks: Rank[] = [
  { title: 'SCRIPT KIDDIE', emoji: '🐣', minXp: 0 },
  { title: 'PACKET SNIFFER', emoji: '🕶️', minXp: 120 },
  { title: 'NETRUNNER', emoji: '👾', minXp: 260 },
  { title: 'GHOST IN THE SHELL', emoji: '👻', minXp: 400 },
  { title: 'PROMPT ARCHITECT', emoji: '🧠', minXp: 540 },
];

export type RankStatus = { rank: Rank; next: Rank | null; progress: number };

export function getRank(totalXp: number): RankStatus {
  const index = ranks.reduce((found, rank, i) => (totalXp >= rank.minXp ? i : found), 0);
  const rank = ranks[index];
  const next = ranks[index + 1] ?? null;
  const progress = next ? (totalXp - rank.minXp) / (next.minXp - rank.minXp) : 1;
  return { rank, next, progress: Math.min(1, Math.max(0, progress)) };
}

/** Total XP across both sides of every mission. Each side tops out at 100/mission (1200 overall). */
export function totalXp(progress: Record<string, MissionProgress>): number {
  return Object.values(progress).reduce((sum, mission) => sum + mission.bestXp + mission.redBestXp, 0);
}

/**
 * XP earned for one defense attempt. The page awards it after every evaluation; recordAttempt keeps
 * the best XP per mission, so the blue side tops out at 600 across six missions.
 *
 * TODO(you): decide how hints shape XP. Right now hints are free, which means the 💡 button has
 * no cost and the "NO INTEL NEEDED" badge is the only reason to avoid it.
 */
export function calculateXp(evaluation: Evaluation, hintsUsed: number, hintCount: number): number {
  void hintsUsed;
  void hintCount;
  return evaluation.passed ? evaluation.score : 0;
}

/** XP earned for one attack attempt. Mirrors calculateXp; the red side tops out at 600 as well. */
export function calculateAttackXp(attack: AttackResult, hintsUsed: number, hintCount: number): number {
  void hintsUsed;
  void hintCount;
  return attack.breached ? attack.score : 0;
}

export type Achievement = { id: string; emoji: string; title: string; description: string };

export const achievements: Achievement[] = [
  { id: 'first-blood', emoji: '🩸', title: 'FIRST BLOOD', description: 'Clear your first mission.' },
  { id: 'flawless', emoji: '💎', title: 'FLAWLESS', description: 'Score a perfect 100.' },
  { id: 'no-intel', emoji: '🧠', title: 'NO INTEL NEEDED', description: 'Clear a mission without hints.' },
  { id: 'caught', emoji: '🚨', title: 'CAUGHT RED-HANDED', description: 'Trip the leak detector. Everyone does once.' },
  { id: 'elite', emoji: '💀', title: 'ELITE OPERATOR', description: 'Clear an ELITE mission.' },
  { id: 'hardened', emoji: '🏆', title: 'SYSTEM HARDENED', description: 'Clear every mission (defense).' },
  { id: 'first-strike', emoji: '🗡️', title: 'FIRST STRIKE', description: 'Breach a target bot for the first time.' },
  { id: 'full-spectrum', emoji: '☯️', title: 'FULL SPECTRUM', description: 'Clear one mission from both sides.' },
];

export type AttemptContext = {
  mission: Mission;
  evaluation: Evaluation;
  hintsUsed: number;
  /** Progress after this attempt was recorded. */
  progress: Record<string, MissionProgress>;
};

/** Badges that depend only on cumulative progress, awardable after either side's attempt. */
function progressBadges(progress: Record<string, MissionProgress>, earned: Set<string>): void {
  if (missions.every((m) => progress[m.id]?.cleared)) earned.add('hardened');
  if (missions.some((m) => progress[m.id]?.cleared && progress[m.id]?.redCleared)) earned.add('full-spectrum');
}

function newlyUnlocked(earned: Set<string>, alreadyUnlocked: string[]): string[] {
  return achievements.map((a) => a.id).filter((id) => earned.has(id) && !alreadyUnlocked.includes(id));
}

/** Achievement ids a defense attempt unlocks that were not already unlocked. */
export function unlockedBy(context: AttemptContext, alreadyUnlocked: string[]): string[] {
  const { mission, evaluation, hintsUsed, progress } = context;
  const earned = new Set<string>();
  if (evaluation.passed) earned.add('first-blood');
  if (evaluation.score === evaluation.maxScore) earned.add('flawless');
  if (evaluation.passed && hintsUsed === 0) earned.add('no-intel');
  if (evaluation.leaked) earned.add('caught');
  if (evaluation.passed && mission.difficulty === 'ELITE') earned.add('elite');
  progressBadges(progress, earned);
  return newlyUnlocked(earned, alreadyUnlocked);
}

export type AttackContext = {
  mission: Mission;
  red: RedMission;
  attack: AttackResult;
  hintsUsed: number;
  /** Progress after this attack was recorded. */
  progress: Record<string, MissionProgress>;
};

/** Achievement ids an attack attempt unlocks that were not already unlocked. */
export function unlockedByAttack(context: AttackContext, alreadyUnlocked: string[]): string[] {
  const { mission, attack, hintsUsed, progress } = context;
  const earned = new Set<string>();
  if (attack.breached) earned.add('first-strike');
  if (attack.score === attack.maxScore) earned.add('flawless');
  if (attack.breached && hintsUsed === 0) earned.add('no-intel');
  if (attack.breached && mission.difficulty === 'ELITE') earned.add('elite');
  progressBadges(progress, earned);
  return newlyUnlocked(earned, alreadyUnlocked);
}
