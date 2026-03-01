import type { Metadata } from "next"
import { Outfit, Noto_Sans_SC } from "next/font/google"
import "./globals.css"
import { Header } from "@/components/layout/header"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/sonner"

const outfit = Outfit({ subsets: ["latin"], variable: "--font-outfit", display: 'swap' })
const notoSansSc = Noto_Sans_SC({ weight: ["400", "500", "700", "900"], subsets: ["latin"], variable: "--font-noto-sans-sc", display: 'swap' })

export const metadata: Metadata = {
  title: "Anki Chinese Mới",
  description: "Trải nghiệm học Ngoại Ngữ cực cháy qua thuật toán Spaced Repetition",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${outfit.variable} ${notoSansSc.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="flex flex-col min-h-screen">
            <Header />
            <main className="flex-1 w-full mx-auto max-w-7xl">
              {children}
            </main>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
