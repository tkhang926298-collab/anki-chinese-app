"use client"

import { useState, useRef, useEffect } from "react"
import { Eye, CheckCircle2, XCircle, ArrowLeftRight } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { AnkiHtml } from "./anki-html"
import { parseCardFields, getStudyPair, type StudyDirection } from "@/lib/parse-card-fields"
import { calculateNextReview, Rating, CardState } from "@/lib/fsrs/scheduler"
import { db } from "@/lib/db/local"
import { toast } from "sonner"

interface TypingModeProps {
    card: any
    onNext: () => void
}

export function TypingMode({ card, onNext }: TypingModeProps) {
    const [inputValue, setInputValue] = useState("")
    const [isRevealed, setIsRevealed] = useState(false)
    const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
    const [isUpdating, setIsUpdating] = useState(false)
    const [swapSides, setSwapSides] = useState(false)

    const inputRef = useRef<HTMLInputElement>(null)

    useEffect(() => {
        // Focus input on load
        if (inputRef.current) {
            inputRef.current.focus()
        }
    }, [card])

    const submitReview = async (isCorrectMatch: boolean) => {
        setIsUpdating(true)
        try {
            const rating: Rating = isCorrectMatch ? 'good' : 'again'

            const currentState: CardState = {
                state: card.state || 'new',
                due: card.due,
                stability: card.stability || 0,
                difficulty: card.difficulty || 4.5,
                elapsed_days: card.elapsed_days || 0,
                scheduled_days: card.scheduled_days || 0,
                reps: card.reps || 0,
                lapses: card.lapses || 0,
                last_review: card.last_review
            }

            const nextState = calculateNextReview(currentState, rating)

            // Update Card
            const cardUpdateData: any = {
                state: nextState.state,
                due: nextState.due,
                stability: nextState.stability,
                difficulty: nextState.difficulty,
                elapsed_days: nextState.elapsed_days,
                scheduled_days: nextState.scheduled_days,
                reps: nextState.reps,
                lapses: nextState.lapses,
                last_review: nextState.last_review
            };

            await db.cards.update(card.id, cardUpdateData)

            // Insert Log
            const logInsertData: any = {
                id: crypto.randomUUID(),
                card_id: card.id,
                user_id: card.user_id,
                rating: rating,
                state: nextState.state,
                due: nextState.due || new Date().toISOString(),
                stability: nextState.stability,
                difficulty: nextState.difficulty,
                elapsed_days: nextState.elapsed_days,
                last_elapsed_days: currentState.elapsed_days,
                scheduled_days: nextState.scheduled_days,
                review: nextState.last_review || new Date().toISOString()
            };

            await db.review_logs.add(logInsertData)

        } catch (error) {
            console.error("SRS Update failed:", error)
            toast.error("Không thể lưu tiến trình. Vui lòng kiểm tra mạng.")
        } finally {
            setIsUpdating(false)
        }
    }

    // === PARSE CARD FIELDS: Tách 3 trường riêng biệt ===
    const parsed = parseCardFields(card);
    const direction: StudyDirection = swapSides ? 'meaning_to_hanzi' : 'hanzi_to_meaning';
    const studyPair = getStudyPair(parsed, direction);

    const targetAnswer = studyPair.answer;
    // Prompt: nếu là chữ Hán thì dùng front_html gốc (có thể chứa media), nếu là nghĩa thì dùng plain text
    let promptHtml = swapSides ? `<div class="text-2xl leading-relaxed">${studyPair.prompt}</div>` : (card.front_html || studyPair.prompt);

    const handleSubmit = async (e?: React.FormEvent) => {
        if (e) e.preventDefault()
        if (!inputValue.trim() || isRevealed || isUpdating) return

        const inputClean = inputValue.replace(/\(.*?\)/g, "").trim().toLowerCase()
        const targetClean = targetAnswer.replace(/\(.*?\)/g, "").trim().toLowerCase()

        const inputAnswers = inputClean.split(/[,;\/]/).map((a) => a.trim()).filter(a => a.length > 0)
        const targetAnswers = targetClean.split(/[,;\/]/).map((a) => a.trim()).filter(a => a.length > 0)

        // Chấp nhận đúng nếu Nhập trùng toàn bộ, hoặc Nhập trùng 1 vế của đáp án được phân tách
        const match = inputClean === targetClean || (targetAnswers.length > 0 && targetAnswers.some(t => inputAnswers.includes(t)))

        setIsCorrect(match)
        setIsRevealed(true)
        if (match) {
            import('@/lib/utils').then(({ playTingSound }) => playTingSound())
        }

        await submitReview(match)
    }

    const handleShowAnswer = async () => {
        if (isRevealed || isUpdating) return
        setIsCorrect(false)
        setIsRevealed(true)
        await submitReview(false)
    }

    const handleContinue = () => {
        setInputValue("")
        setIsRevealed(false)
        setIsCorrect(null)
        onNext()
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            if (isRevealed) {
                handleContinue()
            } else {
                handleSubmit()
            }
        }
    }

    if (targetAnswer.length > 0) {
        // Escape special chars for regex
        const escapeRegExp = (string: string) => string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
        const regex = new RegExp(escapeRegExp(targetAnswer), 'gi')
        promptHtml = promptHtml.replace(regex, '<span class="inline px-2 py-0 mx-1 bg-muted/50 rounded-md text-transparent border-b-2 border-primary/50">____</span>')
    }

    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={card.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="w-full flex flex-col items-center max-w-2xl mx-auto space-y-10"
            >
                {/* Top Toolbar */}
                <div className="w-full flex justify-end items-center gap-2 text-sm text-muted-foreground bg-muted/30 p-2 rounded-lg border">
                    <ArrowLeftRight className="w-4 h-4" />
                    <Label htmlFor="swap-sides" className="cursor-pointer select-none">Đảo Chiều Học</Label>
                    <Switch
                        id="swap-sides"
                        checked={swapSides}
                        onCheckedChange={(val) => {
                            setSwapSides(val)
                            setInputValue("")
                            if (inputRef.current) inputRef.current.focus()
                        }}
                    />
                </div>

                {/* Front Face - Prompt */}
                <Card className="w-full min-h-[16rem] flex flex-col items-center justify-center border-2 rounded-2xl bg-card shadow-sm p-8 relative overflow-hidden group">
                    <div className="w-full text-left mb-auto">
                        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">
                            {studyPair.promptLabel}
                        </span>
                    </div>
                    <CardContent className="p-4 sm:p-6 text-center w-full flex-1 overflow-y-auto max-h-[45vh] scrollbar-thin scrollbar-thumb-muted">
                        {(() => {
                            // Xóa thẻ input Anki gốc để tránh trùng lặp Input
                            let cleanHtml = promptHtml.replace(/<input[^>]*>/gi, '<span class="inline px-2 py-0 mx-1 bg-muted/50 rounded-md text-transparent border-b-2 border-primary/50">____</span>');

                            const rawText = cleanHtml.replace(/<[^>]+>/g, '').trim();
                            const isSuperLong = rawText.length > 100;
                            const isLongText = rawText.length > 40;

                            const sizeClass = isSuperLong ? 'text-xl sm:text-2xl' : isLongText ? 'text-2xl sm:text-3xl lg:text-4xl' : 'text-4xl sm:text-5xl lg:text-6xl';
                            const layoutClass = isSuperLong ? 'text-left' : 'text-center';

                            return (
                                <div className={`min-h-full w-full flex flex-col ${isSuperLong ? 'justify-start' : 'justify-center'}`}>
                                    <AnkiHtml className={`${sizeClass} ${layoutClass} font-medium text-foreground w-full leading-relaxed font-chinese break-words`} html={cleanHtml} />
                                </div>
                            )
                        })()}
                    </CardContent>
                    <div className="w-full mt-auto"></div>
                </Card>

                {/* Input Area */}
                <div className="w-full space-y-6">
                    <div className="relative w-full group flex flex-col gap-2">
                        <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase text-left w-full pl-2">
                            Nhập {studyPair.answerLabel}
                        </span>
                        <Input
                            ref={inputRef}
                            type="text"
                            className={`h-24 text-2xl sm:text-4xl px-6 rounded-xl bg-muted/30 border-2 focus-visible:ring-0 focus-visible:border-primary transition-all duration-300 shadow-sm font-chinese ${isRevealed
                                ? isCorrect
                                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                                    : 'border-destructive bg-destructive/10 text-destructive'
                                : 'border-border hover:border-border/80'
                                }`}
                            placeholder={`Gõ ${studyPair.answerLabel.toLowerCase()} vào đây...`}
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            onKeyDown={handleKeyDown}
                            disabled={isRevealed}
                            autoComplete="off"
                            autoCorrect="off"
                            spellCheck="false"
                        />
                    </div>

                    {!isRevealed ? (
                        <div className="flex gap-4">
                            <Button variant="outline" size="lg" className="w-1/3 h-14" onClick={handleShowAnswer}>
                                <Eye className="mr-2 h-4 w-4" /> Không nhớ
                            </Button>
                            <Button size="lg" className="w-2/3 h-14 text-lg" onClick={() => handleSubmit()}>
                                Kiểm tra
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                            {/* Show correct answer if wrong */}
                            {!isCorrect && (
                                <Card className="border-2 border-destructive/50 bg-card rounded-2xl shadow-sm overflow-hidden">
                                    <div className="bg-destructive/10 px-6 py-3 border-b border-destructive/20 flex items-center text-destructive gap-2">
                                        <XCircle className="h-5 w-5" />
                                        <span className="font-bold uppercase tracking-wider text-sm">Học lại thuật ngữ này</span>
                                    </div>
                                    <CardContent className="p-8 flex flex-col space-y-6">
                                        <div>
                                            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2 block">Đáp án đúng</span>
                                            <div className="text-3xl sm:text-4xl font-medium text-foreground font-chinese">{targetAnswer}</div>
                                        </div>
                                        <div>
                                            <span className="text-xs font-semibold tracking-wider text-muted-foreground uppercase mb-2 block">Bạn đã nói</span>
                                            <div className="text-2xl sm:text-3xl font-medium text-destructive line-through decoration-2 opacity-80 font-chinese">
                                                {inputValue || "Không có câu trả lời"}
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            {isCorrect && (
                                <Card className="border-2 border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 rounded-2xl shadow-sm">
                                    <CardContent className="p-6 flex items-center gap-4">
                                        <div className="h-12 w-12 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0">
                                            <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
                                        </div>
                                        <div>
                                            <h4 className="text-lg font-bold text-emerald-700 dark:text-emerald-400">Xuất sắc!</h4>
                                            <p className="text-emerald-600/80 dark:text-emerald-500 text-sm mb-2">Bạn đã gõ chính xác định nghĩa này.</p>
                                            <div className="text-xl sm:text-2xl font-medium text-foreground font-chinese opacity-80">{targetAnswer}</div>
                                        </div>
                                    </CardContent>
                                </Card>
                            )}

                            <Button size="lg" className="w-full h-14 text-lg bg-primary hover:bg-primary/90" onClick={handleContinue} disabled={isUpdating} autoFocus>
                                {isUpdating ? 'Đang lưu...' : 'Tiếp tục (Enter)'}
                            </Button>
                        </div>
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    )
}
