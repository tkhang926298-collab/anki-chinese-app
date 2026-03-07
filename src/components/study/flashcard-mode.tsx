"use client"

import { useState, useEffect } from "react"
import { CheckCircle2, XCircle, Volume2, PenSquare } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AnkiHtml } from "./anki-html"
import { calculateNextReview, Rating, CardState } from "@/lib/fsrs/scheduler"
import { db } from "@/lib/db/local"
import { toast } from "sonner"
import { parseCardFields } from "@/lib/parse-card-fields"
import { SentenceComposerModal } from "./sentence-composer-modal"
import { HanziWriterModal } from "./hanzi-writer-modal"
import { useTTS } from "@/hooks/use-tts"

interface Choice {
    html: string
    isCorrect: boolean
    pinyin?: string
}

interface FlashcardModeProps {
    card: any
    choices: Choice[]
    onNext: () => void
    onResult?: (isCorrect: boolean) => void
    swapPrompt?: { meaning: string; pinyin: string } | null
    pinyin?: string
}

export function FlashcardMode({ card, choices, onNext, onResult, swapPrompt, pinyin }: FlashcardModeProps) {
    const [selectedChoice, setSelectedChoice] = useState<Choice | null>(null)
    const [isUpdating, setIsUpdating] = useState(false)
    const [showComposer, setShowComposer] = useState(false)
    const [showHanziWriter, setShowHanziWriter] = useState(false)

    // Web Speech API wrapper
    const { speak, isSpeaking } = useTTS()

    // Extract parsed fields for the composer
    const parsed = parseCardFields(card)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isUpdating) return;

            if (selectedChoice) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    handleContinue();
                }
            } else {
                if (e.key >= '1' && e.key <= '4') {
                    e.preventDefault();
                    const index = parseInt(e.key) - 1;
                    if (index >= 0 && index < choices.length) {
                        handleSelect(choices[index]);
                    }
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [selectedChoice, isUpdating, choices]);

    const handleSelect = async (choice: Choice) => {
        if (selectedChoice || isUpdating) return // Prevent multiple clicks
        setSelectedChoice(choice)
        setIsUpdating(true)

        if (choice.isCorrect) {
            import('@/lib/utils').then(({ playTingSound }) => playTingSound())
        }

        // Report result to parent
        onResult?.(choice.isCorrect)

        try {
            const rating: Rating = choice.isCorrect ? 'good' : 'again'

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

            // Update Card: Check if it exists (for System Decks shadow copy)
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

            const existingCard = await db.cards.get(card.id)
            if (existingCard) {
                await db.cards.update(card.id, cardUpdateData)
            } else {
                await db.cards.add({ ...card, ...cardUpdateData })
            }

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
            // Không auto-advance nữa, bất kể đúng hay sai đều mở block cho User tự nhấn Tiếp Tục (Enter)
            setIsUpdating(false)
        }
    }

    const handleContinue = () => {
        setIsUpdating(false)
        setSelectedChoice(null)
        setShowComposer(false)
        onNext()
    }

    return (
        <div className="w-full flex flex-col items-center max-w-4xl mx-auto space-y-10">
            {/* Question Face */}
            <Card className="w-full min-h-[20rem] flex flex-col items-center justify-center border-2 rounded-3xl bg-card shadow-sm p-8 relative overflow-hidden group">
                <div className="w-full flex items-center justify-between mb-auto">
                    <span className="text-sm font-bold tracking-wider text-muted-foreground uppercase opacity-80">
                        {swapPrompt ? 'Nghĩa' : 'Thuật ngữ'}
                    </span>
                    {!swapPrompt && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                const text = card.front_html?.replace(/<[^>]*>/g, '').trim()
                                if (text) speak(text)
                            }}
                            className={`p-2 rounded-xl transition-colors ${isSpeaking ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:bg-muted/80 hover:text-primary'}`}
                            title="Phát âm"
                        >
                            <Volume2 className={`h-5 w-5 ${isSpeaking ? 'animate-pulse' : ''}`} />
                        </button>
                    )}
                </div>
                <CardContent className="p-0 text-center w-full flex-1 flex flex-col justify-center items-center mt-2">
                    {swapPrompt ? (
                        <div className="space-y-3">
                            <p className="text-3xl sm:text-4xl lg:text-5xl font-medium text-foreground leading-relaxed">{swapPrompt.meaning || 'Không có nghĩa'}</p>
                            {swapPrompt.pinyin && <p className="text-xl text-muted-foreground italic">{swapPrompt.pinyin}</p>}
                        </div>
                    ) : (
                        <div className="space-y-3 w-full">
                            <AnkiHtml className="text-5xl sm:text-6xl lg:text-7xl font-medium text-foreground w-full leading-tight font-chinese" html={card.front_html} />
                            {pinyin && <p className="text-lg sm:text-xl text-muted-foreground italic">{pinyin}</p>}
                        </div>
                    )}
                </CardContent>
                <div className="w-full mt-auto"></div>
            </Card>

            {/* Answer Buttons */}
            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                {choices.map((choice, idx) => {
                    let btnClass = "min-h-[6rem] h-auto flex gap-4 w-full items-center text-left whitespace-normal p-6 rounded-2xl border-2 transition-all duration-200"

                    if (selectedChoice) {
                        if (choice.isCorrect) {
                            btnClass += " border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400"
                        } else if (selectedChoice === choice && !choice.isCorrect) {
                            btnClass += " border-destructive bg-destructive/10 text-destructive dark:bg-destructive/20"
                        } else {
                            btnClass += " border-border/50 bg-card opacity-40 cursor-not-allowed"
                        }
                    } else {
                        btnClass += " border-border bg-card hover:bg-muted/50 hover:border-border/80 text-foreground shadow-sm"
                    }

                    return (
                        <button
                            key={idx}
                            className={btnClass}
                            style={{ height: "auto" }}
                            onClick={() => handleSelect(choice)}
                            disabled={selectedChoice !== null || isUpdating}
                        >
                            <div className="flex-1 flex items-center gap-4">
                                <span className="flex items-center justify-center w-8 h-8 rounded-md bg-muted/50 text-muted-foreground font-mono text-sm font-bold border shrink-0">
                                    {idx + 1}
                                </span>
                                <div className="flex flex-col">
                                    <span className={`font-medium leading-relaxed block ${swapPrompt ? 'text-3xl sm:text-4xl font-chinese' : 'text-xl sm:text-2xl'}`}>
                                        {choice.html}
                                    </span>
                                    {choice.pinyin && (
                                        <span className="text-sm text-muted-foreground italic mt-1">{choice.pinyin}</span>
                                    )}
                                </div>
                            </div>

                            {selectedChoice && choice.isCorrect && (
                                <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0">
                                    <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                                </div>
                            )}
                            {selectedChoice === choice && !choice.isCorrect && (
                                <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center flex-shrink-0">
                                    <XCircle className="h-5 w-5 text-destructive" />
                                </div>
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Next Step Action */}
            <div className={`transition-all duration-300 w-full flex flex-col gap-3 ${selectedChoice ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'}`}>
                <div className="flex gap-3">
                    <Button
                        variant="outline"
                        size="lg"
                        className="h-16 px-6 rounded-2xl border-2 text-sm font-semibold flex items-center gap-2 flex-shrink-0"
                        onClick={() => setShowHanziWriter(true)}
                        disabled={isUpdating}
                        title="Luyện viết chữ Hán"
                    >
                        <PenSquare className="h-5 w-5" />
                        <span className="hidden sm:inline">Luyện viết</span>
                    </Button>
                    <Button
                        variant="outline"
                        size="lg"
                        className="h-16 px-6 rounded-2xl border-2 text-sm font-semibold flex items-center gap-2 flex-shrink-0"
                        onClick={() => setShowComposer(true)}
                        disabled={isUpdating}
                        title="Đặt câu với từ này để luyện tập thêm"
                    >
                        <PenSquare className="h-5 w-5" />
                        <span className="hidden sm:inline">Đặt câu</span>
                    </Button>
                    <Button size="lg" className="flex-1 h-16 text-xl font-semibold bg-primary hover:bg-primary/90 rounded-2xl shadow-md" onClick={handleContinue} disabled={isUpdating}>
                        {isUpdating ? 'Đang lưu...' : 'Tiếp tục (Enter)'}
                    </Button>
                </div>
            </div>

            {/* Sentence Composer Modal */}
            <SentenceComposerModal
                open={showComposer}
                onClose={() => setShowComposer(false)}
                hanzi={parsed.hanzi || card.front_html?.replace(/<[^>]*>/g, '').trim() || ''}
                pinyin={parsed.pinyin || pinyin}
                meaning={parsed.meaning}
                cardId={card.id}
                userId={card.user_id}
            />

            {/* Hanzi Writer Modal */}
            <HanziWriterModal
                isOpen={showHanziWriter}
                onClose={() => setShowHanziWriter(false)}
                character={(parsed.hanzi || card.front_html?.replace(/<[^>]*>/g, '').trim() || '')[0] || ''} // Lấy kí tự đầu tiên
            />
        </div>
    )
}
