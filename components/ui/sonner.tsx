'use client'

import { useTheme } from '@/hooks/use-theme'
import { Toaster as Sonner, type ToasterProps } from 'sonner'

// Toast mengikuti tema aplikasi yang sama (device / pilihan manual di header).
// Sebelumnya pakai next-themes, tapi ThemeProvider-nya tidak pernah dimount
// sehingga selalu jatuh ke default — sekarang cukup hook internal kita.
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme } = useTheme()

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  )
}

export { Toaster }