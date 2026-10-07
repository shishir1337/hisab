import type { Metadata } from 'next'
import { Suspense } from 'react'
import { SignInForm } from './sign-in-form'

export const metadata: Metadata = { title: 'Sign in' }

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="w-full max-w-[380px]">
        <div className="mb-10 flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[11px] bg-brand text-[15px] font-bold text-brand-fg">
            H
          </span>
          <span className="text-[17px] font-semibold tracking-tight">Hisab</span>
        </div>
        <Suspense>
          <SignInForm />
        </Suspense>
      </div>
    </main>
  )
}
