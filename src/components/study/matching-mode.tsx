"use client"

import { useState, useEffect, useMemo } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Timer, RotateCcw, Trophy, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { parseCardFields } from "@/lib/parse-card-fields"

interface MatchingModeProps {
    cards: any[]
    onFinish: (timeMs: number, attempts: number) => void
}

interface MatchItem {
    id: string
    text: string
    type: "hanzi" | "meaning"
    cardId: string
    matched: boolean
}

export function MatchingMode({ cards, onFinish }: MatchingModeProps) {
    const PAIR_COUNT = Math.min(6, cards.length)

    // Tạo danh sách cặp Hanzi ↔ Meaning từ cards
    const pairs = useMemo(() => {
        const selected = [...cards].sort(() => Math.random() - 0.5).slice(0, PAIR_COUNT)

        const items: MatchItem[] = []
        for (const card of selected) {
            const parsed = parseCardFields(card)
            const hanzi = parsed.hanzi || card.front_html?.replace(/<[^>]*>/g, '').trim() || ""
            const meaning = parsed.meaning || parsed.pinyin || ""
            if (!hanzi || !meaning) continue

            items.push({ id: `h-${card.id}`, text: hanzi, type: "hanzi", cardId: card.id, matched: false })
            items.push({ id: `m-${card.id}`, text: meaning.length > 25 ? meaning.substring(0, 22) + '...' : meaning, type: "meaning", cardId: card.id, matched: false })
        }
        return items
    }, [cards, PAIR_COUNT])

    const [items, setItems] = useState<MatchItem[]>([])
    const [selected, setSelected] = useState<MatchItem | null>(null)
    const [attempts, setAttempts] = useState(0)
    const [startTime] = useState(Date.now())
    const [elapsed, setElapsed] = useState(0)
    const [shakeId, setShakeId] = useState<string | null>(null)

    // Shuffle on mount
    useEffect(() => {
        // Tách thành 2 cột: hanzi bên trái, meaning bên phải
        const hanziItems = pairs.filter(p => p.type === "hanzi").sort(() => Math.random() - 0.5)
        const meaningItems = pairs.filter(p => p.type === "meaning").sort(() => Math.random() - 0.5)
        setItems([...hanziItems, ...meaningItems])
    }, [pairs])

    // Timer
    useEffect(() => {
        const matched = items.filter(i => i.matched).length
        if (matched === items.length && items.length > 0) return

        const interval = setInterval(() => {
            setElapsed(Date.now() - startTime)
        }, 100)
        return () => clearInterval(interval)
    }, [startTime, items])

    const allMatched = items.length > 0 && items.every(i => i.matched)

    // Handle click
    const handleClick = (item: MatchItem) => {
        if (item.matched) return

        if (!selected) {
            setSelected(item)
            return
        }

        // Nếu click lại chính nó → bỏ chọn
        if (selected.id === item.id) {
            setSelected(null)
            return
        }

        setAttempts(prev => prev + 1)

        // Check match: cùng cardId nhưng khác type
        if (selected.cardId === item.cardId && selected.type !== item.type) {
            // ✅ Match!
            setItems(prev => prev.map(i =>
                i.cardId === item.cardId ? { ...i, matched: true } : i
            ))
            setSelected(null)

            // Check if all matched
            const remaining = items.filter(i => !i.matched && i.cardId !== item.cardId)
            if (remaining.length === 0) {
                setTimeout(() => onFinish(Date.now() - startTime, attempts + 1), 500)
            }
        } else {
            // ❌ Wrong
            setShakeId(item.id)
            setTimeout(() => {
                setShakeId(null)
                setSelected(null)
            }, 400)
        }
    }

    const formatTime = (ms: number) => {
        const seconds = Math.floor(ms / 1000)
        const minutes = Math.floor(seconds / 60)
        const secs = seconds % 60
        return `${minutes}:${secs.toString().padStart(2, '0')}`
    }

    const hanziItems = items.filter(i => i.type === "hanzi")
    const meaningItems = items.filter(i => i.type === "meaning")

    if (allMatched) {
        return (
            <div className="flex flex-col items-center justify-center text-center space-y-6 py-12">
                <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring" }} className="h-24 w-24 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 dark:from-amber-900/40 dark:to-amber-800/40 flex items-center justify-center shadow-lg">
                    <Trophy className="h-12 w-12 text-amber-600" />
                </motion.div>
                <h2 className="text-3xl font-bold">Hoàn thành!</h2>
                <div className="flex gap-6 text-lg">
                    <div className="flex items-center gap-2"><Timer className="h-5 w-5 text-primary" /> {formatTime(elapsed)}</div>
                    <div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /> {attempts} lần thử</div>
                </div>
                <Button size="lg" className="rounded-xl" onClick={() => onFinish(elapsed, attempts)}>
                    Tiếp tục
                </Button>
            </div>
        )
    }

    return (
        <div className="w-full max-w-4xl mx-auto space-y-6">
            {/* Timer bar */}
            <div className="flex items-center justify-between text-sm text-muted-foreground bg-muted/30 rounded-xl px-4 py-2.5 border">
                <div className="flex items-center gap-2 font-medium">
                    <Timer className="h-4 w-4" />
                    <span className="tabular-nums">{formatTime(elapsed)}</span>
                </div>
                <div className="flex items-center gap-4">
                    <span>Đã ghép: {items.filter(i => i.matched).length / 2} / {items.length / 2}</span>
                    <span>Lần thử: {attempts}</span>
                </div>
            </div>

            {/* Match Grid: 2 columns */}
            <div className="grid grid-cols-2 gap-4 sm:gap-6">
                {/* Hanzi column */}
                <div className="space-y-3">
                    <AnimatePresence>
                        {hanziItems.map(item => (
                            <motion.button
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{
                                    opacity: item.matched ? 0.4 : 1,
                                    scale: item.matched ? 0.95 : 1,
                                    x: shakeId === item.id ? [0, -8, 8, -8, 0] : 0,
                                }}
                                transition={{ duration: 0.2 }}
                                onClick={() => handleClick(item)}
                                disabled={item.matched}
                                className={`w-full min-h-[4.5rem] p-4 rounded-2xl border-2 text-center font-chinese transition-all ${item.matched
                                        ? 'border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 line-through'
                                        : selected?.id === item.id
                                            ? 'border-primary bg-primary/10 shadow-lg scale-[1.02]'
                                            : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50 shadow-sm'
                                    }`}
                            >
                                <span className="text-2xl sm:text-3xl font-medium">{item.text}</span>
                            </motion.button>
                        ))}
                    </AnimatePresence>
                </div>

                {/* Meaning column */}
                <div className="space-y-3">
                    <AnimatePresence>
                        {meaningItems.map(item => (
                            <motion.button
                                key={item.id}
                                layout
                                initial={{ opacity: 0, scale: 0.8 }}
                                animate={{
                                    opacity: item.matched ? 0.4 : 1,
                                    scale: item.matched ? 0.95 : 1,
                                    x: shakeId === item.id ? [0, -8, 8, -8, 0] : 0,
                                }}
                                transition={{ duration: 0.2 }}
                                onClick={() => handleClick(item)}
                                disabled={item.matched}
                                className={`w-full min-h-[4.5rem] p-4 rounded-2xl border-2 text-center transition-all ${item.matched
                                        ? 'border-emerald-500/50 bg-emerald-50/50 dark:bg-emerald-950/20 line-through'
                                        : selected?.id === item.id
                                            ? 'border-primary bg-primary/10 shadow-lg scale-[1.02]'
                                            : 'border-border bg-card hover:border-primary/50 hover:bg-muted/50 shadow-sm'
                                    }`}
                            >
                                <span className="text-base sm:text-lg font-medium">{item.text}</span>
                            </motion.button>
                        ))}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    )
}
