import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Webplatform for Unreal Engine',
  description: 'Translate natural language to Unreal Engine commands',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
} 