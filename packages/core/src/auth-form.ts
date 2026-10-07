/** Email one-time-code sign-in flow, shared by web and mobile. Pure: side effects live in the UI. */

export interface AuthFormState {
  step: 'email' | 'code' | 'done'
  email: string
  code: string
  status: 'idle' | 'sending' | 'verifying'
  error: string | null
}

export type AuthFormAction =
  | { type: 'setEmail'; email: string }
  | { type: 'submitEmail' }
  | { type: 'sent' }
  | { type: 'sendFailed'; error: string }
  | { type: 'setCode'; code: string }
  | { type: 'submitCode' }
  | { type: 'verified' }
  | { type: 'verifyFailed'; error: string }
  | { type: 'back' }

export const OTP_LENGTH = 6

export const initialAuthForm: AuthFormState = {
  step: 'email',
  email: '',
  code: '',
  status: 'idle',
  error: null,
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function authFormReducer(state: AuthFormState, action: AuthFormAction): AuthFormState {
  switch (action.type) {
    case 'setEmail':
      return { ...state, email: action.email, error: null }
    case 'submitEmail': {
      if (state.status !== 'idle') return state
      const email = state.email.trim().toLowerCase()
      if (!EMAIL.test(email)) return { ...state, error: 'Enter a valid email address' }
      return { ...state, email, status: 'sending', error: null }
    }
    case 'sent':
      return { ...state, step: 'code', status: 'idle', code: '', error: null }
    case 'sendFailed':
      return { ...state, step: 'email', status: 'idle', error: action.error }
    case 'setCode':
      return { ...state, code: action.code.replace(/\D/g, '').slice(0, OTP_LENGTH), error: null }
    case 'submitCode':
      if (state.status !== 'idle') return state
      if (state.code.length !== OTP_LENGTH) return { ...state, error: `Enter the ${OTP_LENGTH}-digit code` }
      return { ...state, status: 'verifying', error: null }
    case 'verified':
      return { ...state, step: 'done', status: 'idle', error: null }
    case 'verifyFailed':
      return { ...state, step: 'code', status: 'idle', code: '', error: action.error }
    case 'back':
      return { ...state, step: 'email', status: 'idle', code: '', error: null }
  }
}
