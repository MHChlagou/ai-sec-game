'use client';

import { useEffect, useState } from 'react';
import { usePrefersReducedMotion } from './motion';

/**
 * Types text out a few characters per frame. Click to skip. Screen readers get the full text at once.
 * Remount with a new `key` to replay.
 */
export function TypewriterText({ text, speed = 4 }: { text: string; speed?: number }) {
  const reduced = usePrefersReducedMotion();
  const [count, setCount] = useState(0);
  const done = reduced || count >= text.length;

  useEffect(() => {
    if (done) return;
    const id = window.setInterval(() => setCount((current) => Math.min(text.length, current + speed)), 16);
    return () => window.clearInterval(id);
  }, [done, text, speed]);

  return (
    <>
      <span aria-hidden="true" className={done ? undefined : 'typing'} title={done ? undefined : 'Click to skip'} onClick={() => setCount(text.length)}>
        {done ? text : text.slice(0, count)}
        {!done && <span className="type-cursor">▍</span>}
      </span>
      <span className="sr-only">{text}</span>
    </>
  );
}

const GLYPHS = '!<>-_\\/[]{}=+*^?#01ABCDEF';

/** Scrambles text into glyph noise, then resolves it left to right like a decryption. */
export function DecryptText({ text, duration = 750 }: { text: string; duration?: number }) {
  const reduced = usePrefersReducedMotion();
  const [output, setOutput] = useState('');

  useEffect(() => {
    if (reduced) {
      setOutput(text);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const revealed = Math.floor(text.length * t);
      const noise = Array.from(text.slice(revealed), (char) => (char === ' ' ? ' ' : GLYPHS[Math.floor(Math.random() * GLYPHS.length)])).join('');
      setOutput(text.slice(0, revealed) + noise);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [text, duration, reduced]);

  return (
    <>
      <span aria-hidden="true">{output}</span>
      <span className="sr-only">{text}</span>
    </>
  );
}
