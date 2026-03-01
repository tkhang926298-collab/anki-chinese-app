"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { BookOpen, Clock, Plus, Target, TrendingUp, UploadCloud, Trash2, Tag, Flame, Search, CheckCircle2 } from "lucide-react"
import { toast } from "sonner"

import { useLiveQuery } from "dexie-react-hooks"
import { db } from "@/lib/db/local"
import { Button } from "@/components/ui/button"
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { createClient } from "@/lib/supabase/client"
import { seedHskDatabase } from "@/lib/seed-db"

export default function DashboardContent() {
    const [isLoading, setIsLoading] = useState(true)
    const [isSeeding, setIsSeeding] = useState(false)
    const [systemDecks, setSystemDecks] = useState<any[]>([])
    const [searchQuery, setSearchQuery] = useState('')

    // Fetch System Decks from Supabase
    useEffect(() => {
        async function fetchSystemDecks() {
            try {
                const SYSTEM_DECK_IDS = [
                    '00000000-0000-4000-8000-000000000000',
                    '00000000-0000-4000-8000-000000000001',
                    '00000000-0000-4000-8000-000000000002',
                    '00000000-0000-4000-8000-000000000003',
                    '00000000-0000-4000-8000-000000000004',
                    '00000000-0000-4000-8000-000000000005',
                    '00000000-0000-4000-8000-000000000006'
                ]
                const supabase = createClient()
                // Lấy 7 Deck HSK System
                const { data: bgDecks, error } = await supabase
                    .from('decks')
                    .select('*')
                    .in('id', SYSTEM_DECK_IDS)

                if (bgDecks && bgDecks.length > 0) {
                    // Do thẻ DB hệ thống rất lớn (4994 thẻ), việc join bảng Card bằng Supabase PostgREST 
                    // có thể chậm. Tạm thời fetch số lượng thẻ cơ bản hoặc dùng Count. 
                    const enrichedSystemDecks = await Promise.all(bgDecks.map(async (d: any) => {
                        const { count: totalCards } = await supabase
                            .from('cards')
                            .select('*', { count: 'exact', head: true })
                            .eq('deck_id', d.id)

                        // Tính toán stats dựa trên dữ liệu (shadow copy) tại máy client (nếu có)
                        const localLearnedCards = await db.cards.where('deck_id').equals(d.id).toArray()

                        const learningCards = localLearnedCards.filter(c => c.state === 'learning' || c.state === 'relearning').length
                        const reviewCards = localLearnedCards.filter(c => c.state === 'review' && c.due && c.due <= new Date().toISOString()).length
                        const newCards = (totalCards || 0) - localLearnedCards.length + localLearnedCards.filter(c => c.state === 'new').length

                        return {
                            ...d,
                            displayName: d.name,
                            parentDeck: "System Data",
                            tags: ["HSK", "Audio", "Image"],
                            stats: {
                                total: totalCards || 0,
                                new: newCards,
                                learning: learningCards,
                                review: reviewCards,
                                dueTotal: newCards + learningCards + reviewCards
                            },
                            isSystem: true
                        }
                    }))
                    setSystemDecks(enrichedSystemDecks)
                }
            } catch (err) {
                console.error("Lỗi khi fetch System Data", err)
            } finally {
                setIsLoading(false)
            }
        }
        fetchSystemDecks()
    }, [])

    // Auto-seed database if empty
    useEffect(() => {
        async function checkAndSeed() {
            try {
                const count = await db.decks.count()
                if (count === 0) {
                    setIsSeeding(true)
                    const success = await seedHskDatabase()
                    if (success) {
                        toast.success("Đã tự động nạp Database HSK Chuẩn")
                    }
                    setIsSeeding(false)
                }
            } catch (err) {
                console.error("Lỗi khi kiểm tra dữ liệu:", err)
                setIsSeeding(false)
            }
        }
        checkAndSeed()
    }, [])

    // Using IndexedDB and live query
    const decksWithStats = useLiveQuery(async () => {
        try {
            const allDecks = await db.decks.toArray()
            const now = new Date().toISOString()

            const result = await Promise.all(allDecks.map(async (deck) => {
                const cards = await db.cards.where('deck_id').equals(deck.id).toArray()

                const newCards = cards.filter(c => c.state === 'new').length
                const learningCards = cards.filter(c => c.state === 'learning' || c.state === 'relearning').length
                const reviewCards = cards.filter(c => c.state === 'review' && c.due && c.due <= now).length

                // Thống kê toàn bộ tags có trong Deck này
                const allTags = cards.flatMap(c => (c as any).tags || [])
                const uniqueTags = Array.from(new Set(allTags)).slice(0, 5) // Hiển thị tối đa 5 tag phổ biến

                // Bóc tách tên Subdeck nếu có (thường chứa ký hiệu '::' vd: Core::HSK1)
                // Lọc các ký tự Unicode Control (tab, newlines, Record/Unit Separators - hiển thị thành ô vuông lỗi font) thành ' 〉 ' để tránh hỏng UI
                let cleanDeckName = deck.name.replace(/[\x00-\x1F\x7F-\x9F]/g, ' 〉 ')

                let displayName = cleanDeckName
                let parentDeck = null

                if (cleanDeckName.includes('::')) {
                    const parts = cleanDeckName.split('::')
                    displayName = parts[parts.length - 1] // Lấy tên thật (phần cuối)
                    parentDeck = parts.slice(0, parts.length - 1).join(' 〉') // Tên bộ cha
                } else if (cleanDeckName.includes(' 〉 ')) {
                    // Trường hợp Deck tách bằng Control Characters (đã fix ở regex trên)
                    const parts = cleanDeckName.split(' 〉 ')
                    displayName = parts[parts.length - 1]
                    parentDeck = parts.slice(0, parts.length - 1).join(' 〉')
                }

                return {
                    ...deck,
                    displayName,
                    parentDeck,
                    tags: uniqueTags,
                    stats: {
                        total: cards.length,
                        new: newCards,
                        learning: learningCards,
                        review: reviewCards,
                        dueTotal: newCards + learningCards + reviewCards
                    },
                    isSystem: false
                }
            }))

            // Sắp xếp danh sách Deck theo thứ tự bảng chữ cái (Alpha-Numeric sort)
            // Dùng `numeric: true` để đảm bảo "Bài 2" đứng trước "Bài 10" một cách thông minh
            return result.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
        } catch (err) {
            console.error("Error loading local decks:", err)
            return []
        }
    }, [])

    const mergedDecks = [...systemDecks, ...(decksWithStats || [])]

    // Tính thống kê từ review_logs
    const studyStats = useLiveQuery(async () => {
        try {
            const now = new Date();
            const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

            // Đếm số reviews hôm nay
            let todayReviews = 0;
            let allLogs: any[] = [];
            try {
                todayReviews = await db.review_logs.where('review').aboveOrEqual(todayStart).count();
                allLogs = await db.review_logs.orderBy('review').reverse().toArray();
            } catch {
                // Fallback: full table scan nếu index chưa sẵn sàng
                allLogs = await db.review_logs.toArray();
                todayReviews = allLogs.filter(l => l.review >= todayStart).length;
                allLogs.sort((a, b) => (b.review || '').localeCompare(a.review || ''));
            }

            // Tính streak: đếm số ngày liên tiếp có review
            let streak = 0;
            if (todayReviews > 0) streak = 1;

            const checkedDays = new Set<string>();
            for (const log of allLogs) {
                const day = new Date(log.review).toDateString();
                checkedDays.add(day);
            }

            // Đếm ngược từ hôm nay
            for (let i = todayReviews > 0 ? 1 : 0; i < 365; i++) {
                const checkDate = new Date(now);
                checkDate.setDate(checkDate.getDate() - i);
                if (checkedDays.has(checkDate.toDateString())) {
                    if (i > 0 || todayReviews > 0) streak = i + 1;
                } else {
                    break;
                }
            }

            return { todayReviews, streak };
        } catch (err) {
            console.error("Error loading study stats:", err);
            return { todayReviews: 0, streak: 0 };
        }
    }, []) || { todayReviews: 0, streak: 0 }

    if (isLoading && !decksWithStats) {
        return (
            <div className="container py-10 flex justify-center items-center h-[50vh]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        )
    }

    if (isSeeding) {
        return (
            <div className="container py-10 flex flex-col justify-center items-center h-[60vh] space-y-4">
                <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-emerald-500"></div>
                <h2 className="text-xl font-bold text-foreground">Đang thiết lập Database Hệ Thống...</h2>
                <p className="text-muted-foreground">Đang nạp 11.474 từ vựng HSK. Vui lòng chờ trong giây lát.</p>
            </div>
        )
    }

    return (
        <div className="container mx-auto py-8 max-w-6xl px-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 space-y-4 md:space-y-0">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-primary to-accent">
                        Dashboard Học Tập
                    </h1>
                    <p className="text-muted-foreground mt-2 font-medium">
                        Giữ vững phong độ và tiếp tục chinh phục kho từ vựng.
                    </p>
                </div>
                <Link href="/import">
                    <Button size="lg" className="rounded-full shadow-md shadow-primary/20 hover:scale-105 transition-transform">
                        <Plus className="mr-2 h-5 w-5" /> Import Deck Mới
                    </Button>
                </Link>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4 mb-10">
                <Card className="bg-card/40 backdrop-blur-xl border-primary/10 shadow-lg hover:shadow-primary/5 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Tổng số Deck</CardTitle>
                        <BookOpen className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-primary">{mergedDecks?.length || 0}</div>
                    </CardContent>
                </Card>
                <Card className="bg-card/40 backdrop-blur-xl border-emerald-500/10 shadow-lg hover:shadow-emerald-500/5 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Cần Ôn Tập</CardTitle>
                        <Target className="h-4 w-4 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-emerald-500">
                            {mergedDecks?.reduce((acc, curr) => acc + curr.stats.dueTotal, 0) || 0}
                        </div>
                        <p className="text-xs text-emerald-500/70 font-medium mt-1">Thẻ từ vựng</p>
                    </CardContent>
                </Card>
                <Card className="bg-card/40 backdrop-blur-xl border-blue-500/10 shadow-lg hover:shadow-blue-500/5 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Thẻ Mới</CardTitle>
                        <Plus className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-blue-500">
                            {mergedDecks?.reduce((acc, curr) => acc + curr.stats.new, 0) || 0}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-card/40 backdrop-blur-xl border-orange-500/10 shadow-lg hover:shadow-orange-500/5 transition-all">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">Chuỗi Ngày Học</CardTitle>
                        <Flame className="h-4 w-4 text-orange-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-3xl font-black text-orange-500">{studyStats.streak} Ngày</div>
                        <p className="text-xs text-orange-500/70 font-medium mt-1">
                            {studyStats.todayReviews > 0 ? `Hôm nay: ${studyStats.todayReviews} thẻ` : 'Chưa học hôm nay!'}
                        </p>
                    </CardContent>
                </Card>
            </div>

            <div className="flex items-center gap-4 mb-4">
                <h2 className="text-xl font-semibold tracking-tight">Bộ Từ Vựng Của Bạn</h2>
                <div className="flex-1" />
                <div className="relative max-w-xs w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Tìm bộ thẻ..."
                        className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </div>
            </div>
            {!mergedDecks || mergedDecks.length === 0 ? (
                <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed">
                    <BookOpen className="h-12 w-12 text-muted-foreground/50 mb-4" />
                    <h3 className="text-lg font-medium">Chưa có bộ từ vựng nào</h3>
                    <p className="text-sm text-muted-foreground mb-4 max-w-sm mx-auto">
                        Hãy upload file Anki (.apkg) để bắt đầu quá trình học và ôn tập thông minh bằng thuật toán lặp lại ngắt quãng.
                    </p>
                    <Link href="/import">
                        <Button variant="outline">
                            <UploadCloud className="mr-2 h-4 w-4" /> Tải lên File Anki
                        </Button>
                    </Link>
                </Card>
            ) : (
                <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {mergedDecks?.filter(deck => {
                        if (!searchQuery.trim()) return true;
                        const q = searchQuery.toLowerCase();
                        return deck.name?.toLowerCase().includes(q) || deck.displayName?.toLowerCase().includes(q) || deck.parentDeck?.toLowerCase().includes(q);
                    }).map(deck => (
                        <Card key={deck.id} className={`relative flex flex-col hover:border-primary/50 transition-colors bg-card/40 backdrop-blur-md shadow-md ${deck.isSystem ? 'border-indigo-500/30' : ''}`}>
                            {deck.isSystem ? (
                                <div className="absolute right-2 top-2 z-10 bg-indigo-500/10 text-indigo-500 text-[10px] font-bold px-2 py-1 rounded-sm flex items-center shadow-sm">
                                    <BookOpen className="w-3 h-3 mr-1" /> HỆ THỐNG
                                </div>
                            ) : (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 z-10"
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        if (window.confirm("Bạn có chắc chắn muốn xóa bộ từ vựng này khỏi máy? Toàn bộ thẻ và tiến độ học sẽ bị xóa vĩnh viễn.")) {
                                            try {
                                                await db.decks.delete(deck.id);
                                                await db.cards.where('deck_id').equals(deck.id).delete();
                                                toast.success("Đã xóa bộ từ vựng thành công.");
                                            } catch (err: any) {
                                                toast.error("Không thể xóa: " + err.message);
                                            }
                                        }
                                    }}
                                >
                                    <Trash2 className="h-4 w-4" />
                                </Button>
                            )}

                            <CardHeader className="pb-3 border-b border-border/50">
                                {deck.parentDeck && (
                                    <div className="text-[10px] font-semibold text-muted-foreground/80 uppercase tracking-wider mb-1 flex items-center line-clamp-1" title={deck.parentDeck}>
                                        <BookOpen className="w-3 h-3 mr-1 shrink-0" /> {deck.parentDeck}
                                    </div>
                                )}
                                <CardTitle className="line-clamp-2 text-xl pr-16 text-foreground" title={deck.displayName}>
                                    {deck.displayName}
                                </CardTitle>
                                {deck.tags && deck.tags.length > 0 && (
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {deck.tags.map((tag: any) => (
                                            <span key={tag} className="inline-flex items-center text-[10px] font-medium bg-secondary text-secondary-foreground px-1.5 py-0.5 rounded-sm">
                                                <Tag className="w-3 h-3 mr-1 opacity-50" /> {tag}
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </CardHeader>
                            <CardContent className="flex-1 pt-4">
                                <div className="space-y-4">
                                    <div className="flex justify-between items-center text-sm font-medium">
                                        <span className="text-muted-foreground">Tiến độ ({deck.stats.total - deck.stats.new}/{deck.stats.total})</span>
                                        <span className="text-primary">
                                            {deck.stats.total > 0 ? Math.round(((deck.stats.total - deck.stats.new) / deck.stats.total) * 100) : 0}%
                                        </span>
                                    </div>
                                    {/* Assuming Progress component is defined elsewhere */}
                                    <Progress
                                        value={deck.stats.total > 0 ? ((deck.stats.total - deck.stats.new) / deck.stats.total) * 100 : 0}
                                        className="h-2 bg-muted/50"
                                    />

                                    <div className="flex justify-between text-xs pt-2">
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-1.5 text-emerald-600 font-medium bg-emerald-500/10 px-2 py-1 rounded-md">
                                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Đã thuộc
                                            </div>
                                            <span className="font-bold text-sm text-foreground">{deck.stats.total - deck.stats.new - deck.stats.learning}</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-1.5 text-amber-600 font-medium bg-amber-500/10 px-2 py-1 rounded-md">
                                                <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div> Đang học
                                            </div>
                                            <span className="font-bold text-sm text-foreground">{deck.stats.learning}</span>
                                        </div>
                                        <div className="flex flex-col items-center gap-1">
                                            <div className="flex items-center gap-1.5 text-muted-foreground font-medium bg-muted/50 px-2 py-1 rounded-md">
                                                <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/30"></div> Chưa học
                                            </div>
                                            <span className="font-bold text-sm text-foreground">{deck.stats.new}</span>
                                        </div>
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="pt-4 border-t bg-muted/10 gap-2">
                                {deck.stats.review > 0 || deck.stats.learning > 0 ? (
                                    <Link href={`/study/${deck.id}?mode=flashcard${deck.isSystem ? '&isSystem=true' : ''}`} className="w-full">
                                        <Button className="w-full shadow-sm bg-orange-500 hover:bg-orange-600 text-white border-none font-semibold">
                                            <Flame className="w-4 h-4 mr-2" /> Ôn Ngay {deck.stats.review === 0 && deck.stats.learning > 0 ? '(Đang học)' : `${deck.stats.review} Thẻ`}
                                        </Button>
                                    </Link>
                                ) : deck.stats.new > 0 ? (
                                    <Link href={`/study/${deck.id}?mode=flashcard${deck.isSystem ? '&isSystem=true' : ''}`} className="w-full">
                                        <Button className="w-full shadow-sm font-semibold" variant="default">
                                            Học Thẻ Mới
                                        </Button>
                                    </Link>
                                ) : (
                                    <div className="w-full">
                                        <Button className="w-full shadow-none bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/20 font-semibold" variant="secondary" disabled>
                                            <CheckCircle2 className="w-4 h-4 mr-2" /> Đã Hoàn Thành 🎉
                                        </Button>
                                    </div>
                                )}
                            </CardFooter>
                        </Card>
                    ))}
                </div>
            )}
        </div>
    )
}
