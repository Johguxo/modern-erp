import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { messages } from '@/ui/messages/es-PE';

export const metadata: Metadata = {
  title: messages.app.title,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-PE">
      <body>{children}</body>
    </html>
  );
}
