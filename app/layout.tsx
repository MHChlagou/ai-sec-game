import type { Metadata } from 'next';
import './globals.css';
import './effects.css';

export const metadata: Metadata = {
  title: 'PROMPT//BREACH — AI Security Training',
  description: 'A cyberpunk prompt-injection training simulator. Learn to spot and resist adversarial instructions.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
