import type { Metadata } from 'next'
export const metadata: Metadata = {
  title: 'TradeCafe BD Agent',
  description: 'B2B Cold Email System — tradecafe.ai',
  icons: {
    icon: [
      { url: '/favicon.svg', type: 'image/svg+xml' },
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon-32.png', type: 'image/png', sizes: '32x32' },
    ],
    apple: [{ url: '/icon-192.png', sizes: '192x192' }],
  },
}
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Geist:wght@100..900&family=Inter:wght@100..900&family=JetBrains+Mono:wght@100..800&display=swap" rel="stylesheet" />
      </head>
      <body style={{margin:0, background:'#0a0a0f', color:'#e2e4e9', fontFamily:"'Inter',sans-serif"}}>{children}</body>
    </html>
  )
}
