"use client"

import { useEffect, useState, Suspense, useMemo } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Sparkles, Settings2, BookOpen, Keyboard, CheckCircle2, XCircle, ArrowLeftRight, Puzzle } from "lucide-react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { createClient } from "@/lib/supabase/client"
import { db } from "@/lib/db/local"
import { FlashcardMode } from "@/components/study/flashcard-mode"
import { TypingMode } from "@/components/study/typing-mode"
import { MatchingMode } from "@/components/study/matching-mode"
import { SessionSummary } from "@/components/study/session-summary"
import { parseCardFields } from "@/lib/parse-card-fields"

export const dynamic = 'force-dynamic'

function StudyPageContent() {
    const params = useParams()
    const searchParams = useSearchParams()
    const router = useRouter()
    const supabase = createClient()

    const deckId = params.deckId as string
    const mode = searchParams.get('mode') || 'flashcard'
    const isSystem = searchParams.get('isSystem') === 'true'

    const [cards, setCards] = useState<any[]>([])
    const [allDueCards, setAllDueCards] = useState<any[]>([])
    const [currentIndex, setCurrentIndex] = useState(0)
    const [isLoading, setIsLoading] = useState(true)

    // Configuration states
    const [isConfiguring, setIsConfiguring] = useState(true)
    const [configMode, setConfigMode] = useState<'flashcard' | 'typing' | 'matching'>((mode as 'flashcard' | 'typing' | 'matching') || 'flashcard')
    const [configLimit, setConfigLimit] = useState<number>(20)
    const [configSwap, setConfigSwap] = useState(false)

    // Session tracking
    const [correctCount, setCorrectCount] = useState(0)
    const [wrongCount, setWrongCount] = useState(0)
    const [sessionStartTime, setSessionStartTime] = useState<number>(0)

    const currentCard = cards[currentIndex]

    // Sinh bộ đáp án ngẫu nhiên lấy từ kho các thẻ còn lại
    const dummyChoices = useMemo(() => {
        if (!currentCard) return [] as any[];

        // Trích xuất CHỈ nghĩa Tiếng Việt (KHÔNG lấy Pinyin) cho Flashcard
        const hasPinyinTones = (text: string) => /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(text);
        const isLikelyPinyin = (text: string) => {
            if (hasPinyinTones(text)) return true;
            // Pinyin thuần Latin ngắn + có số thanh: "bai2", "xia4"
            if (/^[a-zA-Z\s\d,'·\-]+$/.test(text) && text.length < 30) return true;
            return false;
        };

        const getCardMeaning = (card: any): string => {
            if (!card) return "";
            const parsed = parseCardFields(card);
            let meaning = parsed.meaning || "";
            if (meaning && isLikelyPinyin(meaning)) meaning = "";
            if (!meaning) return "";
            return meaning.length > 60 ? meaning.substring(0, 57) + '...' : meaning;
        };

        const getCardHanzi = (card: any): string => {
            if (!card) return "";
            const parsed = parseCardFields(card);
            return parsed.hanzi || card.front_html?.replace(/<[^>]*>/g, '').trim() || "";
        };

        // Đảo chiều: khi swap thì choices = Hanzi, câu hỏi = Meaning
        if (configSwap) {
            const correctHanzi = getCardHanzi(currentCard);
            if (!correctHanzi) return [];

            const pool = allDueCards.filter((c: any) => c.id !== currentCard.id);
            const shuffled = [...pool].sort(() => Math.random() - 0.5);
            const distractors: { html: string; isCorrect: boolean }[] = [];
            const usedHanzi = new Set<string>([correctHanzi]);

            for (const c of shuffled) {
                if (distractors.length >= 3) break;
                const hanzi = getCardHanzi(c);
                if (!hanzi || usedHanzi.has(hanzi)) continue;
                usedHanzi.add(hanzi);
                distractors.push({ html: hanzi, isCorrect: false });
            }
            while (distractors.length < 3) {
                distractors.push({ html: ["其他", "不对", "别的"][distractors.length] || "错", isCorrect: false });
            }
            return [{ html: correctHanzi, isCorrect: true }, ...distractors].sort(() => Math.random() - 0.5);
        }

        // Chiều bình thường: choices = Meaning
        let correctMeaning = getCardMeaning(currentCard);
        if (!correctMeaning) {
            const parsed = parseCardFields(currentCard);
            correctMeaning = parsed.meaning || parsed.pinyin || "Đáp án";
        }
        const pool = allDueCards.filter((c: any) => c.id !== currentCard.id);
        const shuffled = [...pool].sort(() => Math.random() - 0.5);
        const distractors: { html: string; isCorrect: boolean }[] = [];
        const usedMeanings = new Set<string>(correctMeaning ? [correctMeaning.toLowerCase()] : []);

        for (const card of shuffled) {
            if (distractors.length >= 3) break;
            const meaning = getCardMeaning(card);
            if (!meaning) continue;
            const meaningLower = meaning.toLowerCase();
            if (usedMeanings.has(meaningLower)) continue;
            usedMeanings.add(meaningLower);
            distractors.push({ html: meaning, isCorrect: false });
        }

        const fallbackOptions = ["Đáp án khác", "Không đúng", "Lựa chọn khác"];
        while (distractors.length < 3) {
            distractors.push({ html: fallbackOptions[distractors.length] || "Sai", isCorrect: false });
        }

        return [
            { html: correctMeaning, isCorrect: true },
            ...distractors
        ].sort(() => Math.random() - 0.5);
    }, [currentCard, allDueCards, configSwap])

    // Tạo prompt cho flashcard khi đảo chiều
    const swappedPrompt = useMemo(() => {
        if (!configSwap || !currentCard) return null;
        const parsed = parseCardFields(currentCard);
        const meaning = parsed.meaning || "";
        const pinyin = parsed.pinyin || "";
        return { meaning, pinyin };
    }, [currentCard, configSwap])

    // Load cards due for today
    useEffect(() => {
        async function loadDueCards() {
            try {
                const { data: { user } } = await supabase.auth.getUser()
                const userId = user?.id

                const now = new Date().toISOString()
                let dueCards: any[] = []

                if (isSystem) {
                    // Chế độ Remote Database cho HSK System Decks
                    // Vì System DB áp dụng chung cho mọi user, trạng thái Review sẽ phải load từ bảng riêng `learning_logs` 
                    // Tạm thời Load thẻ New (lấy 1000 thẻ ngẫu nhiên làm quỹ bài học)
                    const { data: dbCards, error } = await supabase
                        .from('cards')
                        .select('*')
                        .eq('deck_id', deckId)
                        .limit(500)

                    if (dbCards) {
                        dueCards = dbCards.map((c: any) => ({
                            ...c,
                            state: 'new' // Mock default
                        }))
                    }
                } else {
                    // Chế độ Offline cho User Decks
                    const allDeckCards = await db.cards.where('deck_id').equals(deckId).toArray()
                    // Lọc thẻ New, Learning, Review đến hạn
                    dueCards = allDeckCards.filter(c => {
                        if (userId && c.user_id !== userId) return false
                        if (c.state === 'new' || c.state === 'learning' || c.state === 'relearning') return true
                        if (c.state === 'review' && c.due && c.due <= now) return true
                        return false
                    })
                }

                dueCards.sort((a, b) => {
                    if (!a.due && b.due) return -1;
                    if (a.due && !b.due) return 1;
                    if (!a.due && !b.due) return 0;
                    return (a.due as string) < (b.due as string) ? -1 : 1;
                })

                setAllDueCards(dueCards)
            } catch (error) {
                console.error("Error fetching cards:", error)
            } finally {
                setIsLoading(false)
            }
        }

        if (deckId) loadDueCards()
    }, [deckId, router, supabase])

    const handleNextCard = () => {
        if (currentIndex < cards.length - 1) {
            setCurrentIndex(prev => prev + 1)
        } else {
            // Finished session - go to summary (don't clear cards so summary can use length)
            setCurrentIndex(cards.length)
        }
    }

    // Callback from FlashcardMode/TypingMode to track correct/wrong
    const handleResult = (isCorrect: boolean) => {
        if (isCorrect) setCorrectCount(prev => prev + 1)
        else setWrongCount(prev => prev + 1)
    }

    const startSession = () => {
        setCards(allDueCards.slice(0, configLimit))
        setIsConfiguring(false)
        setCurrentIndex(0)
        setCorrectCount(0)
        setWrongCount(0)
        setSessionStartTime(Date.now())
    }

    if (isLoading) {
        return (
            <div className="flex h-screen w-full items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    const isSessionFinished = cards.length === 0 || currentIndex >= cards.length

    if (isSessionFinished && !isConfiguring) {
        return (
            <SessionSummary
                totalCards={cards.length}
                correctCount={correctCount}
                wrongCount={wrongCount}
                sessionDurationMs={Date.now() - sessionStartTime}
                onStudyMore={() => { setIsConfiguring(true); setCards([]); }}
            />
        )
    }

    if (isConfiguring) {
        if (allDueCards.length === 0) {
            return (
                <div className="container py-20 max-w-2xl flex flex-col items-center justify-center text-center space-y-6">
                    <div className="h-24 w-24 rounded-full bg-blue-100 flex items-center justify-center mb-4">
                        <Sparkles className="h-12 w-12 text-blue-600" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Hoàn tất!</h1>
                    <p className="text-xl text-muted-foreground">Không còn thẻ nào cần ôn tập lúc này.</p>
                    <Link href="/dashboard"><Button size="lg" className="mt-8">Quay lại Dashboard</Button></Link>
                </div>
            )
        }

        return (
            <AnimatePresence>
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="container mx-auto max-w-2xl py-12 flex flex-col relative">
                    <Button variant="ghost" className="absolute top-8 left-4" onClick={() => router.push('/dashboard')}>
                        <ArrowLeft className="h-5 w-5 mr-2" /> Trở về
                    </Button>

                    <div className="text-center mb-10 mt-8">
                        <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 mb-4">
                            <Settings2 className="h-8 w-8 text-primary" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight">Cấu hình Phiên học</h1>
                        <p className="text-muted-foreground mt-2">Có {allDueCards.length} thẻ đang chờ bạn ôn tập.</p>
                    </div>

                    <div className="bg-card border shadow-sm rounded-2xl p-6 sm:p-10 space-y-10">
                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">1. Chọn phương thức học</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                <button
                                    onClick={() => setConfigMode('flashcard')}
                                    className={`flex flex-col items-center p-6 border-2 rounded-xl transition-all ${configMode === 'flashcard' ? 'border-primary bg-primary/5 shadow-md text-primary' : 'border-border hover:border-primary/50 text-muted-foreground hover:bg-muted/50'}`}
                                >
                                    <BookOpen className="h-8 w-8 mb-3" />
                                    <span className="font-semibold">Flashcard</span>
                                    <span className="text-xs mt-1 opacity-80">Lật thẻ truyền thống</span>
                                </button>
                                <button
                                    onClick={() => setConfigMode('typing')}
                                    className={`flex flex-col items-center p-6 border-2 rounded-xl transition-all ${configMode === 'typing' ? 'border-primary bg-primary/5 shadow-md text-primary' : 'border-border hover:border-primary/50 text-muted-foreground hover:bg-muted/50'}`}
                                >
                                    <Keyboard className="h-8 w-8 mb-3" />
                                    <span className="font-semibold">Luyện Gõ</span>
                                    <span className="text-xs mt-1 opacity-80">Gõ đáp án chính xác</span>
                                </button>
                                <button
                                    onClick={() => setConfigMode('matching')}
                                    className={`flex flex-col items-center p-6 border-2 rounded-xl transition-all ${configMode === 'matching' ? 'border-primary bg-primary/5 shadow-md text-primary' : 'border-border hover:border-primary/50 text-muted-foreground hover:bg-muted/50'}`}
                                >
                                    <Puzzle className="h-8 w-8 mb-3" />
                                    <span className="font-semibold">Ghép Cặp</span>
                                    <span className="text-xs mt-1 opacity-80">Nối Hán tự ↔ Nghĩa</span>
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <h3 className="font-semibold text-lg">2. Số lượng thẻ</h3>
                            <div className="flex flex-wrap gap-3">
                                {[10, 20, 50, 100].map(num => (
                                    <button
                                        key={num}
                                        disabled={num > allDueCards.length && num !== 10}
                                        onClick={() => setConfigLimit(num)}
                                        className={`px-6 py-3 rounded-xl border-2 font-medium transition-all ${configLimit === num ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'} disabled:opacity-40 disabled:cursor-not-allowed`}
                                    >
                                        {num} thẻ
                                    </button>
                                ))}
                                <button
                                    onClick={() => setConfigLimit(allDueCards.length)}
                                    className={`px-6 py-3 rounded-xl border-2 font-medium transition-all ${configLimit === allDueCards.length ? 'border-primary bg-primary/10 text-primary' : 'border-border hover:border-primary/40'}`}
                                >
                                    Tất cả phần còn lại
                                </button>
                            </div>
                        </div>

                        {configMode === 'flashcard' && (
                            <div className="space-y-4">
                                <h3 className="font-semibold text-lg">3. Chiều học</h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setConfigSwap(false)}
                                        className={`flex flex-col items-center p-5 border-2 rounded-xl transition-all ${!configSwap ? 'border-primary bg-primary/5 shadow-md text-primary' : 'border-border hover:border-primary/50 text-muted-foreground hover:bg-muted/50'}`}
                                    >
                                        <span className="text-2xl mb-2">字 → 🇻🇳</span>
                                        <span className="font-semibold text-sm">Hán tự → Nghĩa</span>
                                    </button>
                                    <button
                                        onClick={() => setConfigSwap(true)}
                                        className={`flex flex-col items-center p-5 border-2 rounded-xl transition-all ${configSwap ? 'border-primary bg-primary/5 shadow-md text-primary' : 'border-border hover:border-primary/50 text-muted-foreground hover:bg-muted/50'}`}
                                    >
                                        <span className="text-2xl mb-2">🇻🇳 → 字</span>
                                        <span className="font-semibold text-sm">Nghĩa → Hán tự</span>
                                    </button>
                                </div>
                            </div>
                        )}


                        <Button size="lg" className="w-full h-14 text-lg font-bold rounded-xl mt-8" onClick={startSession}>
                            Bắt đầu ôn tập 🚀
                        </Button>
                    </div>
                </motion.div>
            </AnimatePresence>
        )
    }

    const progressPercent = cards.length > 0 ? ((currentIndex) / cards.length) * 100 : 0

    return (
        <div className="flex flex-col min-h-[calc(100vh-3.5rem)] relative">
            <div className="sticky top-0 z-10 bg-background/95 backdrop-blur py-4 border-b">
                <div className="container mx-auto max-w-4xl flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')}>
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-sm font-medium">
                            <span className="text-muted-foreground">Tiến độ phiên học</span>
                            <div className="flex items-center gap-3">
                                {correctCount > 0 && <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" />{correctCount}</span>}
                                {wrongCount > 0 && <span className="flex items-center gap-1 text-red-500"><XCircle className="h-3.5 w-3.5" />{wrongCount}</span>}
                                <span>{currentIndex + 1} / {cards.length}</span>
                            </div>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                    </div>
                    {/* Keyboard shortcuts help */}
                    <div className="relative group">
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
                            <span className="text-xs font-bold">⌨</span>
                        </Button>
                        <div className="absolute right-0 top-full mt-2 w-56 bg-popover border shadow-xl rounded-xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                            <p className="text-xs font-bold mb-2 text-foreground">Phím tắt</p>
                            <div className="space-y-1.5 text-xs text-muted-foreground">
                                <div className="flex justify-between"><span>Chọn đáp án</span><span className="font-mono bg-muted px-1.5 rounded">1-4</span></div>
                                <div className="flex justify-between"><span>Tiếp tục</span><span className="font-mono bg-muted px-1.5 rounded">Enter</span></div>
                                <div className="flex justify-between"><span>Xem đáp án</span><span className="font-mono bg-muted px-1.5 rounded">Ctrl+H</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="flex-1 container mx-auto max-w-4xl py-8 flex flex-col justify-center">
                {configMode === 'matching' ? (
                    <MatchingMode
                        cards={cards}
                        onFinish={(timeMs, attempts) => {
                            setCurrentIndex(cards.length)
                        }}
                    />
                ) : configMode === 'typing' ? (
                    <TypingMode
                        card={currentCard}
                        onNext={handleNextCard}
                        onResult={handleResult}
                    />
                ) : (
                    <FlashcardMode
                        card={currentCard}
                        choices={dummyChoices}
                        onNext={handleNextCard}
                        onResult={handleResult}
                        swapPrompt={swappedPrompt}
                    />
                )}
            </div>
        </div>
    )
}

export default function StudyPage() {
    return (
        <Suspense fallback={<div className="flex h-screen w-full items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>}>
            <StudyPageContent />
        </Suspense>
    )
}
