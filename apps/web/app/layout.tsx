import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { tokens } from '@hisab/tokens'
import { ThemeProvider } from '@/components/theme-provider'
import { ThemeTokens } from '@/components/theme-tokens'
import { Toaster } from '@/components/ui/toaster'
import { LaunchIntro } from '@/components/pwa/launch-intro'
import { PwaClient } from '@/components/pwa/pwa-client'
import { LAUNCH_SCREENS, launchImageMedia, launchImagePath } from '@/lib/launch-screens'
import './globals.css'

const inter = Inter({ variable: '--font-inter', subsets: ['latin'] })

export const metadata: Metadata = {
  title: { default: 'Hisab', template: '%s · Hisab' },
  description: 'Know where your money goes — without the month-end struggle.',
  applicationName: 'Hisab',
  // A private app: nothing is indexed (the sign-in page opts back in).
  robots: { index: false, follow: false },
  formatDetection: { telephone: false, email: false, address: false, date: false },
  // Next emits the standard `mobile-web-app-capable`; iOS before 17.4 only reads the Apple-prefixed one.
  other: { 'apple-mobile-web-app-capable': 'yes' },
  appleWebApp: {
    capable: true,
    title: 'Hisab',
    // `default`: iOS draws the status bar itself with dark text in light mode and light text in dark mode.
    // (`black-translucent` always draws white text, which disappears on the light page.)
    statusBarStyle: 'default',
    startupImage: LAUNCH_SCREENS.flatMap((s) => (['light', 'dark'] as const).map((scheme) => ({ url: launchImagePath(s, scheme), media: launchImageMedia(s, scheme) }))),
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Draw under the notch / home indicator; the shell pads itself with env(safe-area-inset-*).
  viewportFit: 'cover',
  // Android: the keyboard shrinks the layout viewport, so bottom sheets and their Save stay above it.
  interactiveWidget: 'resizes-content',
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
        <LaunchIntro />
        <ThemeProvider>
          {children}
          <Toaster />
          <PwaClient />
        </ThemeProvider>
      </body>
    </html>
  )
}
