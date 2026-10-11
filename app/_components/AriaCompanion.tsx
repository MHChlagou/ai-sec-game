'use client';

import { useEffect, useState } from 'react';
import { ui, type Lang } from '@/lib/i18n';
import { TypewriterText } from './TextEffects';

export type AriaMood = 'idle' | 'happy' | 'alert' | 'thinking';
export type AriaMessage = { id: number; text: string; mood: AriaMood };

const FACES: Record<AriaMood, string> = { idle: '🤖', happy: '😎', alert: '🚨', thinking: '🧐' };

/**
 * ARIA, the scripted sidekick. Not a model: every line is canned and chosen from the evaluation,
 * which keeps the README's "no API key, deterministic" promise.
 */
export function AriaCompanion({ message, lang }: { message: AriaMessage; lang: Lang }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    setOpen(true);
    if (message.mood === 'thinking') return;
    const timer = window.setTimeout(() => setOpen(false), 12_000);
    return () => window.clearTimeout(timer);
  }, [message.id, message.mood]);

  return (
    <div className={`aria ${message.mood}`}>
      {open && (
        <div className="aria-bubble" role="status" aria-live="polite" key={message.id}>
          <div className="aria-name">ARIA <span>// {ui[lang].ariaName}</span></div>
          <p>
            {message.mood === 'thinking'
              ? <><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span><span className="sr-only">{message.text}</span></>
              : <TypewriterText text={message.text} speed={2} />}
          </p>
        </div>
      )}
      <button className="aria-avatar" onClick={() => setOpen((value) => !value)} aria-label={open ? 'Hide ARIA' : 'Show ARIA'} aria-expanded={open}>
        <span aria-hidden="true">{FACES[message.mood]}</span>
        <span className="aria-pulse" aria-hidden="true" />
      </button>
    </div>
  );
}
