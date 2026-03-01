"use client"

import { useEffect } from "react"
import { AlertTriangle, RotateCcw, Home } from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function StudyError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Study page error:", error)
    }, [error])

    return (
        <div className="container mx-auto max-w-lg py-20 flex flex-col items-center text-center space-y-6">
            <div className="h-20 w-20 rounded-full bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">Phiên học gặp sự cố</h1>
            <p className="text-muted-foreground max-w-sm">
                Đã xảy ra lỗi khi tải thẻ học. Vui lòng thử lại.
            </p>
            <div className="flex gap-3">
                <Button variant="outline" onClick={reset}>
                    <RotateCcw className="mr-2 h-4 w-4" /> Thử lại
                </Button>
                <Link href="/dashboard">
                    <Button>
                        <Home className="mr-2 h-4 w-4" /> Về Dashboard
                    </Button>
                </Link>
            </div>
        </div>
    )
}
