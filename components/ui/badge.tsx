import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Pill status yang mengikuti bahasa visual referensi:
 * sudut penuh, ikon di kiri, teks sentence case, dan padding yang cukup.
 * Warna tetap tint tipis + border senada supaya tidak bersaing dengan data.
 */
const badgeVariants = cva(
  'inline-flex h-6 w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full border px-2.5 text-xs font-medium leading-none normal-case tracking-normal tabular-nums transition-colors [&>svg]:size-3.5 [&>svg]:shrink-0 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        default:
          'border-primary/30 bg-primary/10 text-primary [a&]:hover:border-primary/50 [a&]:hover:bg-primary/15',
        secondary:
          'border-border bg-muted/60 text-muted-foreground [a&]:hover:bg-muted [a&]:hover:text-foreground',
        destructive:
          'border-destructive/35 bg-destructive/10 text-destructive [a&]:hover:border-destructive/55 [a&]:hover:bg-destructive/15',
        success:
          'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 [a&]:hover:border-emerald-500/50 [a&]:hover:bg-emerald-500/15',
        warning:
          'border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-400 [a&]:hover:border-amber-500/55 [a&]:hover:bg-amber-500/15',
        info:
          'border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300 [a&]:hover:border-sky-500/50 [a&]:hover:bg-sky-500/15',
        outline:
          'border-border bg-background text-muted-foreground [a&]:hover:border-foreground/25 [a&]:hover:text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'span'

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
