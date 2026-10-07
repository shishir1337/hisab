import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <span aria-hidden className="grid size-9 place-items-center rounded-[11px] bg-brand text-[15px] font-bold text-brand-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12)]">
            H
          </span>
          <span className="text-[18px] font-semibold tracking-[-0.02em]">Hisab</span>
        </div>
        <div className="rounded-sheet border border-border bg-surface p-6 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_16px_40px_-20px_rgb(0_0_0/0.18)] sm:p-8">
          <Suspense>
            <SignInForm />
          </Suspense>
        </div>
        <p className="mt-6 text-center text-[12.5px] text-text-faint">Know where your money goes — without the month-end struggle.</p>
      </div>
    </main>
  )
}
