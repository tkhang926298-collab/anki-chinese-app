"use client"

import { motion } from "framer-motion"
import { Sparkles, CheckCircle2, XCircle, Clock, BarChart3, ArrowLeft, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface SessionSummaryProps {
    totalCards: number
    correctCount: number
    wrongCount: number
    sessionDurationMs: number
    onStudyMore: () => void
}

export function SessionSummary({ totalCards, correctCount, wrongCount, sessionDurationMs, onStudyMore }: SessionSummaryProps) {
    const accuracy = totalCards > 0 ? Math.round((correctCount / totalCards) * 100) : 0
    const minutes = Math.floor(sessionDurationMs / 60000)
    const seconds = Math.floor((sessionDurationMs % 60000) / 1000)

    // Emoji & message dựa trên accuracy
    let emoji = "🎉"
    let message = "Xuất sắc! Bạn nắm rất chắc kiến thức!"
    let accentColor = "emerald"
    if (accuracy < 50) {
        emoji = "💪"
        message = "Cố lên! Luyện tập nhiều hơn sẽ tiến bộ thôi!"
        accentColor = "amber"
    } else if (accuracy < 80) {
        emoji = "👏"
        message = "Khá tốt! Tiếp tục ôn tập để hoàn thiện hơn nhé!"
        accentColor = "blue"
    }

    return (
        <div className="container py-12 max-w-lg flex flex-col items-center justify-center text-center space-y-8">
            {/* Celebration Icon */}
            <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", stiffness: 200, damping: 15 }}
                className="h-28 w-28 rounded-full bg-gradient-to-br from-emerald-100 to-emerald-200 dark:from-emerald-900/40 dark:to-emerald-800/40 flex items-center justify-center shadow-lg"
            >
                <span className="text-5xl">{emoji}</span>
            </motion.div>

            {/* Title */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                <h1 className="text-3xl font-bold tracking-tight">Phiên học hoàn tất!</h1>
                <p className="text-lg text-muted-foreground mt-2">{message}</p>
            </motion.div>

            {/* Stats Grid */}
            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35 }}
                className="w-full grid grid-cols-2 gap-4"
            >
                {/* Accuracy */}
                <div className="col-span-2 bg-card border rounded-2xl p-6 shadow-sm">
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <BarChart3 className="h-5 w-5 text-primary" />
                        <span className="text-sm font-medium text-muted-foreground">Độ chính xác</span>
                    </div>
                    <div className="relative w-full h-4 bg-muted rounded-full overflow-hidden">
                        <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${accuracy}%` }}
                            transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
                            className={`h-full rounded-full ${accuracy >= 80 ? 'bg-emerald-500' : accuracy >= 50 ? 'bg-blue-500' : 'bg-amber-500'}`}
                        />
                    </div>
                    <motion.p
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.8 }}
                        className="text-4xl font-extrabold mt-3"
                    >
                        {accuracy}%
                    </motion.p>
                </div>

                {/* Correct */}
                <div className="bg-card border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <span className="text-sm text-muted-foreground">Đúng</span>
                    </div>
                    <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{correctCount}</p>
                </div>

                {/* Wrong */}
                <div className="bg-card border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <XCircle className="h-5 w-5 text-red-500" />
                        <span className="text-sm text-muted-foreground">Sai</span>
                    </div>
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400">{wrongCount}</p>
                </div>

                {/* Total & Time */}
                <div className="bg-card border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <Sparkles className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground">Tổng thẻ</span>
                    </div>
                    <p className="text-3xl font-bold">{totalCards}</p>
                </div>

                <div className="bg-card border rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center justify-center gap-2 mb-2">
                        <Clock className="h-5 w-5 text-primary" />
                        <span className="text-sm text-muted-foreground">Thời gian</span>
                    </div>
                    <p className="text-3xl font-bold">{minutes}<span className="text-lg text-muted-foreground">m</span> {seconds}<span className="text-lg text-muted-foreground">s</span></p>
                </div>
            </motion.div>

            {/* Action Buttons */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="flex gap-4 w-full"
            >
                <Button variant="outline" size="lg" className="flex-1 h-14 text-lg rounded-xl" onClick={onStudyMore}>
                    <RotateCcw className="h-5 w-5 mr-2" /> Học tiếp
                </Button>
                <Link href="/dashboard" className="flex-1">
                    <Button size="lg" className="w-full h-14 text-lg rounded-xl">
                        <ArrowLeft className="h-5 w-5 mr-2" /> Dashboard
                    </Button>
                </Link>
            </motion.div>
        </div>
    )
}
