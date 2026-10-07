import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold transition-[background-color,border-color,color,opacity,transform] duration-150 select-none disabled:pointer-events-none disabled:opacity-40 active:scale-[0.98] [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand text-brand-fg hover:opacity-90',
        secondary: 'bg-surface-muted text-text hover:bg-border',
        outline: 'border border-border bg-surface text-text hover:border-text-faint/40 hover:bg-surface-muted',
        ghost: 'text-text-muted hover:bg-surface-muted hover:text-text',
        danger: 'border border-danger/30 bg-surface text-danger hover:border-danger/60 hover:bg-danger/[0.06]',
        link: 'text-text underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 rounded-[10px] px-3 text-[13px] [&_svg]:size-3.5',
        md: 'h-10 rounded-[12px] px-4 text-sm',
        lg: 'h-12 rounded-[14px] px-5 text-[15px]',
        icon: 'size-9 rounded-[10px]',
        'icon-sm': 'size-8 rounded-[10px] [&_svg]:size-3.5',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type = 'button', ...props }: ButtonProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

/** Small keyboard hint, e.g. <Kbd>N</Kbd>. `inverted` for use on the ink/brand buttons. */
export function Kbd({ children, inverted, className }: { children: React.ReactNode; inverted?: boolean; className?: string }) {
  return (
    <kbd
      className={cn(
        'inline-grid h-5 min-w-5 place-items-center rounded-[5px] px-1 font-sans text-[11px] leading-none font-medium',
        inverted ? 'bg-brand-fg/15 text-brand-fg/80' : 'border border-border bg-surface text-text-muted shadow-[0_1px_0_var(--border)]',
        className,
      )}
    >
      {children}
    </kbd>
  )
}
