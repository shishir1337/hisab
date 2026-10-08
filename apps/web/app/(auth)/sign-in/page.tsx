import type { Metadata } from 'next'
import { Suspense } from 'react'
import { BrandMark, BrandPanel } from './brand-panel'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = { title: 'Sign in', robots: { index: true, follow: false } }

export default function SignInPage() {
  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
      <BrandPanel />

      <section className="flex min-h-dvh flex-col px-4 pt-[max(env(safe-area-inset-top),20px)] pb-6 sm:px-6 lg:px-10">
        {/* Phone/tablet: the brand and promise sit above the card (the ink panel is desktop-only). */}
        <header className="si-rise mx-auto w-full max-w-[420px] pt-4 sm:pt-10 lg:hidden">
          <BrandMark />
          <p className="mt-7 text-[26px] leading-[1.15] font-semibold tracking-[-0.03em] text-balance">
            Know where your money goes <span className="text-text-faint">— without the month-end struggle.</span>
          </p>
        </header>

        <div className="flex flex-1 flex-col justify-center py-7 lg:py-10">
          <div className="si-card-in mx-auto w-full max-w-[420px] rounded-[24px] border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_48px_-28px_rgb(0_0_0/0.22)] sm:p-8 dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.04),0_24px_48px_-24px_rgb(0_0_0/0.8)]">
            <Suspense>
              <SignInForm />
            </Suspense>
          </div>
          <p className="mx-auto mt-6 max-w-[360px] text-center text-[12px] leading-[18px] text-text-faint">
            By continuing you agree to the <span className="font-medium text-text-muted">Terms</span> and{' '}
            <span className="font-medium text-text-muted">Privacy Policy</span>.
          </p>
        </div>
      </section>
    </main>
  )
}
