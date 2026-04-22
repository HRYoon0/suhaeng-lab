import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '수행Lab · 수행평가 만들기',
  description: '선생님이 만드는 나만의 수행평가 실험실',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Jua&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
