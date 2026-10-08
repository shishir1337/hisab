'use client'

export function RetryButton() {
  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="flex h-12 items-center justify-center rounded-[14px] border border-border bg-surface text-[15px] font-medium text-text active:scale-[0.98]"
    >
      Try again
    </button>
  )
}
