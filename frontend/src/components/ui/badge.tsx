import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-ring/50',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary-soft text-accent-foreground',
        secondary: 'border-transparent bg-muted text-muted-foreground',
        outline: 'border-border bg-card text-muted-foreground',
        success: 'border-transparent bg-[#e2f4e2] text-[#0b6b0b]',
        warning: 'border-transparent bg-or-soft text-[#7a5600]',
        destructive: 'border-transparent bg-[#fbe6e6] text-[#a32b2b]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
