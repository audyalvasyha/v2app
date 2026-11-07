import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Label teknis, bukan pil dekoratif:
 * sudut 4px, garis rambut 1px, huruf kapital 10px bertracking, tanpa isian solid.
 * Warna selalu tint tipis + border senada supaya teks tetap jadi fokus.
 */
const badgeVariants = cva(
  'inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden whitespace-nowrap rounded-[4px] border px-1.5 text-[10px] font-semibold uppercase leading-none tracking-[0.07em] tabular-nums transition-colors [&>svg]:size-3 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:border-destructive',
  {
    variants: {
      variant: {
        default:
          'border-primary/30 bg-primary/10 text-primary [a&]:hover:border-primary/50 [a&]:hover:bg-primary/15',
        secondary:
          'border-border bg-muted/60 text-muted-foreground [a&]:hover:bg-muted',
        destructive:
          'border-destructive/35 bg-destructive/10 text-destructive [a&]:hover:border-destructive/55 [a&]:hover:bg-destructive/15',
        outline:
          'border-border bg-transparent text-muted-foreground [a&]:hover:border-foreground/25 [a&]:hover:text-foreground',
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
