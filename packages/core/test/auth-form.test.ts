import { describe, it, expect } from 'vitest'
import { authFormReducer, initialAuthForm, type AuthFormState } from '../src/auth-form'

const run = (...actions: Parameters<typeof authFormReducer>[1][]): AuthFormState =>
  actions.reduce(authFormReducer, initialAuthForm)

describe('authFormReducer', () => {
  it('starts on the email step', () =>
    expect(initialAuthForm).toMatchObject({ step: 'email', email: '', status: 'idle', error: null }))

  it('submitting a valid email starts sending (trimmed, lowercased)', () =>
    expect(run({ type: 'setEmail', email: '  Me@Example.COM ' }, { type: 'submitEmail' })).toMatchObject({
      step: 'email',
      status: 'sending',
      email: 'me@example.com',
      error: null,
    }))

  it('invalid email shows inline error without sending', () =>
    expect(run({ type: 'setEmail', email: 'nope' }, { type: 'submitEmail' })).toMatchObject({
      status: 'idle',
      error: 'Enter a valid email address',
      email: 'nope',
    }))

  it('send failure keeps the email and shows the error', () =>
    expect(
      run({ type: 'setEmail', email: 'me@x.dev' }, { type: 'submitEmail' }, { type: 'sendFailed', error: 'Rate limited' }),
    ).toMatchObject({ step: 'email', status: 'idle', email: 'me@x.dev', error: 'Rate limited' }))

  it('send success moves to the code step', () =>
    expect(run({ type: 'setEmail', email: 'me@x.dev' }, { type: 'submitEmail' }, { type: 'sent' })).toMatchObject({
      step: 'code',
      status: 'idle',
      email: 'me@x.dev',
      code: '',
    }))

  it('code input keeps digits only, max 6', () =>
    expect(run({ type: 'setCode', code: '12a 34-5678' }).code).toBe('123456'))

  it('incomplete code shows an error without verifying', () =>
    expect(
      run({ type: 'setEmail', email: 'me@x.dev' }, { type: 'submitEmail' }, { type: 'sent' }, { type: 'setCode', code: '123' }, { type: 'submitCode' }),
    ).toMatchObject({ status: 'idle', error: 'Enter the 6-digit code' }))

  it('verify failure stays on code step, keeps email, clears code', () =>
    expect(
      run(
        { type: 'setEmail', email: 'me@x.dev' },
        { type: 'submitEmail' },
        { type: 'sent' },
        { type: 'setCode', code: '123456' },
        { type: 'submitCode' },
        { type: 'verifyFailed', error: 'Token has expired or is invalid' },
      ),
    ).toMatchObject({ step: 'code', status: 'idle', email: 'me@x.dev', code: '', error: 'Token has expired or is invalid' }))

  it('verify success finishes', () =>
    expect(
      run(
        { type: 'setEmail', email: 'me@x.dev' },
        { type: 'submitEmail' },
        { type: 'sent' },
        { type: 'setCode', code: '123456' },
        { type: 'submitCode' },
      ).status,
    ).toBe('verifying'))

  it('verified → done', () => expect(run({ type: 'verified' }).step).toBe('done'))

  it('typing clears the previous error', () =>
    expect(run({ type: 'setEmail', email: 'x' }, { type: 'submitEmail' }, { type: 'setEmail', email: 'x@' }).error).toBeNull())

  it('back returns to email step and keeps the email', () =>
    expect(
      run({ type: 'setEmail', email: 'me@x.dev' }, { type: 'submitEmail' }, { type: 'sent' }, { type: 'back' }),
    ).toMatchObject({ step: 'email', email: 'me@x.dev', code: '' }))

  it('ignores double submits while busy', () => {
    const s = run({ type: 'setEmail', email: 'me@x.dev' }, { type: 'submitEmail' })
    expect(authFormReducer(s, { type: 'submitEmail' })).toBe(s)
  })
})
