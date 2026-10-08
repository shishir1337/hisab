'use client'

import { authFormReducer, initialAuthForm, OTP_LENGTH, safeNextPath } from '@hisab/core'
import { ArrowLeft, Loader2, Mail } from 'lucide-react'
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
  const linkFailed = useSearchParams().get('error') === 'link'

  // Side effects driven by the reducer's status.
  useEffect(() => {
    if (state.status === 'sending') {
      getSupabase()
        .auth.signInWithOtp({
          email: state.email,
          // If the email contains a link instead of a code, the link finishes sign-in here.
          options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(safeNextPath(next))}` : ''}` },
        })
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
  }, [state.status, state.email, state.code, next])

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

  const [googleBusy, setGoogleBusy] = useState(false)
  const signInWithGoogle = async () => {
    setGoogleBusy(true)
    const { error } = await getSupabase().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(safeNextPath(next))}` : ''}` },
    })
    // On success the browser is already navigating to Google.
    if (error) {
      setGoogleBusy(false)
      dispatch({ type: 'sendFailed', error: 'Couldn’t reach Google. Please try again.' })
    }
  }

  if (state.step === 'email') {
    return (
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault()
          dispatch({ type: 'submitEmail' })
        }}
      >
        <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Sign in to Hisab</h1>
        <p className="mt-1 text-[14px] text-text-muted">New here? The same step creates your account.</p>
        <Button type="button" variant="outline" size="lg" className="mt-6 w-full" disabled={googleBusy} onClick={() => void signInWithGoogle()}>
          {googleBusy ? <Loader2 className="animate-spin" /> : <GoogleMark />}
          Continue with Google
        </Button>
        <div className="my-5 flex items-center gap-3 text-[12px] text-text-faint" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>
        <label htmlFor="email" className="mb-1.5 block text-[12.5px] font-medium text-text-muted">
          Email
        </label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={state.email}
          disabled={state.status !== 'idle'}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? 'email-error' : undefined}
          onChange={(e) => dispatch({ type: 'setEmail', email: e.target.value })}
        />
        <FieldError id="email-error" message={state.error ?? (linkFailed ? 'That sign-in link expired or was already used. Send a new one.' : null)} />
        <Button type="submit" size="lg" className="mt-2 w-full" disabled={state.status !== 'idle'}>
          {state.status === 'sending' ? <Loader2 className="animate-spin" /> : 'Continue with email'}
        </Button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[12.5px] text-text-faint">
          <Mail className="size-3.5" aria-hidden /> We&rsquo;ll email you a 6-digit code. No password.
        </p>
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
        className="-ml-1 mb-5 inline-flex items-center gap-1.5 rounded-[6px] text-[13px] text-text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="size-4" /> Use a different email
      </button>
      <h1 className="text-[22px] font-semibold tracking-[-0.02em]">Check your email</h1>
      <p className="mt-1 text-[14px] leading-[21px] text-text-muted">
        Enter the code we sent to <span className="font-medium text-text">{state.email}</span>, or open the link in that
        email on this device.
      </p>

      <div className="relative mt-6" onClick={() => codeRef.current?.focus()}>
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
                  'num grid h-13 place-items-center rounded-[12px] border bg-surface text-[22px] font-semibold transition-[border-color,box-shadow] duration-150',
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

      <Button type="submit" size="lg" className="mt-2 w-full" disabled={state.status !== 'idle'}>
        {state.status === 'verifying' ? <Loader2 className="animate-spin" /> : 'Verify'}
      </Button>
      <div className="mt-4 text-center text-[13px] text-text-muted">
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

/** Google's "G" mark, as Google's sign-in branding guidelines require on the button. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="size-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  )
}
