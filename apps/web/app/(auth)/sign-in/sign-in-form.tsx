'use client'

import { authFormReducer, initialAuthForm, OTP_LENGTH, safeNextPath } from '@hisab/core'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useReducer, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/** Supabase's hosted default allows one code email per address per 60 s. */
const RESEND_SECONDS = 60

export function SignInForm() {
  const [state, dispatch] = useReducer(authFormReducer, initialAuthForm)
  const [cooldown, setCooldown] = useState(0)
  const router = useRouter()
  const next = useSearchParams().get('next')
  const codeRef = useRef<HTMLInputElement>(null)

  // Side effects driven by the reducer's status.
  useEffect(() => {
    if (state.status === 'sending') {
      getSupabase()
        .auth.signInWithOtp({ email: state.email, options: { shouldCreateUser: true } })
        .then(({ error }) => {
          if (error) dispatch({ type: 'sendFailed', error: friendlyError(error.message) })
          else {
            dispatch({ type: 'sent' })
            setCooldown(RESEND_SECONDS)
          }
        })
    }
    if (state.status === 'verifying') {
      getSupabase()
        .auth.verifyOtp({ email: state.email, token: state.code, type: 'email' })
        .then(({ error }) => {
          if (error) dispatch({ type: 'verifyFailed', error: friendlyError(error.message) })
          else dispatch({ type: 'verified' })
        })
    }
  }, [state.status, state.email, state.code])

  useEffect(() => {
    if (state.step === 'done') {
      router.replace(safeNextPath(next))
      router.refresh()
    }
  }, [state.step, next, router])

  // Inputs are disabled while a request is in flight; give focus back when it finishes.
  useEffect(() => {
    if (state.step === 'code' && state.status === 'idle') codeRef.current?.focus()
  }, [state.step, state.status])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // Auto-submit once the full code is typed or pasted.
  useEffect(() => {
    if (state.step === 'code' && state.code.length === OTP_LENGTH && state.status === 'idle' && !state.error) {
      dispatch({ type: 'submitCode' })
    }
  }, [state.code, state.step, state.status, state.error])

  if (state.step === 'email') {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          dispatch({ type: 'submitEmail' })
        }}
      >
        <h1 className="text-[26px] font-semibold tracking-tight">Welcome</h1>
        <p className="mt-1.5 text-[15px] text-text-muted">Sign in or create an account with your email.</p>
        <label htmlFor="email" className="mt-8 mb-2 block text-[13px] font-medium text-text-muted">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          autoFocus
          placeholder="you@example.com"
          value={state.email}
          disabled={state.status !== 'idle'}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? 'email-error' : undefined}
          onChange={(e) => dispatch({ type: 'setEmail', email: e.target.value })}
        />
        <FieldError id="email-error" message={state.error} />
        <Button type="submit" size="lg" className="mt-6 w-full" disabled={state.status !== 'idle'}>
          {state.status === 'sending' ? <Loader2 className="animate-spin" /> : 'Continue'}
        </Button>
        <p className="mt-6 text-center text-[12.5px] text-text-faint">We&rsquo;ll email you a 6-digit code. No password needed.</p>
      </form>
    )
  }

  return (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault()
        dispatch({ type: 'submitCode' })
      }}
    >
      <button
        type="button"
        onClick={() => dispatch({ type: 'back' })}
        className="-ml-1 mb-6 inline-flex items-center gap-1.5 text-[13px] text-text-muted hover:text-text"
      >
        <ArrowLeft className="size-4" /> Use a different email
      </button>
      <h1 className="text-[26px] font-semibold tracking-tight">Check your email</h1>
      <p className="mt-1.5 text-[15px] text-text-muted">
        Enter the code we sent to <span className="font-medium text-text">{state.email}</span>
      </p>

      <div className="relative mt-8" onClick={() => codeRef.current?.focus()}>
        <input
          ref={codeRef}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="6-digit code"
          aria-invalid={Boolean(state.error)}
          value={state.code}
          disabled={state.status !== 'idle'}
          maxLength={OTP_LENGTH}
          onChange={(e) => dispatch({ type: 'setCode', code: e.target.value })}
          className="absolute inset-0 z-10 h-full w-full cursor-text opacity-0"
        />
        <div className="grid grid-cols-6 gap-2" aria-hidden>
          {Array.from({ length: OTP_LENGTH }, (_, i) => {
            const char = state.code[i]
            const active = i === Math.min(state.code.length, OTP_LENGTH - 1)
            return (
              <div
                key={i}
                className={cn(
                  'num grid h-14 place-items-center rounded-[14px] border bg-surface text-[22px] font-semibold transition-[border,box-shadow] duration-150',
                  state.error ? 'border-danger' : active ? 'border-text-faint ring-4 ring-brand/[0.06]' : 'border-border',
                )}
              >
                {char ?? ''}
              </div>
            )
          })}
        </div>
      </div>
      <FieldError id="code-error" message={state.error} />

      <Button type="submit" size="lg" className="mt-6 w-full" disabled={state.status !== 'idle'}>
        {state.status === 'verifying' ? <Loader2 className="animate-spin" /> : 'Verify'}
      </Button>
      <div className="mt-5 text-center text-[13px] text-text-muted">
        {cooldown > 0 ? (
          <span className="num">Resend code in {cooldown}s</span>
        ) : (
          <button
            type="button"
            className="font-medium text-text hover:underline"
            onClick={() => dispatch({ type: 'resend' })}
          >
            Resend code
          </button>
        )}
      </div>
    </form>
  )
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  return (
    <p id={id} role="alert" className={cn('mt-2 min-h-5 text-[13px] text-danger', !message && 'invisible')}>
      {message ?? ' '}
    </p>
  )
}

function friendlyError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('expired') || m.includes('invalid')) return 'That code is wrong or has expired. Try again or resend.'
  if (m.includes('rate') || m.includes('security purposes')) return 'Too many attempts. Please wait a minute and try again.'
  if (m.includes('fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection.'
  return message
}
