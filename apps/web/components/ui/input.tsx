import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-12 w-full rounded-[14px] border border-border bg-surface px-4 text-[15px] text-text outline-none transition-[border,box-shadow] duration-150 placeholder:text-text-faint focus:border-text-faint focus:ring-4 focus:ring-brand/[0.06] aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  )
}
