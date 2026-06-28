"use client"

import { Header } from "@/components/header"
import { Sidebar } from "@/components/sidebar"

export default function Home() {
  return (
    <div className="h-screen flex flex-col">
      <Header 
        title="My App" 
        subtitle="Welcome to your application"
      />
      
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        
        <main className="flex-1 overflow-y-auto">
          <div className="container mx-auto p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h1 className="text-4xl font-bold">Selamat Datang</h1>
                <p className="text-muted-foreground mt-4">Mulai membangun project Anda di sini</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
