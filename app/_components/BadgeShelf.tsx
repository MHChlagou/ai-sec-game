import { achievements } from '@/lib/progression';
import { L, ui, type Lang } from '@/lib/i18n';

export function BadgeShelf({ unlocked, lang }: { unlocked: string[]; lang: Lang }) {
  return (
    <section className="badge-shelf" aria-label={ui[lang].badges}>
      <div className="section-kicker"><span>★</span> {ui[lang].badges} <span className="badge-count">{unlocked.length}/{achievements.length}</span></div>
      <ul>
        {achievements.map((achievement) => {
          const earned = unlocked.includes(achievement.id);
          const description = L(achievement.description, lang);
          return (
            <li key={achievement.id} className={earned ? 'unlocked' : 'locked'} title={`${achievement.title}: ${description}`}>
              <span className="badge-emoji" aria-hidden="true">{earned ? achievement.emoji : '🔒'}</span>
              <span className="badge-copy"><b>{achievement.title}</b><small>{description}</small></span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
