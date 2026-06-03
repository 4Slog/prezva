import { forwardRef } from 'react'

type Variant = 'primary' | 'secondary' | 'destructive' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--pz-teal)]'

const variants: Record<Variant, string> = {
  primary:     'bg-[var(--pz-teal)] text-[var(--pz-on-accent)] hover:bg-[var(--pz-teal-light)]',
  secondary:   'bg-[var(--pz-surface-2)] text-[var(--pz-text)] border border-[var(--pz-border)] hover:bg-[var(--pz-border)]',
  destructive: 'bg-[var(--pz-red)] text-white hover:opacity-90',
  ghost:       'text-[var(--pz-muted)] hover:text-[var(--pz-text)] hover:bg-[var(--pz-surface-2)]',
}

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-1.5',
  md: 'text-sm px-4 py-2',
  lg: 'text-sm px-6 py-3',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = 'primary', size = 'md', className = '', ...props }, ref) => (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  )
)
Button.displayName = 'Button'
