import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { messages } from '@/ui/messages/es-PE';

import { inter, spaceGrotesk } from './fonts';
import './globals.css';

export const metadata: Metadata = {
  title: messages.app.title,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-PE" className={`${inter.variable} ${spaceGrotesk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
