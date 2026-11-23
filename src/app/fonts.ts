// Fuentes de docs/ui/design-tokens.md: Space Grotesk para títulos y cifras, Inter para texto.
import { Inter, Space_Grotesk } from 'next/font/google';

export const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  display: 'swap',
  weight: ['600', '700'],
  variable: '--font-space-grotesk',
});
