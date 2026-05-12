import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { QueryProvider } from '@/components/providers/query-provider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: 'Inboudly — AI-native social media intelligence',
  description:
    'Create, schedule, and optimize content across Instagram, TikTok, RedNote and more. Powered by Claude, GPT Image, and proprietary engagement prediction.',
  metadataBase: new URL('https://inboudly.com'),
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <QueryProvider>
          {children}
          <Toaster richColors position="top-right" />
        </QueryProvider>
      </body>
    </html>
  );
}
