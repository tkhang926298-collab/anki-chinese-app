"use client"

import { useEffect, useState, Suspense, useMemo } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { ArrowLeft, Loader2, Sparkles, Settings2, BookOpen, Keyboard } from "lucide-react"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"

import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { createClient } from "@/lib/supabase/client"
import { db } from "@/lib/db/local"
import { FlashcardMode } from "@/components/study/flashcard-mode"
import { TypingMode } from "@/components/study/typing-mode"
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
    const [configMode, setConfigMode] = useState<'flashcard' | 'typing'>((mode as 'flashcard' | 'typing') || 'flashcard')
    const [configLimit, setConfigLimit] = useState<number>(20)
    const [configSwap, setConfigSwap] = useState(false)

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
            // CHỈ lấy meaning (Tiếng Việt), KHÔNG fallback sang pinyin!
            let meaning = parsed.meaning || "";
            // Nếu meaning trông giống Pinyin → bỏ qua
            if (meaning && isLikelyPinyin(meaning)) meaning = "";
            if (!meaning) return "";
            return meaning.length > 60 ? meaning.substring(0, 57) + '...' : meaning;
        };

        let correctMeaning = getCardMeaning(currentCard);
        // Nếu meaning TV rỗng → fallback sang pinyin CHỈ cho đáp án đúng
        if (!correctMeaning) {
            const parsed = parseCardFields(currentCard);
            correctMeaning = parsed.meaning || parsed.pinyin || "Đáp án";
        }
        // Tạo pool đáp án sai từ các thẻ khác trong deck
        const pool = allDueCards.filter((c: any) => c.id !== currentCard.id);
        const shuffled = [...pool].sort(() => Math.random() - 0.5);

        // Lấy 3 đáp án sai THỰC (chỉ Tiếng Việt, không Pinyin, không trùng)
        const distractors: { html: string; isCorrect: boolean }[] = [];
        const usedMeanings = new Set<string>(correctMeaning ? [correctMeaning.toLowerCase()] : []);

        for (const card of shuffled) {
            if (distractors.length >= 3) break;
            const meaning = getCardMeaning(card);
            if (!meaning) continue; // Bỏ qua thẻ không có nghĩa TV
            const meaningLower = meaning.toLowerCase();
            if (usedMeanings.has(meaningLower)) continue;

            usedMeanings.add(meaningLower);
            distractors.push({ html: meaning, isCorrect: false });
        }

        // Fallback nếu không đủ 3 đáp án sai
        const fallbackOptions = ["Đáp án khác", "Không đúng", "Lựa chọn khác"];
        while (distractors.length < 3) {
            distractors.push({ html: fallbackOptions[distractors.length] || "Sai", isCorrect: false });
        }

        return [
            { html: correctMeaning, isCorrect: true },
            ...distractors
        ].sort(() => Math.random() - 0.5);
    }, [currentCard, allDueCards])

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
            // Finished session
            setCards([])
        }
    }

    const startSession = () => {
        setCards(allDueCards.slice(0, configLimit))
        setIsConfiguring(false)
        setCurrentIndex(0)
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
            <div className="container py-20 max-w-2xl flex flex-col items-center justify-center text-center space-y-6">
                <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="h-24 w-24 rounded-full bg-emerald-100 flex items-center justify-center mb-4">
                    <Sparkles className="h-12 w-12 text-emerald-600" />
                </motion.div>
                <h1 className="text-3xl font-bold tracking-tight">Tuyệt vời!</h1>
                <p className="text-xl text-muted-foreground">
                    Bạn đã hoàn thành phiên học hôm nay.
                </p>
                <div className="flex gap-4 mt-8">
                    <Button variant="outline" size="lg" onClick={() => { setIsConfiguring(true); setCards([]); }}>Học tiếp</Button>
                    <Link href="/dashboard">
                        <Button size="lg">Quay lại</Button>
                    </Link>
                </div>
            </div>
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
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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
                            <span>{currentIndex + 1} / {cards.length}</span>
                        </div>
                        <Progress value={progressPercent} className="h-2" />
                    </div>
                </div>
            </div>

            <div className="flex-1 container mx-auto max-w-4xl py-8 flex flex-col justify-center">
                {configMode === 'typing' ? (
                    <TypingMode
                        card={currentCard}
                        onNext={handleNextCard}
                    />
                ) : (
                    <FlashcardMode
                        card={currentCard}
                        choices={dummyChoices}
                        onNext={handleNextCard}
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
