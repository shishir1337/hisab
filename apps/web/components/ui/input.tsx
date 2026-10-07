import type { InputHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        'h-11 w-full rounded-[12px] border border-border bg-surface px-3.5 text-[14.5px] text-text outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-text-faint hover:border-text-faint/50 focus:border-text-faint focus:ring-4 focus:ring-brand/[0.06] aria-[invalid=true]:border-danger',
        className,
      )}
      {...props}
    />
  )
}
