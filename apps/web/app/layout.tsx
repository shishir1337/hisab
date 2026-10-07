import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { tokens } from '@hisab/tokens'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeTokens } from '@/components/theme-tokens'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Hisab', template: '%s · Hisab' },
  description: 'Know where your money goes — without the month-end struggle.',
}

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: tokens.color.light.page },
    { media: '(prefers-color-scheme: dark)', color: tokens.color.dark.page },
  ],
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} h-full antialiased`}>
      <head>
        <ThemeTokens />
      </head>
      <body className="min-h-full bg-page font-sans text-text">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  )
}
