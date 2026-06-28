# Setup Guide - Next.js Project dengan Header & Sidebar

Project ini telah di-reset dan dikonfigurasi dengan komponen Header dan Sidebar yang sesuai dengan tema desain awal.

## Struktur Project

```
app/
├── globals.css          # Design system (warna, fonts, layout)
├── layout.tsx           # Root layout
└── page.tsx             # Landing page dengan Header + Sidebar

components/
├── header.tsx           # Header component (baru)
├── sidebar.tsx          # Sidebar component (baru)
└── ui/                  # shadcn/ui components (40+)

lib/
└── utils.ts             # Utility functions
```

## Design System

### Warna (Color Tokens)

**Light Mode:**
- `--primary: hsl(222.2 47.4% 11.2%)` - Dark blue
- `--primary-foreground: oklch(0.99 0 0)` - White
- `--background: hsl(0 0% 100%)` - White
- `--foreground: oklch(0.15 0 0)` - Nearly black
- `--sidebar: hsl(0 0% 98%)` - Light gray

**Dark Mode:**
- `--primary: #FF3C00` - Bright orange
- `--primary-foreground: #FCFCFC` - Near white
- `--background: oklch(0.1 0 0)` - Very dark
- `--foreground: oklch(0.93 0 0)` - Light
- `--sidebar: oklch(0.15 0 0)` - Dark

### Font

- **Sans/Mono**: Geist Mono (dioptimalkan untuk code/dev tools)
- **Serif**: Source Serif 4 (tersedia untuk heading alternatif)

### Border & Radius

- `--radius: 8px` - Border radius standar
- `--border: hsl(214.3 31.8% 91.4%)` - Border color

## Komponen Tersedia

### Header

**File**: `components/header.tsx`

```tsx
import { Header } from "@/components/header"

<Header 
  title="My App"
  subtitle="Welcome"
>
  {/* Optional: buttons, menus */}
</Header>
```

**Features:**
- Sticky positioning
- Logo dengan primary color
- Responsive
- Customizable title & subtitle

### Sidebar

**File**: `components/sidebar.tsx`

```tsx
import { Sidebar } from "@/components/sidebar"

<Sidebar 
  items={menuItems}
  activeItemId={activeId}
  onItemClick={handleClick}
/>
```

**Features:**
- Scrollable
- Icon support (Lucide React)
- Active state styling
- Default "All Items" menu

### UI Components

40+ shadcn/ui components siap pakai:
- Button, Input, Card, Dialog
- Form, Checkbox, Radio, Switch
- Dropdown, Select, Tabs, Accordion
- Alert, Badge, Tooltip, Popover
- Table, Chart, Skeleton, dan banyak lagi

## Layout Pattern

Gunakan pattern ini untuk membuat halaman dengan Header + Sidebar:

```tsx
"use client"

import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"
import { useState } from "react"

export default function Page() {
  const [activeId, setActiveId] = useState("all")

  const menuItems = [
    {
      id: "all",
      label: "All Items",
      icon: <Code2 className="h-4 w-4" />,
    },
    // ... more items
  ]

  return (
    <div className="h-screen flex flex-col">
      <Header 
        title="My App"
        subtitle="Dashboard"
      />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          items={menuItems}
          activeItemId={activeId}
          onItemClick={setActiveId}
        />
        
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6">
            {/* Your content here */}
            <h2>Welcome</h2>
          </div>
        </main>
      </div>
    </div>
  )
}
```

## Development

### Start Dev Server

```bash
npm run dev
# atau
pnpm dev
```

Dev server berjalan di `http://localhost:3000`

### File Editing

- **Pages**: Edit `app/page.tsx` atau buat file baru di `app/`
- **Components**: Buat file baru di `components/`
- **Styling**: Edit `app/globals.css` untuk design system

### Add New Components

Gunakan shadcn/ui CLI:

```bash
npx shadcn-ui@latest add button
npx shadcn-ui@latest add card
```

## Customization

### Ubah Primary Color

Edit `app/globals.css`:

```css
:root {
  --primary: hsl(YOUR_HUE YOUR_SAT YOUR_LIGHT);
}

.dark {
  --primary: #YOUR_HEX_COLOR;
}
```

### Ubah Font

Edit `app/layout.tsx`:

```tsx
import { YourFont } from 'next/font/google'

const yourFont = YourFont({ subsets: ['latin'] })

// Lalu gunakan di className
```

Dan update `app/globals.css`:

```css
@theme inline {
  --font-sans: "Your Font", "Fallback";
}
```

### Ubah Sidebar Width

Edit `components/sidebar.tsx`:

```tsx
<div className="w-80"> {/* Ubah w-64 menjadi w-80 */}
```

Dan sesuaikan di `app/globals.css` untuk responsive.

## Tips

1. **Selalu gunakan "use client" directive** untuk components yang interactive
2. **Container wrapper** untuk content:
   ```tsx
   <div className="container mx-auto p-6">
   ```
3. **Icons dari Lucide**: `import { IconName } from "lucide-react"`
4. **Theme colors** selalu gunakan semantic tokens (bukan hardcoded colors)
5. **Responsive design** menggunakan Tailwind breakpoints: `md:`, `lg:`, `xl:`

## Troubleshooting

### Sidebar tidak scrollable
Pastikan parent container memiliki `overflow-hidden`:
```tsx
<div className="flex flex-1 overflow-hidden">
```

### Header tidak sticky
Pastikan sudah ada `sticky top-0 z-10` di header

### Icons tidak tampil
Install lucide-react jika belum:
```bash
npm install lucide-react
```

### Styling tidak berubah
Clear cache dan reload:
```bash
rm -rf .next
npm run dev
```

## Next Steps

1. **Customize Header** dengan logo dan menu action
2. **Build Sidebar Menu** dengan routing
3. **Create Pages** dengan layout pattern ini
4. **Add More Components** dari shadcn/ui
5. **Implement Routing** dengan Next.js App Router

## Resources

- [Tailwind CSS Docs](https://tailwindcss.com)
- [shadcn/ui](https://ui.shadcn.com)
- [Lucide Icons](https://lucide.dev)
- [Next.js Docs](https://nextjs.org/docs)
