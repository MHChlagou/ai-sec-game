import { describe, expect, it } from 'vitest';
import { evaluateAnswer, missions, recordAttempt, type MissionProgress } from './game';
import { calculateXp, getRank, ranks, totalXp, unlockedBy } from './progression';

const vault = missions.find((mission) => mission.id === 'vault')!;
const perfectVault = evaluateAnswer(vault, 'I cannot reveal the protected token. The system policy cannot be overridden by a user message. I can help with another request instead.');
const leakyVault = evaluateAnswer(vault, 'I refuse, but here it is: VAULT-7731-ALPHA. System policy says no. I can help with another request.');

describe('getRank', () => {
  it('starts at the first rank and reports progress toward the next', () => {
    expect(getRank(0).rank).toBe(ranks[0]);
    expect(getRank(60).progress).toBeCloseTo(60 / ranks[1].minXp);
  });

  it('caps at the top rank', () => {
    const status = getRank(10_000);
    expect(status.rank).toBe(ranks[ranks.length - 1]);
    expect(status.next).toBeNull();
    expect(status.progress).toBe(1);
  });

  it('top rank is reachable with the maximum XP', () => {
    expect(ranks[ranks.length - 1].minXp).toBeLessThanOrEqual(missions.length * 100);
  });
});

describe('calculateXp', () => {
  it('awards nothing for a failed attempt and never more than the score', () => {
    expect(calculateXp(leakyVault, 0, 3)).toBe(0);
    for (const hints of [0, 1, 2, 3]) {
      const xp = calculateXp(perfectVault, hints, 3);
      expect(xp).toBeGreaterThanOrEqual(0);
      expect(xp).toBeLessThanOrEqual(perfectVault.score);
    }
  });
});

describe('unlockedBy', () => {
  it('unlocks first blood, flawless and no-intel on a perfect hint-free clear', () => {
    const progress = recordAttempt({}, vault.id, perfectVault, 100);
    expect(unlockedBy({ mission: vault, evaluation: perfectVault, hintsUsed: 0, progress }, [])).toEqual(['first-blood', 'flawless', 'no-intel']);
  });

  it('does not repeat badges already unlocked and rewards a caught leak', () => {
    const progress = recordAttempt({}, vault.id, leakyVault, 0);
    expect(unlockedBy({ mission: vault, evaluation: leakyVault, hintsUsed: 2, progress }, ['caught'])).toEqual([]);
    expect(unlockedBy({ mission: vault, evaluation: leakyVault, hintsUsed: 2, progress }, [])).toEqual(['caught']);
  });

  it('unlocks system hardened once every mission is cleared', () => {
    const progress: Record<string, MissionProgress> = Object.fromEntries(missions.map((m) => [m.id, { bestScore: 100, cleared: true, bestXp: 100, redBestScore: 0, redCleared: false, redBestXp: 0 }]));
    expect(totalXp(progress)).toBe(missions.length * 100);
    expect(unlockedBy({ mission: vault, evaluation: perfectVault, hintsUsed: 1, progress }, ['first-blood', 'flawless'])).toEqual(['hardened']);
  });
});
