import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background,opacity,transform] duration-150 select-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2 focus-visible:ring-offset-page disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-fg hover:opacity-90',
        secondary: 'bg-surface-muted text-text hover:bg-border',
        outline: 'border border-border bg-surface text-text hover:bg-surface-muted',
        ghost: 'text-text-muted hover:bg-surface-muted hover:text-text',
        link: 'text-text underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-[10px] px-3 text-xs',
        md: 'h-11 rounded-[14px] px-4 text-sm',
        lg: 'h-12 rounded-[14px] px-5 text-[15px]',
        icon: 'size-9 rounded-[10px]',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
