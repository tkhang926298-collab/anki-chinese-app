import Link from "next/link"
import { ArrowLeft, Search, BookOpen } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DictionaryContent } from "./dictionary-content"

export const metadata = {
    title: "Từ Điển Hán Việt",
    description: "Tra cứu trên 122,000 từ vựng Hán Việt chuẩn, bao gồm Giản thể, Phồn thể và Pinyin.",
}

export default function DictionaryPage() {
    return (
        <div className="min-h-screen bg-background relative overflow-hidden">
            <div className="fixed inset-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-full h-full bg-[radial-gradient(circle_at_100%_0%,rgba(120,119,198,0.1),transparent_50%)]"></div>
                <div className="absolute bottom-0 left-0 w-full h-full bg-[radial-gradient(circle_at_0%_100%,rgba(74,222,128,0.05),transparent_50%)]"></div>
            </div>

            <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
                <div className="container flex h-16 items-center px-4 mx-auto max-w-5xl justify-between">
                    <div className="flex items-center gap-4">
                        <Link href="/dashboard">
                            <Button variant="ghost" size="icon" className="group rounded-full hover:bg-primary/10 transition-colors">
                                <ArrowLeft className="h-5 w-5 text-foreground group-hover:text-primary transition-colors" />
                            </Button>
                        </Link>
                        <h1 className="text-xl font-bold flex items-center gap-2">
                            <BookOpen className="w-5 h-5 text-primary" /> Từ Điển Hán Việt
                        </h1>
                    </div>
                </div>
            </header>

            <main className="container mx-auto py-8 max-w-5xl px-4 relative z-10">
                <div className="text-center mb-10 space-y-4">
                    <h2 className="text-3xl md:text-5xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                        Tra Cứu Siêu Tốc
                    </h2>
                    <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                        Tìm kiếm tức thì hơn 122,000 từ vựng chuyên sâu (Hán tự, Pinyin, Nghĩa tiếng Việt). Dữ liệu được lưu trữ offline hoàn toàn đem lại tốc độ tra cứu mượt mà.
                    </p>
                </div>

                <DictionaryContent />
            </main>
        </div>
    )
}
