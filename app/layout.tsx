import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const siteUrl = 'https://tailing-future.tony070926.workers.dev';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Tailing Future — 材料世界模型实验室',
    template: '%s · Tailing Future',
  },
  description: '从微观粒子到工业流程，构建可验证、可耦合的材料与化工世界模型。',
  openGraph: {
    title: 'Tailing Future — Materials World Model Lab',
    description: '从微观粒子到工业流程，构建可验证、可耦合的材料与化工世界模型。',
    url: '/',
    siteName: 'Tailing Future',
    type: 'website',
    images: [{ url: '/og.png', width: 1672, height: 941, alt: 'Tailing Future multi-scale materials world model' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Tailing Future — Materials World Model Lab',
    description: 'A verifiable, multi-scale materials and chemical-engineering world-model lab.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
