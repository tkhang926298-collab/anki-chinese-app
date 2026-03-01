"use client"

import { useState, useEffect, useMemo, useRef } from "react"
import { Search, Loader2, Sparkles, AlertCircle } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"

// Định dạng dữ liệu thu gọn trong CVDICT.json
interface CVDEntry {
    t: string; // Phồn thể
    s: string; // Giản thể
    p: string; // Pinyin
    m: string; // Nghĩa (đã gộp bằng dấu chấm phẩy)
}

export function DictionaryContent() {
    const [dbState, setDbState] = useState<'loading' | 'ready' | 'error'>('loading')
    const [dbData, setDbData] = useState<CVDEntry[]>([])
    const [searchQuery, setSearchQuery] = useState('')
    const [debouncedQuery, setDebouncedQuery] = useState('')

    // Pagination / Virtualization state (Hiển thị giới hạn để không lag DOM)
    const [visibleCount, setVisibleCount] = useState(50)

    const observer = useRef<IntersectionObserver | null>(null)
    const loadMoreRef = useRef<HTMLDivElement | null>(null)

    // Lấy file CVDICT.json (kích thước ~13MB)
    useEffect(() => {
        async function loadDictionary() {
            try {
                // Fetch dictionary file from public directory
                const res = await fetch('/cvdict.json')
                if (!res.ok) throw new Error("Failed to load dictionary file")

                const data: CVDEntry[] = await res.json()
                setDbData(data)
                setDbState('ready')
            } catch (err) {
                console.error(err)
                setDbState('error')
            }
        }
        loadDictionary()
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

        // Split các query nhỏ nếu user gõ có dấu cách
        const terms = debouncedQuery.split(/\s+/).filter(Boolean)

        return dbData.filter(entry => {
            const hanziS = entry.s.toLowerCase()
            const hanziT = entry.t.toLowerCase()
            const pinyin = entry.p.toLowerCase()
            const meaning = entry.m.toLowerCase()

            // Yêu cầu MỌI term đều phải xuất hiện ở 1 trong 4 field
            return terms.every(term =>
                hanziS.includes(term) ||
                hanziT.includes(term) ||
                pinyin.includes(term) ||
                meaning.includes(term)
            )
        })
    }, [debouncedQuery, dbData, dbState])

    // Chỉ render các item được tính tới
    const visibleResults = searchResults.slice(0, visibleCount)

    // Auto-load more khi scroll xuống cuối danh sách (Infinite Scroll)
    useEffect(() => {
        if (observer.current) observer.current.disconnect()

        observer.current = new IntersectionObserver(entries => {
            if (entries[0].isIntersecting && visibleCount < searchResults.length) {
                setVisibleCount(prev => prev + 50)
            }
        })

        if (loadMoreRef.current) {
            observer.current.observe(loadMoreRef.current)
        }

        return () => {
            if (observer.current) observer.current.disconnect()
        }
    }, [visibleCount, searchResults.length])

    return (
        <div className="w-full space-y-8">
            {/* Thanh tìm kiếm */}
            <div className="sticky top-20 z-40 bg-background/95 backdrop-blur-md pt-2 pb-6">
                <div className="relative max-w-3xl mx-auto group">
                    <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent rounded-2xl blur-xl opacity-20 group-hover:opacity-40 transition-opacity"></div>
                    <div className="relative bg-card rounded-2xl border-2 border-primary/20 shadow-lg focus-within:border-primary/50 transition-colors flex items-center px-4 overflow-hidden">
                        <Search className="w-6 h-6 text-muted-foreground mr-3" />
                        <Input
                            placeholder="Nhập chữ Hán, Pinyin hoặc Tiếng Việt để tìm..."
                            className="flex-1 h-14 md:h-16 text-lg md:text-xl border-none focus-visible:ring-0 px-0 bg-transparent placeholder:text-muted-foreground"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            disabled={dbState !== 'ready'}
                        />
                        {dbState === 'loading' && (
                            <Loader2 className="w-6 h-6 text-primary animate-spin ml-3" />
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
                            <span className="flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Đang tải 122.000 từ vựng...</span>
                        ) : dbState === 'error' ? (
                            <span className="text-destructive">Lỗi cẩn nạp từ điển</span>
                        ) : searchResults.length > 0 ? (
                            <span>Tìm thấy <strong className="text-foreground">{searchResults.length}</strong> kết quả</span>
                        ) : debouncedQuery ? (
                            <span>Không tìm thấy từ nào phù hợp</span>
                        ) : (
                            <span>Nhập gì đó để bắt đầu. VD: <strong className="cursor-pointer text-primary hover:underline" onClick={() => setSearchQuery('thành ngữ')}>thành ngữ</strong>, <strong className="cursor-pointer text-primary hover:underline" onClick={() => setSearchQuery('ming tian')}>ming tian</strong></span>
                        )}
                    </div>
                </div>
            </div>

            {/* Trạng thái lỗi tải Data */}
            {dbState === 'error' && (
                <Alert variant="destructive" className="max-w-3xl mx-auto">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Lỗi Dữ Liệu</AlertTitle>
                    <AlertDescription>
                        Không thể tải file dữ liệu CVDICT. Vui lòng thử tải lại trang hoặc kiểm tra kết nối mạng.
                    </AlertDescription>
                </Alert>
            )}

            {/* Danh sách kết quả */}
            <div className="max-w-3xl mx-auto space-y-4 pb-20">
                {visibleResults.map((entry, idx) => (
                    <Card key={`${entry.s}-${idx}`} className="overflow-hidden hover:border-primary/50 transition-colors shadow-sm group">
                        <CardContent className="p-0">
                            <div className="flex flex-col md:flex-row">
                                {/* Cột Chữ Hán & Pinyin */}
                                <div className="bg-muted/30 p-5 md:w-1/3 border-b md:border-b-0 md:border-r flex flex-col justify-center items-center text-center">
                                    <div className="flex flex-col items-center">
                                        <h2 className="text-4xl md:text-5xl font-bold font-serif mb-3 tracking-wide text-foreground">
                                            {entry.s}
                                        </h2>
                                        {entry.t !== entry.s && (
                                            <span className="text-sm font-serif text-muted-foreground mb-2">
                                                Phồn: {entry.t}
                                            </span>
                                        )}
                                        <Badge variant="secondary" className="text-sm md:text-base font-medium font-mono px-3 py-1 bg-primary/10 text-primary border-primary/20">
                                            {entry.p}
                                        </Badge>
                                    </div>
                                </div>

                                {/* Cột Giải Nghĩa */}
                                <div className="p-5 md:w-2/3 flex flex-col justify-center bg-card">
                                    <h3 className="text-lg md:text-xl font-medium text-foreground leading-relaxed break-words">
                                        {/* Nghĩa thường được cách nhau bởi dấy chấm phẩy */}
                                        {entry.m.split(';').map((meaningLine, lineIdx) => (
                                            <span key={lineIdx} className="block relative pl-4 mb-2 before:content-['•'] before:absolute before:left-0 before:text-primary before:font-bold">
                                                {meaningLine.trim()}
                                            </span>
                                        ))}
                                    </h3>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}

                {/* Loader Trigger Element */}
                {visibleCount < searchResults.length && (
                    <div ref={loadMoreRef} className="py-6 flex justify-center items-center text-muted-foreground">
                        <Loader2 className="w-6 h-6 animate-spin mr-2" />
                        Đang tải thêm kết quả...
                    </div>
                )}
            </div>

            {/* Màn hình Trống ban đầu */}
            {!debouncedQuery && dbState === 'ready' && (
                <div className="flex flex-col items-center justify-center py-20 text-center opacity-60">
                    <div className="w-24 h-24 rounded-full bg-primary/10 text-primary flex items-center justify-center mb-6 shadow-inner">
                        <Sparkles className="w-12 h-12" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">Kho Tàng Từ Vựng Hán Việt</h3>
                    <p className="text-lg max-w-sm">Hơn 122 Ngàn từ vựng chuyên sâu (CVDICT + CC-CEDICT) nằm gọn trong tay bạn.</p>
                </div>
            )}
        </div>
    )
}
