/**
 * Only same-origin relative paths are allowed as post-sign-in destinations. Rejects protocol-relative
 * (`//evil.com`), backslash tricks (`/\evil.com`), absolute URLs and anything not starting with `/`.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/'
  return next
}
