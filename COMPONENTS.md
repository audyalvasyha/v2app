# Komponen Layout

## Header

Komponen `Header` menampilkan header aplikasi dengan logo, judul, dan subtitle.

### Props

- `title?: string` - Judul aplikasi (default: "My App")
- `subtitle?: string` - Subtitle/deskripsi singkat (default: "Welcome")
- `children?: React.ReactNode` - Konten tambahan di sebelah kanan header

### Contoh Penggunaan

```tsx
import { Header } from "@/components/header"

export default function Home() {
  return (
    <div className="h-screen flex flex-col">
      <Header 
        title="My Application"
        subtitle="Dashboard"
      >
        {/* Optional: Add buttons, menus, etc. */}
      </Header>
      
      {/* Rest of your page */}
    </div>
  )
}
```

### Features

- Sticky positioning (tetap di atas saat scroll)
- Logo dengan background primary color
- Responsive design
- Border styling sesuai theme

---

## Sidebar

Komponen `Sidebar` menampilkan menu navigasi di sisi kiri aplikasi.

### Props

- `items?: Array<{ id, label, icon?, onClick? }>` - Array menu items
- `onItemClick?: (id: string) => void` - Callback saat item diklik
- `activeItemId?: string` - ID item yang sedang aktif

### Contoh Penggunaan

```tsx
import { Sidebar } from "@/components/sidebar"
import { Home, Settings, Users } from "lucide-react"

export default function Home() {
  const [activeId, setActiveId] = useState("home")

  const menuItems = [
    {
      id: "home",
      label: "Home",
      icon: <Home className="h-4 w-4" />,
      onClick: () => console.log("Home clicked"),
    },
    {
      id: "users",
      label: "Users",
      icon: <Users className="h-4 w-4" />,
    },
    {
      id: "settings",
      label: "Settings",
      icon: <Settings className="h-4 w-4" />,
    },
  ]

  return (
    <div className="h-screen flex flex-col">
      <Header title="My App" />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar 
          items={menuItems}
          activeItemId={activeId}
          onItemClick={setActiveId}
        />
        
        <main className="flex-1 overflow-y-auto">
          {/* Your content */}
        </main>
      </div>
    </div>
  )
}
```

### Features

- Scrollable content area
- Active state styling
- Default "All Items" menu jika tidak ada items
- Uses `bg-sidebar` styling dari design system
- Icon support dengan Lucide React

---

## Layout Pattern

Template layout standar dengan Header + Sidebar:

```tsx
<div className="h-screen flex flex-col">
  <Header title="App Title" />
  
  <div className="flex flex-1 overflow-hidden">
    <Sidebar items={menuItems} />
    
    <main className="flex-1 overflow-y-auto">
      <div className="container mx-auto p-6">
        {/* Your page content */}
      </div>
    </main>
  </div>
</div>
```

---

## Design System

Komponen ini menggunakan design system dari `globals.css`:

### Colors

- `bg-background` - Background utama
- `bg-sidebar` - Background sidebar
- `text-foreground` - Text utama
- `text-sidebar-foreground` - Text di sidebar
- `border-border` - Border color
- `bg-primary` - Primary color (untuk logo)

### Typography

- Menggunakan Geist Mono (sans/mono) font

### Responsive

- Sidebar width: 256px (w-64)
- Fully responsive dengan TailwindCSS breakpoints

---

## Tips Penggunaan

1. **Selalu bungkus dengan div height screen**
   ```tsx
   <div className="h-screen flex flex-col">
   ```

2. **Gunakan `"use client"` directive** karena components ini interactive

3. **Scrollable main area**
   ```tsx
   <main className="flex-1 overflow-y-auto">
   ```

4. **Add container padding untuk content**
   ```tsx
   <div className="container mx-auto p-6">
   ```

5. **Customizable header dengan children**
   ```tsx
   <Header title="Title">
     <Button>Action</Button>
   </Header>
   ```
