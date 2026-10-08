'use client'

import { authFormReducer, initialAuthForm, OTP_LENGTH, safeNextPath } from '@hisab/core'
import { ArrowLeft, ArrowRight, Check, Loader2, Mail, MailCheck, TriangleAlert } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useReducer, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { shake } from '@/lib/motion'
import { getSupabase } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

/** Supabase's hosted default allows one code email per address per 60 s. */
const RESEND_SECONDS = 60

export function SignInForm() {
  const [state, dispatch] = useReducer(authFormReducer, initialAuthForm)
  const [cooldown, setCooldown] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next')
  const linkFailed = params.get('error') === 'link'
  const codeRef = useRef<HTMLInputElement>(null)
  const boxesRef = useRef<HTMLDivElement>(null)
  const [codeFocused, setCodeFocused] = useState(false)

  // Animate the step change (not the first paint: the card has its own entrance).
  const [shownStep, setShownStep] = useState(state.step)
  const [stepAnim, setStepAnim] = useState<'' | 'si-step-in' | 'si-step-back'>('')
  if (shownStep !== state.step) {
    setShownStep(state.step)
    setStepAnim(state.step === 'email' ? 'si-step-back' : 'si-step-in')
  }

  // Side effects driven by the reducer's status.
  useEffect(() => {
    if (state.status === 'sending') {
      const resending = state.step === 'code'
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
            if (resending) setNotice('New code sent. Check your inbox.')
          }
        })
    }
    if (state.status === 'verifying') {
      getSupabase()
        .auth.verifyOtp({ email: state.email, token: state.code, type: 'email' })
        .then(({ error }) => {
          if (error) {
            dispatch({ type: 'verifyFailed', error: friendlyError(error.message) })
            shake(boxesRef.current)
          } else dispatch({ type: 'verified' })
        })
    }
  }, [state.status, state.step, state.email, state.code, next])

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

  // Back from the code step: put the caret in the email field so it can be fixed straight away.
  useEffect(() => {
    if (state.step === 'email' && stepAnim === 'si-step-back') document.getElementById('email')?.focus()
  }, [state.step, stepAnim])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  useEffect(() => {
    if (!notice) return
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

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
    const busy = state.status !== 'idle'
    return (
      <form
        key="email"
        noValidate
        className={stepAnim}
        onSubmit={(e) => {
          e.preventDefault()
          dispatch({ type: 'submitEmail' })
        }}
      >
        <h1 className="text-[24px] leading-[30px] font-semibold tracking-[-0.025em]">Sign in to Hisab</h1>
        <p className="mt-1.5 text-[14px] leading-[21px] text-text-muted">New here? The same step creates your account.</p>

        {linkFailed && !state.error && (
          <div role="alert" className="mt-5 flex gap-2.5 rounded-[12px] border border-warning/25 bg-warning/[0.07] px-3.5 py-3 text-[13px] leading-[19px] text-text">
            <TriangleAlert className="mt-px size-4 shrink-0 text-warning" aria-hidden />
            That sign-in link expired or was already used. Send a new one.
          </div>
        )}

        <Button
          type="button"
          variant="outline"
          size="lg"
          className="mt-6 w-full gap-3 shadow-[0_1px_2px_rgb(0_0_0/0.04)] [&_svg]:size-[18px]"
          disabled={googleBusy || busy}
          onClick={() => void signInWithGoogle()}
        >
          {googleBusy ? <Loader2 className="animate-spin" /> : <GoogleMark />}
          Continue with Google
        </Button>

        <div className="my-5 flex items-center gap-3 text-[11.5px] font-medium tracking-[0.06em] text-text-faint uppercase" aria-hidden>
          <span className="h-px flex-1 bg-border" />
          or
          <span className="h-px flex-1 bg-border" />
        </div>

        <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-text-muted">
          Email
        </label>
        <div className="relative">
          <Mail className="pointer-events-none absolute top-1/2 left-3.5 size-[17px] -translate-y-1/2 text-text-faint" aria-hidden />
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            placeholder="you@example.com"
            value={state.email}
            disabled={busy}
            aria-invalid={Boolean(state.error)}
            aria-describedby={state.error ? 'email-error' : undefined}
            onChange={(e) => dispatch({ type: 'setEmail', email: e.target.value })}
            className="h-12 rounded-[14px] pl-10 text-[15px]"
          />
        </div>
        <FieldError id="email-error" message={state.error} />

        <Button type="submit" size="lg" className="group mt-2 w-full" disabled={busy || googleBusy}>
          {state.status === 'sending' ? (
            <>
              <Loader2 className="animate-spin" /> Sending code…
            </>
          ) : (
            <>
              Continue with email
              <ArrowRight className="transition-transform duration-150 group-hover:translate-x-0.5" aria-hidden />
            </>
          )}
        </Button>
        <p className="mt-4 text-center text-[12.5px] text-text-faint">We’ll email you a 6-digit code. No password needed.</p>
      </form>
    )
  }

  const done = state.step === 'done'
  const verifying = state.status === 'verifying'
  const active = Math.min(state.code.length, OTP_LENGTH - 1)
  const showCaret = codeFocused && state.status === 'idle' && !done && state.code.length < OTP_LENGTH

  return (
    <form
      key="code"
      noValidate
      className={stepAnim}
      onSubmit={(e) => {
        e.preventDefault()
        dispatch({ type: 'submitCode' })
      }}
    >
      <button
        type="button"
        onClick={() => {
          setNotice(null)
          dispatch({ type: 'back' })
        }}
        disabled={done}
        className="-ml-1 mb-6 inline-flex items-center gap-1.5 rounded-[8px] px-1 py-0.5 text-[13px] font-medium text-text-muted transition-colors hover:text-text"
      >
        <ArrowLeft className="size-4" aria-hidden /> Use a different email
      </button>

      <span aria-hidden className="mb-4 grid size-11 place-items-center rounded-[14px] border border-border bg-surface-muted text-text">
        <MailCheck className="size-5" />
      </span>
      <h1 className="text-[24px] leading-[30px] font-semibold tracking-[-0.025em]">Check your email</h1>
      <p className="mt-1.5 text-[14px] leading-[21px] text-text-muted">
        Enter the 6-digit code we sent to <span className="font-medium text-text [overflow-wrap:anywhere]">{state.email}</span>, or open the link in that email on
        this device.
      </p>

      <div className="relative mt-6">
        <input
          ref={codeRef}
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          aria-label="6-digit code"
          aria-invalid={Boolean(state.error)}
          aria-describedby="code-error"
          value={state.code}
          disabled={state.status !== 'idle' || done}
          maxLength={OTP_LENGTH}
          onFocus={() => setCodeFocused(true)}
          onBlur={() => setCodeFocused(false)}
          // One input drives the six boxes, so the caret always sits at the end (paste and backspace just work).
          onSelect={(e) => {
            const el = e.currentTarget
            const end = el.value.length
            if (el.selectionStart !== end || el.selectionEnd !== end) el.setSelectionRange(end, end)
          }}
          onChange={(e) => dispatch({ type: 'setCode', code: e.target.value })}
          className="absolute inset-0 z-10 h-full w-full cursor-text text-[16px] text-transparent caret-transparent opacity-0 outline-none"
        />
        <div ref={boxesRef} className={cn('grid grid-cols-6 gap-2 sm:gap-2.5', verifying && 'si-verifying')} aria-hidden>
          {Array.from({ length: OTP_LENGTH }, (_, i) => {
            const char = state.code[i]
            const isActive = codeFocused && i === active && !done
            return (
              <div
                key={i}
                className={cn(
                  'num relative grid h-14 place-items-center rounded-[14px] border bg-surface text-[24px] font-semibold transition-[border-color,box-shadow,background-color] duration-150 sm:h-[60px]',
                  done
                    ? 'border-positive/60 bg-positive/[0.06] text-positive'
                    : state.error
                      ? 'border-danger/70 bg-danger/[0.04]'
                      : isActive
                        ? 'border-text/50 shadow-[0_0_0_4px_color-mix(in_oklab,var(--text)_8%,transparent)]'
                        : char
                          ? 'border-text-faint/45'
                          : 'border-border bg-surface-muted/40',
                )}
              >
                {char ? (
                  <span key={char + i} className="si-digit">
                    {char}
                  </span>
                ) : (
                  isActive && showCaret && <span className="si-caret" />
                )}
              </div>
            )
          })}
        </div>
      </div>
      <FieldError id="code-error" message={state.error} />

      <Button type="submit" size="lg" className="mt-2 w-full" disabled={state.status !== 'idle' || done}>
        {done ? (
          <>
            <Check className="check-in" aria-hidden /> Signed in
          </>
        ) : verifying ? (
          <>
            <Loader2 className="animate-spin" /> Verifying…
          </>
        ) : (
          'Verify'
        )}
      </Button>

      <div className="mt-4 flex min-h-5 items-center justify-center text-[13px] text-text-muted">
        {state.status === 'sending' ? (
          <span className="inline-flex items-center gap-1.5">
            <Loader2 className="size-3.5 animate-spin" aria-hidden /> Sending a new code…
          </span>
        ) : cooldown > 0 ? (
          <span>
            Didn’t get it? Resend in <span className="num font-medium text-text">{formatSeconds(cooldown)}</span>
          </span>
        ) : (
          <span>
            Didn’t get it?{' '}
            <button
              type="button"
              className="rounded-[6px] font-semibold text-text underline-offset-4 hover:underline"
              disabled={done}
              onClick={() => dispatch({ type: 'resend' })}
            >
              Resend code
            </button>
          </span>
        )}
      </div>
      <p role="status" className={cn('mt-2 text-center text-[12.5px] text-positive transition-opacity duration-200', !notice && 'opacity-0')}>
        {notice ?? ''}
      </p>
    </form>
  )
}

function formatSeconds(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function FieldError({ id, message }: { id: string; message: string | null }) {
  return (
    <p id={id} role="alert" className={cn('mt-2 flex min-h-5 items-start gap-1.5 text-[13px] leading-5 text-danger', !message && 'invisible')}>
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
