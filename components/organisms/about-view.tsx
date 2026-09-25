import React from "react"
import {
    Card,
    CardContent,
    CardHeader,
    CardTitle,
    CardDescription
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Code2, Sparkles, Heart, Terminal, Rocket, Mail, Instagram } from "lucide-react"

export function AboutView() {
    return (
        // Class overflow-y-auto dan custom-scrollbar sudah dihilangkan di sini
        <div className="max-w-4xl mx-auto w-full pb-10 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

            {/* Banner Utama */}
            <Card className="overflow-hidden border-none shadow-md bg-gradient-to-br from-primary/10 via-background to-secondary/30">
                <CardContent className="p-8 md:p-12 text-center space-y-6">
                    <div className="mx-auto w-20 h-20 bg-primary/20 rounded-full flex items-center justify-center mb-4 ring-8 ring-background">
                        <Rocket className="h-10 w-10 text-primary" />
                    </div>
                    <h2 className="text-3xl md:text-4xl font-bold tracking-tight">
                        Fleet Management System
                    </h2>
                    <div className="flex flex-wrap justify-center gap-2 pt-4">
                        <Badge variant="secondary" className="px-3 py-1 text-sm"><Code2 className="w-4 h-4 mr-2" /> Next.js</Badge>
                        <Badge variant="secondary" className="px-3 py-1 text-sm"><Terminal className="w-4 h-4 mr-2" /> TypeScript</Badge>
                        <Badge variant="secondary" className="px-3 py-1 text-sm"><Sparkles className="w-4 h-4 mr-2" /> Tailwind & Shadcn UI</Badge>
                    </div>
                </CardContent>
            </Card>

            {/* Kartu Profil Kolaborasi */}
            <div className="grid md:grid-cols-2 gap-6">

                {/* Profil Audy Al Vasyah */}
                <Card className="border border-t-[#f97316] flex flex-col">
                    <CardHeader className="flex flex-row items-center gap-4 pb-4">
                        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-muted shrink-0 bg-secondary">
                            {/* Gambar diambil dari folder public/images.png */}
                            <img src="/images.png" alt="Audy Al Vasyah" className="w-full h-full object-cover" />
                        </div>
                        <div className="flex flex-col">
                            <CardTitle className="text-xl">Audy Al Vasyah</CardTitle>
                            <CardDescription className="font-medium text-[#f97316]">
                                Fullstack Engineer & Transport Planner
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-5 flex-1 flex flex-col">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Menggabungkan keahlian <i>engineering</i> dan perencanaan transportasi untuk membangun sistem yang efisien. Bertanggung jawab atas arsitektur aplikasi, desain antarmuka, hingga integrasi <i>database</i> secara menyeluruh.
                        </p>

                        <div className="flex flex-wrap gap-1.5 mt-auto">
                            <Badge variant="outline" className="bg-background">Next.js</Badge>
                            <Badge variant="outline" className="bg-background">Tailwind</Badge>
                            <Badge variant="outline" className="bg-background">Supabase</Badge>
                            <Badge variant="outline" className="bg-background">Firebase</Badge>
                            <Badge variant="outline" className="bg-background">GitHub</Badge>
                            <Badge variant="outline" className="bg-background">Vercel</Badge>
                        </div>

                        <div className="pt-5 mt-5 border-t flex justify-between items-center">
                            <a href="mailto:audialfasha@gmail.com" className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground font-medium transition-colors">
                                <Mail className="w-4 h-4" />
                                Email
                            </a>
                            <a
                                href="https://www.instagram.com/audysignin?stkn=d3hubDN6eTBnMG8x"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 text-sm text-[#f97316] hover:underline font-medium"
                            >
                                <Instagram className="w-4 h-4" />
                                Instagram
                            </a>
                        </div>
                    </CardContent>
                </Card>

                {/* Profil AI (Gemini) */}
                <Card className="border border-t-blue-500 flex flex-col">
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center gap-2">
                            🤖 AI Pair Programmer
                        </CardTitle>
                        <CardDescription>Asisten & <i>Thought Partner</i></CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 flex-1 flex flex-col">
                        <p className="text-sm text-muted-foreground leading-relaxed">
                            Membantu dalam merestrukturisasi kode (<i>refactoring</i>) ke dalam pola <i>Atomic Design</i>, memberikan saran performa dalam ekosistem Next.js, serta menyempurnakan UI/UX menggunakan Tailwind CSS dan komponen Shadcn.
                        </p>
                        <div className="pt-4 mt-auto border-t flex justify-between items-center text-sm font-medium text-muted-foreground">
                            <span>Powered by Gemini</span>
                            <Heart className="w-4 h-4 text-red-500 fill-current" />
                        </div>
                    </CardContent>
                </Card>

            </div>
        </div>
    )
}