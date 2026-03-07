"use client"

import { useState, useMemo, useEffect } from "react"
import { Search, Plus, X, Type, BookOpen, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { db } from "@/lib/db/local"
import { Badge } from "@/components/ui/badge"

interface CVDEntry {
    t: string;
    s: string;
    p: string;
    m: string;
}

export default function ReaderContent() {
    const [rawText, setRawText] = useState("")
    const [isReading, setIsReading] = useState(false)
    const [selectedWord, setSelectedWord] = useState<string | null>(null)

    // Dictionary state
    const [dbState, setDbState] = useState<'loading' | 'ready' | 'error'>('loading')
    const [dbData, setDbData] = useState<CVDEntry[]>([])

    // Load CVDICT
    useEffect(() => {
        async function loadDictionary() {
            try {
                const res = await fetch('/cvdict.json')
                if (!res.ok) throw new Error("Failed to load dictionary")
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

    // Segmentation
    const segments = useMemo(() => {
        if (!rawText) return []
        try {
            const segmenter = new (Intl as any).Segmenter('zh-CN', { granularity: 'word' })
            return Array.from(segmenter.segment(rawText))
        } catch (e) {
            // Fallback for browsers that don't support Intl.Segmenter
            return rawText.split('').map(char => ({ segment: char, isWordLike: char.trim() !== '' }))
        }
    }, [rawText])

    // Find dictionary entry
    const dictResult = useMemo(() => {
        if (!selectedWord || dbState !== 'ready') return []
        const wordLower = selectedWord.toLowerCase()
        return dbData.filter(entry => entry.s.toLowerCase() === wordLower || entry.t.toLowerCase() === wordLower).slice(0, 10)
    }, [selectedWord, dbData, dbState])

    const handleWordClick = (word: string) => {
        setSelectedWord(word)
    }

    return (
        <div className="container mx-auto py-8 max-w-6xl px-4">
            <h1 className="text-3xl font-extrabold tracking-tight mb-2">Trợ lý Đọc hiểu</h1>
            <p className="text-muted-foreground mb-8">Dán văn bản tiếng Trung vào đây để tự động tách từ và tra cứu nhanh.</p>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    {!isReading ? (
                        <Card className="shadow-lg border-primary/10">
                            <CardHeader>
                                <CardTitle>Nhập văn bản</CardTitle>
                                <CardDescription>Dán nội dung bài báo, đoạn hội thoại hoặc bất kỳ văn bản tiếng Trung nào.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <Textarea
                                    className="min-h-[300px] text-lg leading-relaxed resize-none p-4 bg-muted/30 focus-visible:ring-primary/40"
                                    placeholder="Ví dụ: 我是一个好人..."
                                    value={rawText}
                                    onChange={(e) => setRawText(e.target.value)}
                                />
                                <div className="mt-4 flex justify-between items-center">
                                    <div className="text-sm text-muted-foreground">
                                        {dbState === 'loading' && <span className="flex items-center"><Loader2 className="w-3 h-3 mr-2 animate-spin" /> Đang tải từ điển...</span>}
                                        {dbState === 'error' && <span className="text-destructive">Lỗi tải từ điển!</span>}
                                        {dbState === 'ready' && <span className="text-emerald-500 font-medium">Từ điển đã sẵn sàng ({dbData.length.toLocaleString()} từ)</span>}
                                    </div>
                                    <Button disabled={!rawText.trim() || dbState !== 'ready'} onClick={() => setIsReading(true)}>
                                        <BookOpen className="w-4 h-4 mr-2" /> Bắt đầu đọc
                                    </Button>
                                </div>
                            </CardContent>
                        </Card>
                    ) : (
                        <Card className="h-full shadow-lg border-primary/10 bg-card/40 backdrop-blur-sm">
                            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 border-b mb-4">
                                <CardTitle className="text-lg">Chế độ đọc</CardTitle>
                                <Button variant="ghost" size="sm" onClick={() => setIsReading(false)}>
                                    <Type className="w-4 h-4 mr-2" /> Soạn thảo lại
                                </Button>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl md:text-3xl leading-[2.5] font-serif tracking-wide break-words text-justify cursor-text">
                                    {segments.map((seg: any, idx) => {
                                        if (seg.isWordLike) {
                                            return (
                                                <span
                                                    key={idx}
                                                    onClick={() => handleWordClick(seg.segment)}
                                                    className={`cursor-pointer transition-all duration-200 rounded-md px-1 mx-0.5 inline-block
                                                        ${selectedWord === seg.segment ? 'bg-primary text-primary-foreground shadow-md -translate-y-0.5' : 'hover:bg-primary/20 hover:text-primary active:scale-95'}`}
                                                >
                                                    {seg.segment}
                                                </span>
                                            )
                                        }
                                        return (
                                            <span key={idx} className="text-muted-foreground opacity-70 px-0.5 whitespace-pre-wrap">{seg.segment}</span>
                                        )
                                    })}
                                </div>
                            </CardContent>
                        </Card>
                    )}
                </div>

                <div className="lg:col-span-1">
                    <Card className="sticky top-20 h-[calc(100vh-120px)] flex flex-col overflow-hidden shadow-lg border-primary/10">
                        <CardHeader className="bg-muted/50 border-b pb-4 shrink-0">
                            <CardTitle className="flex flex-row items-center justify-between text-lg">
                                <span className="flex items-center"><Search className="w-4 h-4 mr-2 text-primary" /> Tra từ</span>
                                {selectedWord && (
                                    <Button variant="ghost" size="icon" onClick={() => setSelectedWord(null)} className="h-6 w-6 rounded-full hover:bg-destructive/10 hover:text-destructive">
                                        <X className="w-4 h-4" />
                                    </Button>
                                )}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="flex-1 overflow-y-auto p-0 bg-card/40">
                            {!selectedWord ? (
                                <div className="p-8 text-center text-muted-foreground flex flex-col items-center justify-center h-full">
                                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
                                        <Sparkles className="w-8 h-8 text-primary/40" />
                                    </div>
                                    <p className="font-medium">Chạm vào bất kỳ từ nào</p>
                                    <p className="text-sm mt-2 opacity-80">Bên trái để xem nghĩa và thêm vào Flashcard.</p>
                                </div>
                            ) : dbState !== 'ready' ? (
                                <div className="p-8 text-center flex items-center justify-center h-full">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                </div>
                            ) : dictResult.length > 0 ? (
                                <div className="p-4 space-y-4">
                                    <div className="sticky top-0 bg-background/95 backdrop-blur-md pb-3 pt-1 border-b z-10 flex justify-between items-center">
                                        <h2 className="text-4xl font-black font-serif text-foreground">{selectedWord}</h2>
                                    </div>

                                    <div className="space-y-4 mt-4 pb-20">
                                        {dictResult.map((entry, i) => (
                                            <div key={i} className="border rounded-xl p-4 bg-card/80 shadow-sm hover:border-primary/30 transition-colors">
                                                <Badge variant="secondary" className="text-sm font-mono bg-primary/10 text-primary border-primary/20 mb-3">
                                                    {entry.p}
                                                </Badge>
                                                {entry.t !== entry.s && (
                                                    <div className="text-xs text-muted-foreground mb-2 font-serif">Phồn: {entry.t}</div>
                                                )}
                                                <ul className="space-y-1.5 text-sm text-foreground/90 pl-1">
                                                    {entry.m.split(';').map((meaningLine, lineIdx) => (
                                                        <li key={lineIdx} className="flex items-start">
                                                            <span className="text-primary font-bold mr-2 mt-0.5">•</span>
                                                            <span className="leading-relaxed">{meaningLine.trim()}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="absolute bottom-0 left-0 right-0 p-4 border-t bg-background/95 backdrop-blur-md shadow-[0_-10px_40px_-5px_rgba(0,0,0,0.1)]">
                                        <Button className="w-full font-semibold shadow-md" onClick={() => {
                                            toast.info(`Tính năng đang phát triển: Thêm "${selectedWord}" vào Deck.`, { icon: '🚧' })
                                        }}>
                                            <Plus className="w-4 h-4 mr-2" /> Thêm vào Flashcard
                                        </Button>
                                    </div>
                                </div>
                            ) : (
                                <div className="p-8 text-center h-full flex flex-col items-center justify-center">
                                    <div className="text-5xl font-bold font-serif mb-4 text-muted-foreground/50">{selectedWord}</div>
                                    <p className="text-muted-foreground font-medium mb-6">Không tìm thấy từ này trong từ điển offline.</p>
                                    <Button variant="outline" onClick={() => window.open(`https://glosbe.com/zh/vi/${selectedWord}`, '_blank')}>
                                        Tra trên Glosbe ↗
                                    </Button>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    )
}
