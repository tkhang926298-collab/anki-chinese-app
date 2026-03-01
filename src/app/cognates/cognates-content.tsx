"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Search, Loader2, Sparkles, AlertCircle, Volume2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Định dạng dữ liệu thu gọn trong cognates.json
interface CognateEntry {
    w: string; // Chữ Hán (Giản thể lớn)
    p: string; // Pinyin
    h: string; // Hán Việt
    m: string; // Nghĩa tiếng Việt
}

export function CognatesContent() {
    const [dbState, setDbState] = useState<'loading' | 'ready' | 'error'>('loading')
    const [dbData, setDbData] = useState<CognateEntry[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')

    // Pagination / Virtualization state
    const [visibleCount, setVisibleCount] = useState(50)

    const observer = useRef<IntersectionObserver | null>(null)
    const loadMoreRef = useRef<HTMLDivElement | null>(null)

    // Lấy file cognates.json 
    useEffect(() => {
        async function loadData() {
            try {
                const res = await fetch('/cognates.json')
                if (!res.ok) throw new Error("Failed to load cognates file")

                const data: CognateEntry[] = await res.json()
                setDbData(data)
                setDbState('ready')
            } catch (err) {
                console.error(err)
                setDbState('error')
            }
        }
        loadData()
    }, [])

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(searchQuery.trim().toLowerCase())
            setVisibleCount(50) // Reset view count when typing new query
        }, 300)
        return () => clearTimeout(timer)
    }, [searchQuery])

    // Lọc dữ liệu 1 cách nhẹ nhàng
    const searchResults = useMemo(() => {
        if (!debouncedQuery || dbState !== 'ready') return []

        const terms = debouncedQuery.split(/\s+/).filter(Boolean)

        return dbData.filter(entry => {
            const word = entry.w.toLowerCase()
            const pinyin = entry.p.toLowerCase()
            const hanviet = entry.h.toLowerCase()
            const meaning = entry.m.toLowerCase()

            return terms.every(term =>
                word.includes(term) ||
                pinyin.includes(term) ||
                hanviet.includes(term) ||
                meaning.includes(term)
            )
        })
    }, [debouncedQuery, dbData, dbState])

    // Hiển thị ban đầu: nếu chưa search thì hiện 50 từ đầu tiên
    const itemsToDisplay = debouncedQuery ? searchResults : dbData
    const visibleResults = itemsToDisplay.slice(0, visibleCount)

    // Auto-load more khi scroll xuống cuối danh sách (Infinite Scroll)
    useEffect(() => {
        if (observer.current) observer.current.disconnect()

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && visibleCount < itemsToDisplay.length) {
                setVisibleCount(prev => prev + 50)
            }
        })

        if (loadMoreRef.current) {
            observer.current.observe(loadMoreRef.current)
        }

        return () => {
            if (observer.current) observer.current.disconnect()
        }
    }, [visibleCount, itemsToDisplay.length])

    const playAudio = (text: string) => {
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'zh-CN'
        speechSynthesis.speak(utterance)
    }

    return (
        <div className="w-full space-y-8">
            {/* Thanh tìm kiếm */}
            <div className="sticky top-20 z-40 bg-background/95 backdrop-blur-md pt-2 pb-6">
                <div className="relative max-w-3xl mx-auto group">
                    <div className="absolute inset-0 bg-gradient-to-r from-green-400 to-emerald-600 rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="relative bg-card rounded-2xl border-2 border-emerald-500/20 shadow-lg focus-within:border-emerald-500/50 transition-colors flex items-center px-4 overflow-hidden">
                        <Search className="w-6 h-6 text-muted-foreground mr-3" />
                        <Input
                            placeholder="Nhập âm Hán Việt, Pinyin hoặc Chữ Hán..."
                            className="flex-1 h-14 md:h-16 text-lg md:text-xl border-none focus-visible:ring-0 px-0 bg-transparent placeholder:text-muted-foreground"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            disabled={dbState !== 'ready'}
                        />
                        {dbState === 'loading' && (
                            <Loader2 className="w-6 h-6 text-emerald-500 animate-spin ml-3" />
                        )}
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery('')}
                                className="ml-3 text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-muted"
                            >
                                ✕
                            </button>
                        )}
                    </div>
                </div>

                {/* Kết quả nhanh */}
                <div className="max-w-3xl mx-auto mt-3 flex justify-between items-center text-sm px-2">
                    <div className="text-muted-foreground">
                        {dbState === 'loading' ? (
                            <span className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Đang phân tích dữ liệu...</span>
                        ) : dbState === 'error' ? (
                            <span className="text-destructive">Lỗi cẩn nạp dữ liệu</span>
                        ) : searchResults.length > 0 && debouncedQuery ? (
                            <span>Tìm thấy <strong className="text-foreground">{searchResults.length}</strong> từ tương đồng</span>
                        ) : dbData.length > 0 && !debouncedQuery ? (
                            <span>Tổng cộng <strong className="text-foreground">{dbData.length}</strong> từ vựng đồng âm Hán-Việt</span>
                        ) : null}
                    </div>
                </div>
            </div>

            {/* Trạng thái lỗi tải Data */}
            {dbState === 'error' && (
                <Alert variant="destructive" className="max-w-3xl mx-auto">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Lỗi Dữ Liệu</AlertTitle>
                    <AlertDescription>
                        Không thể tải file dữ liệu Từ đồng âm. Vui lòng thử tải lại trang hoặc kiểm tra kết nối mạng.
                    </AlertDescription>
                </Alert>
            )}

            {/* Danh sách kết quả */}
            <div className="max-w-3xl mx-auto space-y-4 pb-20">
                {visibleResults.map((entry, idx) => (
                    <Card key={`${entry.w}-${idx}`} className="overflow-hidden hover:border-emerald-500/50 transition-colors shadow-sm group">
                        <CardContent className="p-0">
                            <div className="flex flex-col sm:flex-row items-stretch">
                                {/* Cột Chữ Hán & Pinyin */}
                                <div className="bg-emerald-500/5 p-6 sm:w-[180px] border-b sm:border-b-0 sm:border-r flex flex-col justify-center items-center text-center relative">
                                    <button
                                        onClick={() => playAudio(entry.w)}
                                        className="absolute top-3 right-3 text-muted-foreground hover:text-emerald-500 transition-colors"
                                    >
                                        <Volume2 className="w-5 h-5" />
                                    </button>
                                    <h2 className="text-5xl font-bold font-serif mb-3 text-foreground">
                                        {entry.w}
                                    </h2>
                                    <Badge variant="secondary" className="font-mono text-emerald-600 bg-emerald-500/10 hover:bg-emerald-500/20">
                                        {entry.p}
                                    </Badge>
                                </div>

                                {/* Cột Giải Nghĩa Hán Việt */}
                                <div className="p-6 sm:flex-1 flex flex-col justify-center bg-card">
                                    <div className="flex flex-col h-full justify-between">
                                        <div>
                                            <div className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                                ÂM HÁN VIỆT
                                            </div>
                                            <h3 className="text-2xl font-bold text-emerald-600 mb-4 capitalize">
                                                {entry.h}
                                            </h3>
                                        </div>

                                        <div>
                                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">
                                                GIẢI NGHĨA
                                            </div>
                                            <p className="text-foreground leading-relaxed">
                                                {entry.m}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {/* Loader Trigger Element */}
                {visibleCount < itemsToDisplay.length && (
                    <div ref={loadMoreRef} className="py-6 flex justify-center items-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        Đang tải thêm kết quả...
                    </div>
                )}
            </div>

            {/* Màn hình Trống ban đầu */}
            {itemsToDisplay.length === 0 && dbState === 'ready' && debouncedQuery && (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                    <div className="w-24 h-24 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center mb-6 shadow-inner">
                        <AlertCircle className="w-12 h-12" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Không tìm thấy từ nào</h3>
                    <p className="text-lg max-w-sm">Hãy thử nhập một âm Hán-Việt hay Pinyin khác xem sao.</p>
                </div>
            )}
        </div>
    )
}
