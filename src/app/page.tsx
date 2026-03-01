import { Button } from "@/components/ui/button"
import Link from "next/link"
import { BookOpen, BrainCircuit, Globe, Zap, ArrowRight, Sparkles } from "lucide-react"

export default function Home() {
  return (
    <div className="flex flex-col min-h-screen bg-background relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 -left-4 w-72 h-72 bg-primary/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse"></div>
      <div className="absolute top-0 -right-4 w-72 h-72 bg-secondary/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse animation-delay-2000"></div>
      <div className="absolute -bottom-8 left-20 w-72 h-72 bg-accent/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 animate-pulse animation-delay-4000"></div>

      <main className="flex-1 relative z-10">
        <section className="w-full py-20 lg:py-40">
          <div className="container px-4 md:px-6 relative">
            <div className="flex flex-col items-center space-y-8 text-center">
              <div className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 border-transparent bg-primary/10 text-primary hover:bg-primary/20 backdrop-blur-md">
                <Sparkles className="w-4 h-4 mr-2" />
                Phiên bản 2.0 Đa Ngôn Ngữ
              </div>
              <div className="space-y-4 max-w-4xl">
                <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl/none bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/60">
                  Học Ngoại Ngữ Thông Minh <br className="hidden sm:inline" />Cùng Spaced Repetition
                </h1>
                <p className="mx-auto max-w-[750px] text-muted-foreground md:text-xl/relaxed lg:text-2xl/relaxed font-medium">
                  Import mọi bộ bài Anki của bạn. Trải nghiệm học tập siêu tốc với thuật toán FSRS tiên tiến nhất, lưu trữ trên nền tảng đám mây an toàn.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-4 mt-8">
                <Link href="/login">
                  <Button size="lg" className="h-14 px-8 text-lg font-semibold rounded-full shadow-lg shadow-primary/25 hover:scale-105 transition-transform">
                    Bắt Đầu Học Ngay <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                </Link>
                <Link href="/dashboard">
                  <Button variant="outline" size="lg" className="h-14 px-8 text-lg font-medium rounded-full backdrop-blur-sm bg-background/50 hover:bg-muted/50 transition-colors">
                    Tới Bảng Điểu Khiển
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="w-full py-16 md:py-24 lg:py-32 relative">
          <div className="container px-4 md:px-6">
            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
              <div className="flex flex-col items-center space-y-4 text-center p-8 rounded-3xl bg-card border shadow-sm backdrop-blur-xl hover:shadow-md transition-all group">
                <div className="p-4 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform group-hover:bg-primary/20">
                  <Globe className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold">Đa Ngôn Ngữ</h3>
                <p className="text-muted-foreground leading-relaxed">Nhập trực tiếp các file .apkg (Trung, Anh, Nhật..) mà không cần cài đặt rườm rà trên PC.</p>
              </div>
              <div className="flex flex-col items-center space-y-4 text-center p-8 rounded-3xl bg-card border shadow-sm backdrop-blur-xl hover:shadow-md transition-all group">
                <div className="p-4 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform group-hover:bg-primary/20">
                  <BrainCircuit className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold">FSRS Engine</h3>
                <p className="text-muted-foreground leading-relaxed">Thuật toán ghi nhớ giãn cách thế hệ mới giúp bạn thuộc làu từ vựng với số lần ôn tập ít nhất có thể.</p>
              </div>
              <div className="flex flex-col items-center space-y-4 text-center p-8 rounded-3xl bg-card border shadow-sm backdrop-blur-xl hover:shadow-md transition-all group">
                <div className="p-4 bg-primary/10 rounded-2xl group-hover:scale-110 transition-transform group-hover:bg-primary/20">
                  <Zap className="h-8 w-8 text-primary" />
                </div>
                <h3 className="text-xl font-bold">Trắc nghiệm & Gõ</h3>
                <p className="text-muted-foreground leading-relaxed">Tùy biến học qua Flashcard 4 mảnh hoặc Typing thực chiến từ vựng vào màn hình cực cuốn hút.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  )
}
