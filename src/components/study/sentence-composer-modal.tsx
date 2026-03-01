"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Send, RotateCcw, Loader2, CheckCircle2, XCircle, Lightbulb, Volume2 } from "lucide-react"
import { Button } from "@/components/ui/button"

interface SentenceComposerModalProps {
    open: boolean
    onClose: () => void
    hanzi: string
    pinyin?: string
    meaning?: string
}

interface CheckResult {
    correct: boolean
    score: number
    feedback: string
    correction?: string
    pinyin?: string
    heuristicOnly?: boolean
}

export function SentenceComposerModal({
    open,
    onClose,
    hanzi,
    pinyin,
    meaning,
}: SentenceComposerModalProps) {
    const [sentence, setSentence] = useState("")
    const [isChecking, setIsChecking] = useState(false)
    const [result, setResult] = useState<CheckResult | null>(null)

    const handleClose = () => {
        setSentence("")
        setResult(null)
        onClose()
    }

    const handleCheck = async () => {
        if (!sentence.trim() || isChecking) return
        setIsChecking(true)
        setResult(null)
        try {
            const res = await fetch("/api/check-sentence", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    sentence: sentence.trim(),
                    targetWord: hanzi,
                    meaning: meaning || "",
                    pinyin: pinyin,
                }),
            })
            const data: CheckResult = await res.json()
            setResult(data)
            // TTS read back correct sentence
            if (data.correct && typeof window !== "undefined" && window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance(sentence.trim())
                utterance.lang = "zh-CN"
                utterance.rate = 0.8
                window.speechSynthesis.cancel()
                window.speechSynthesis.speak(utterance)
            }
        } catch {
            setResult({
                correct: false,
                score: 0,
                feedback: "Không thể kết nối máy chủ. Vui lòng thử lại.",
            })
        } finally {
            setIsChecking(false)
        }
    }

    const handleRetry = () => {
        setResult(null)
        setSentence("")
    }

    const speakSentence = (text: string) => {
        if (typeof window !== "undefined" && window.speechSynthesis) {
            const u = new SpeechSynthesisUtterance(text)
            u.lang = "zh-CN"
            u.rate = 0.8
            window.speechSynthesis.cancel()
            window.speechSynthesis.speak(u)
        }
    }

    const scoreColor = (score: number) => {
        if (score >= 8) return "text-emerald-600 dark:text-emerald-400"
        if (score >= 5) return "text-amber-600 dark:text-amber-400"
        return "text-destructive"
    }

    const scoreBg = (score: number) => {
        if (score >= 8) return "bg-emerald-500"
        if (score >= 5) return "bg-amber-500"
        return "bg-destructive"
    }

    if (!open) return null

    return (
        <AnimatePresence>
            {open && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
                    onClick={(e) => e.target === e.currentTarget && handleClose()}
                >
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, y: 40, scale: 0.97 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 40, scale: 0.97 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="relative z-50 w-full sm:max-w-xl bg-background border border-border/60 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden"
                        style={{ maxHeight: "92dvh" }}
                    >
                        {/* Header */}
                        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-border/60">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">✍️</span>
                                <div>
                                    <h2 className="text-lg font-bold text-foreground">Đặt câu với từ mới</h2>
                                    <p className="text-xs text-muted-foreground">Viết 1 câu tiếng Trung dùng từ này</p>
                                </div>
                            </div>
                            <button
                                onClick={handleClose}
                                className="p-2 rounded-xl hover:bg-muted/80 text-muted-foreground hover:text-foreground transition-colors"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>

                        {/* Body */}
                        <div className="px-6 py-5 overflow-y-auto space-y-5" style={{ maxHeight: "calc(92dvh - 80px)" }}>
                            {/* Target Word Card */}
                            <div className="rounded-2xl bg-primary/5 border border-primary/20 p-4 flex items-center gap-4">
                                <div className="flex-1">
                                    <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-1">Từ cần dùng</p>
                                    <p className="text-4xl font-bold font-chinese text-foreground">{hanzi}</p>
                                    {pinyin && <p className="text-base text-primary italic mt-0.5">{pinyin}</p>}
                                    {meaning && <p className="text-sm text-muted-foreground mt-1">{meaning}</p>}
                                </div>
                                <button
                                    onClick={() => speakSentence(hanzi)}
                                    className="p-3 rounded-xl bg-primary/10 hover:bg-primary/20 text-primary transition-colors flex-shrink-0"
                                    title="Nghe phát âm"
                                >
                                    <Volume2 className="h-5 w-5" />
                                </button>
                            </div>

                            {/* Input & Result */}
                            <AnimatePresence mode="wait">
                                {!result ? (
                                    <motion.div
                                        key="input"
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="space-y-4"
                                    >
                                        <div className="space-y-2">
                                            <label className="text-sm font-semibold text-foreground">
                                                Câu của bạn <span className="text-muted-foreground font-normal">(tiếng Trung)</span>
                                            </label>
                                            <textarea
                                                value={sentence}
                                                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setSentence(e.target.value)}
                                                placeholder={`Ví dụ: 我非常喜欢${hanzi}。`}
                                                className="w-full min-h-[100px] text-xl font-chinese rounded-xl border-2 border-border focus:border-primary focus:outline-none resize-none bg-muted/30 placeholder:text-muted-foreground/50 placeholder:text-base p-4 transition-colors"
                                                onKeyDown={(e: React.KeyboardEvent<HTMLTextAreaElement>) => {
                                                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                                        e.preventDefault()
                                                        handleCheck()
                                                    }
                                                }}
                                                autoComplete="off"
                                                spellCheck={false}
                                            />
                                            <p className="text-xs text-muted-foreground text-right">
                                                Ctrl+Enter để kiểm tra • {sentence.length} ký tự
                                            </p>
                                        </div>

                                        <Button
                                            size="lg"
                                            className="w-full h-14 text-base font-semibold rounded-xl"
                                            onClick={handleCheck}
                                            disabled={!sentence.trim() || isChecking}
                                        >
                                            {isChecking ? (
                                                <><Loader2 className="mr-2 h-5 w-5 animate-spin" />Đang kiểm tra...</>
                                            ) : (
                                                <><Send className="mr-2 h-5 w-5" />Kiểm tra câu</>
                                            )}
                                        </Button>
                                    </motion.div>
                                ) : (
                                    <motion.div
                                        key="result"
                                        initial={{ opacity: 0, y: 12 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.3, ease: "easeOut" }}
                                        className="space-y-4"
                                    >
                                        {/* Score Banner */}
                                        <div className={`rounded-2xl p-5 border-2 ${result.correct
                                            ? 'bg-emerald-50/60 dark:bg-emerald-950/20 border-emerald-500/40'
                                            : 'bg-destructive/5 border-destructive/30'
                                            }`}>
                                            <div className="flex items-center gap-4 mb-3">
                                                <div className={`h-12 w-12 rounded-full flex items-center justify-center flex-shrink-0 ${result.correct ? 'bg-emerald-100 dark:bg-emerald-900/50' : 'bg-destructive/10'}`}>
                                                    {result.correct
                                                        ? <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                                                        : <XCircle className="h-6 w-6 text-destructive" />
                                                    }
                                                </div>
                                                <div className="flex-1">
                                                    <p className={`font-bold text-lg ${result.correct ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
                                                        {result.correct ? 'Câu của bạn ổn!' : 'Cần chỉnh sửa'}
                                                    </p>
                                                    {result.score > 0 && (
                                                        <div className="flex items-center gap-2 mt-1">
                                                            <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full transition-all duration-700 ${scoreBg(result.score)}`}
                                                                    style={{ width: `${result.score * 10}%` }}
                                                                />
                                                            </div>
                                                            <span className={`text-sm font-bold ${scoreColor(result.score)}`}>{result.score}/10</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>

                                            {/* User sentence */}
                                            <div className="mb-3">
                                                <p className="text-xs text-muted-foreground uppercase font-semibold mb-1">Câu bạn viết</p>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-2xl font-chinese font-medium text-foreground flex-1">{sentence}</p>
                                                    <button onClick={() => speakSentence(sentence)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                                                        <Volume2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                                {result.pinyin && <p className="text-sm text-muted-foreground italic mt-0.5">{result.pinyin}</p>}
                                            </div>

                                            {/* Feedback */}
                                            {result.feedback && (
                                                <div className="flex gap-2 bg-background/60 rounded-xl p-3">
                                                    <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                                                    <p className="text-sm text-foreground/80">{result.feedback}</p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Correction */}
                                        {result.correction && (
                                            <div className="rounded-2xl bg-blue-50/60 dark:bg-blue-950/20 border border-blue-300/40 p-4">
                                                <p className="text-xs text-blue-600 dark:text-blue-400 font-semibold uppercase mb-2">💡 Gợi ý sửa lại</p>
                                                <div className="flex items-center gap-2">
                                                    <p className="text-2xl font-chinese font-medium text-blue-700 dark:text-blue-300 flex-1">{result.correction}</p>
                                                    <button onClick={() => speakSentence(result.correction!)} className="p-2 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-500">
                                                        <Volume2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        )}

                                        {/* Actions */}
                                        <div className="flex gap-3 pt-1">
                                            <Button
                                                variant="outline"
                                                size="lg"
                                                className="flex-1 h-12 rounded-xl"
                                                onClick={handleRetry}
                                            >
                                                <RotateCcw className="mr-2 h-4 w-4" />
                                                Thử lại
                                            </Button>
                                            <Button
                                                size="lg"
                                                className="flex-1 h-12 rounded-xl"
                                                onClick={handleClose}
                                            >
                                                Tiếp tục học
                                            </Button>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    )
}
