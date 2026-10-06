import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import type { ReactNode } from 'react'
import './globals.css'

// Self-hosted at build time: no request to Google from the browser
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })

export const metadata: Metadata = {
  title: { default: 'License Manager', template: '%s · License Manager' },
}

// Applies the saved (or system) theme before first paint; keep in sync with src/lib/theme.ts
const themeScript = `try{var t=localStorage.getItem('lm_theme');if(t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches)document.documentElement.classList.add('dark')}catch(e){}`

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-gray-50 dark:bg-surface-0 dark:text-ink min-h-screen">{children}</body>
    </html>
  )
}
