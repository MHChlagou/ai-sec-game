import { achievements } from '@/lib/progression';

export function BadgeShelf({ unlocked }: { unlocked: string[] }) {
  return (
    <section className="badge-shelf" aria-label="Badges">
      <div className="section-kicker"><span>★</span> BADGES <span className="badge-count">{unlocked.length}/{achievements.length}</span></div>
      <ul>
        {achievements.map((achievement) => {
          const earned = unlocked.includes(achievement.id);
          return (
            <li key={achievement.id} className={earned ? 'unlocked' : 'locked'} title={`${achievement.title}: ${achievement.description}`}>
              <span className="badge-emoji" aria-hidden="true">{earned ? achievement.emoji : '🔒'}</span>
              <span className="badge-copy"><b>{achievement.title}</b><small>{achievement.description}</small></span>
              <span className="sr-only">{earned ? 'Unlocked' : 'Locked'}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
