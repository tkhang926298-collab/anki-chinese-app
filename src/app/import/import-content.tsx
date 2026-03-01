"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { UploadCloud, FileType, CheckCircle, Loader2, ClipboardPaste } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { parseApkgFile, ParsedDeck, ParsedCard } from "@/lib/anki/parser"
import { createClient } from "@/lib/supabase/client"
import { db } from "@/lib/db/local"

export default function ImportContent() {
    const router = useRouter()
    const supabase = createClient()

    const [file, setFile] = useState<File | null>(null)
    const [parsedDecks, setParsedDecks] = useState<ParsedDeck[]>([])

    const [isParsing, setIsParsing] = useState(false)
    const [isUploading, setIsUploading] = useState(false)

    // Quizlet Import states
    const [quizletText, setQuizletText] = useState('')
    const [quizletDeckName, setQuizletDeckName] = useState('')
    const [isImportingQuizlet, setIsImportingQuizlet] = useState(false)

    // Xử lý nạp file
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files.length > 0) {
            const selectedFile = e.target.files[0]
            if (!selectedFile.name.endsWith('.apkg')) {
                toast.error("Vui lòng chọn file Anki định dạng .apkg")
                setFile(null)
                setParsedDecks([])
                return
            }
            setFile(selectedFile)
            setParsedDecks([])
        }
    }

    // Phân tích file .apkg qua WebAssembly (sql.js)
    const handleParseFile = async () => {
        if (!file) return

        setIsParsing(true)
        try {
            const decks = await parseApkgFile(file)
            if (decks && decks.length > 0) {
                setParsedDecks(decks)
                const totalCards = decks.reduce((sum, d) => sum + d.cards.length, 0)
                toast.success(`Phân tích thành công! Đã tìm thấy ${decks.length} bộ thẻ với tổng ${totalCards} thẻ.`)
            } else {
                toast.error("Không trích xuất được số lượng thẻ hợp lệ trong file này (Có thể template không đúng định dạng Anki).")
            }
        } catch (error: any) {
            console.error("Lỗi Parsing:", error)
            toast.error(`Lỗi giải nén: ${error.message || 'Chưa rõ nguyên nhân'}`)
        } finally {
            setIsParsing(false)
        }
    }

    // Upload toàn bộ dữ liệu Deck và Cards vào Browser IndexedDB
    const handleImportToDatabase = async () => {
        if (!parsedDecks || parsedDecks.length === 0) return
        setIsUploading(true)

        try {
            // 1. Get current logged in user (Optional: fallback to offline user for Dexie if not logged in)
            const { data: { user } } = await supabase.auth.getUser()
            const currentUserId = user?.id || 'offline-user-local'

            const now = new Date().toISOString()
            const allCardsPayload: any[] = []
            const allMediaPayload: any[] = []
            const sbDecksPayload: any[] = []

            // 2. Insert the Decks
            const fileBaseName = (file?.name || 'Anki Deck').replace('.apkg', '')

            for (const deck of parsedDecks) {
                const deckId = crypto.randomUUID()

                // Phân cấp Folder Root từ Tên File APKG
                const finalDeckName = deck.name.startsWith(fileBaseName)
                    ? deck.name
                    : `${fileBaseName}::${deck.name}`

                await db.decks.add({
                    id: deckId,
                    user_id: currentUserId,
                    name: finalDeckName,
                    description: `Extracted from ${file?.name || 'Anki'}: ${new Date().toLocaleDateString()}`,
                    created_at: now,
                    last_reviewed: null
                })

                // 3. Prepare cards payload with initial SRS fields
                const deckCards = deck.cards.map(card => ({
                    id: crypto.randomUUID(),
                    deck_id: deckId,
                    user_id: currentUserId,
                    front_html: card.front_html || '',
                    back_html: card.back_html || '',
                    fields: card.fields,
                    tags: card.tags || [],
                    state: 'new' as const,
                    due: null,
                    reps: 0,
                    lapses: 0,
                    stability: 0,
                    difficulty: 4.5,
                    elapsed_days: 0,
                    scheduled_days: 0,
                    created_at: now,
                    last_review: null
                }))

                allCardsPayload.push(...deckCards)

                if (deck.media && deck.media.length > 0) {
                    allMediaPayload.push(...deck.media)
                }
            }

            // 4. Batch insert Cards using IndexedDB API
            if (allCardsPayload.length > 0) {
                await db.cards.bulkAdd(allCardsPayload)
            }

            // 5. Store Media
            if (allMediaPayload.length > 0) {
                await db.media.bulkPut(allMediaPayload)
            }

            toast.success(`Đã chiết xuất thành công ${parsedDecks.length} bộ, lưu tổng cộng ${allCardsPayload.length} thẻ từ vựng vào máy.`)
            router.push('/dashboard')

        } catch (error: any) {
            toast.error(`Lỗi Import: ${error.message || 'Unknown Error'}`)
        } finally {
            setIsUploading(false)
        }
    }

    // Tiện ích chia mảng
    function chunkArray<T>(array: T[], size: number): T[][] {
        const result = []
        for (let i = 0; i < array.length; i += size) {
            result.push(array.slice(i, i + size))
        }
        return result
    }

    const totalCardsPreview = parsedDecks.reduce((sum, d) => sum + d.cards.length, 0)
    const firstDeckCards = parsedDecks.length > 0 ? parsedDecks[0].cards : []

    return (
        <div className="container mx-auto py-10 max-w-3xl">
            <div className="mb-8 space-y-2">
                <h1 className="text-3xl font-bold tracking-tight">Import dữ liệu</h1>
                <p className="text-muted-foreground">
                    Hỗ trợ import từ file Anki (.apkg) hoặc dán nội dung từ Quizlet / CSV.
                </p>
            </div>

            {/* Section 1: Anki .apkg */}
            <h2 className="text-xl font-semibold mt-2 mb-3">📦 Import từ file Anki (.apkg)</h2>

            <Card>
                <CardHeader>
                    <CardTitle>Tải lên tệp .apkg</CardTitle>
                    <CardDescription>
                        Định dạng bắt buộc: Anki Deck Package (.apkg). Dữ liệu sẽ được trích xuất hoàn toàn ở trình duyệt, không tốn băng thông máy chủ.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center justify-center w-full">
                        <label
                            htmlFor="dropzone-file"
                            className="flex flex-col items-center justify-center w-full h-40 border-2 border-dashed rounded-lg cursor-pointer bg-muted/40 hover:bg-muted/80"
                        >
                            <div className="flex flex-col items-center justify-center pt-5 pb-6">
                                <UploadCloud className="w-10 h-10 mb-3 text-muted-foreground" />
                                <p className="mb-2 text-sm text-foreground font-semibold">
                                    Click để chọn file hoặc kéo thả vào đây
                                </p>
                                <p className="text-xs text-muted-foreground">Tệp .apkg</p>
                                {file && (
                                    <p className="mt-4 text-sm font-medium text-emerald-600 flex items-center">
                                        <FileType className="w-4 h-4 mr-2" />
                                        Đã chọn: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
                                    </p>
                                )}
                            </div>
                            <input
                                id="dropzone-file"
                                type="file"
                                className="hidden"
                                accept=".apkg"
                                onChange={handleFileChange}
                            />
                        </label>
                    </div>

                    <div className="flex justify-center my-4">
                        <Button
                            variant="destructive"
                            onClick={async () => {
                                try {
                                    setIsParsing(true)
                                    const res = await fetch('/test_subdeck.apkg')
                                    const blob = await res.blob()
                                    const debugFile = new File([blob], 'test_subdeck.apkg', { type: 'application/octet-stream' })
                                    setFile(debugFile)
                                    const decks = await parseApkgFile(debugFile)
                                    if (decks && decks.length > 0) {
                                        setParsedDecks(decks)
                                        console.log("PARSED DECKS FOR SUBAGENT:", decks)
                                    }
                                } catch (e: any) {
                                    console.error("Test Lỗi Parsing:", e)
                                } finally {
                                    setIsParsing(false)
                                }
                            }}
                        >
                            DEBUG AUTO LOAD
                        </Button>
                    </div>

                    {file && parsedDecks.length === 0 && (
                        <div className="flex justify-end">
                            <Button onClick={handleParseFile} disabled={isParsing}>
                                {isParsing ? (
                                    <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang đọc dữ liệu...</>
                                ) : (
                                    "Phân tích File"
                                )}
                            </Button>
                        </div>
                    )}

                    {parsedDecks.length > 0 && (
                        <div className="rounded-md bg-muted p-4 space-y-4">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                <div className="flex items-center gap-2 font-medium text-lg">
                                    <CheckCircle className="text-emerald-500 h-5 w-5" />
                                    Kết quả giải nén thành công
                                </div>
                                <span className="bg-primary/10 text-primary text-xs px-2 py-1 rounded font-bold">
                                    {parsedDecks.length} Bộ thẻ con (Subdecks)
                                </span>
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm bg-background p-3 rounded border">
                                <div>
                                    <span className="text-muted-foreground block mb-1">Tên bộ bài gốc:</span>
                                    <p className="font-semibold">{parsedDecks[0].name.split('::')[0] || file?.name.replace('.apkg', '')}</p>
                                </div>
                                <div>
                                    <span className="text-muted-foreground block mb-1">Tổng từ vựng (All Subdecks):</span>
                                    <p className="font-semibold text-primary">{totalCardsPreview} thẻ</p>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground uppercase font-semibold mt-4 mb-2">Bản nháp 5 thẻ đầu tiên trong bộ thứ nhất:</p>
                            <div className="max-h-32 overflow-y-auto w-full bg-background rounded-md p-2 text-xs text-muted-foreground border">
                                {firstDeckCards.slice(0, 5).map((c, i) => (
                                    <div key={i} className="py-2 border-b border-border/50 last:border-b-0 space-y-1">
                                        <div dangerouslySetInnerHTML={{ __html: c.front_html || '' }} />
                                        <div className="text-muted-foreground" dangerouslySetInnerHTML={{ __html: c.back_html || '' }} />
                                        {c.tags && c.tags.length > 0 && (
                                            <div className="flex gap-1 mt-1">
                                                {c.tags.map(t => <span key={t} className="bg-muted px-1 rounded text-[10px]">{t}</span>)}
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {firstDeckCards.length > 5 && (
                                    <div className="py-2 text-center italic">... và {firstDeckCards.length - 5} thẻ nữa</div>
                                )}
                            </div>
                        </div>
                    )}
                </CardContent>
                {parsedDecks.length > 0 && (
                    <CardFooter className="flex justify-between bg-muted/20 border-t py-4">
                        <Button variant="outline" onClick={() => { setParsedDecks([]); setFile(null) }}>Hủy bỏ</Button>
                        <Button onClick={handleImportToDatabase} disabled={isUploading}>
                            {isUploading ? (
                                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang lưu vào máy...</>
                            ) : (
                                "Bắt đầu Import (Lưu Offline)"
                            )}
                        </Button>
                    </CardFooter>
                )}
            </Card>

            {/* Section 2: Quizlet CSV/TSV */}
            <h2 className="text-xl font-semibold mt-10 mb-3">📋 Import từ Quizlet / CSV</h2>
            <Card>
                <CardHeader>
                    <CardTitle>Dán nội dung từ Quizlet</CardTitle>
                    <CardDescription>
                        Copy dữ liệu từ Quizlet hoặc dán nội dung CSV/TSV. Mỗi dòng là 1 thẻ, các cột cách nhau bởi Tab hoặc dấu phẩy. Cột đầu = Mặt trước, cột sau = Mặt sau.
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div>
                        <label className="text-sm font-medium mb-1.5 block">Tên bộ thẻ</label>
                        <input
                            type="text"
                            value={quizletDeckName}
                            onChange={e => setQuizletDeckName(e.target.value)}
                            placeholder="Ví dụ: Từ vựng HSK 3"
                            className="w-full px-4 py-2.5 rounded-xl border bg-background text-sm"
                        />
                    </div>
                    <div>
                        <label className="text-sm font-medium mb-1.5 block">Nội dung (mỗi dòng = 1 thẻ)</label>
                        <textarea
                            value={quizletText}
                            onChange={e => setQuizletText(e.target.value)}
                            placeholder={`Ví dụ:\n你好\tXin chào\n谢谢\tCảm ơn\n再见\tTạm biệt`}
                            rows={8}
                            className="w-full px-4 py-3 rounded-xl border bg-background text-sm font-mono resize-y"
                        />
                        <p className="text-xs text-muted-foreground mt-1.5">
                            {quizletText.trim() ? `${quizletText.trim().split('\n').filter(l => l.trim()).length} dòng phát hiện` : 'Chưa có dữ liệu'}
                        </p>
                    </div>
                </CardContent>
                <CardFooter className="border-t py-4">
                    <Button
                        className="w-full"
                        disabled={!quizletText.trim() || !quizletDeckName.trim() || isImportingQuizlet}
                        onClick={async () => {
                            setIsImportingQuizlet(true)
                            try {
                                const { data: { user } } = await supabase.auth.getUser()
                                const userId = user?.id || 'offline-user-local'
                                const now = new Date().toISOString()
                                const deckId = crypto.randomUUID()

                                await db.decks.add({
                                    id: deckId,
                                    user_id: userId,
                                    name: quizletDeckName.trim(),
                                    description: `Imported from Quizlet/CSV: ${new Date().toLocaleDateString()}`,
                                    created_at: now,
                                    last_reviewed: null
                                })

                                const lines = quizletText.trim().split('\n').filter(l => l.trim())
                                const cards = lines.map(line => {
                                    // Auto-detect separator: Tab > Comma > Semicolon
                                    let parts: string[]
                                    if (line.includes('\t')) {
                                        parts = line.split('\t')
                                    } else if (line.includes(',')) {
                                        parts = line.split(',')
                                    } else if (line.includes(';')) {
                                        parts = line.split(';')
                                    } else {
                                        parts = [line, '']
                                    }

                                    return {
                                        id: crypto.randomUUID(),
                                        deck_id: deckId,
                                        user_id: userId,
                                        front_html: parts[0]?.trim() || '',
                                        back_html: parts.slice(1).join(', ').trim() || '',
                                        fields: { front: parts[0]?.trim(), back: parts.slice(1).join(', ').trim() },
                                        tags: [],
                                        state: 'new' as const,
                                        due: null,
                                        reps: 0,
                                        lapses: 0,
                                        stability: 0,
                                        difficulty: 4.5,
                                        elapsed_days: 0,
                                        scheduled_days: 0,
                                        created_at: now,
                                        last_review: null
                                    }
                                })

                                await db.cards.bulkAdd(cards)
                                toast.success(`Import thành công! Đã tạo bộ "${quizletDeckName}" với ${cards.length} thẻ.`)
                                router.push('/dashboard')
                            } catch (err: any) {
                                toast.error(`Lỗi: ${err.message}`)
                            } finally {
                                setIsImportingQuizlet(false)
                            }
                        }}
                    >
                        {isImportingQuizlet ? (
                            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Đang import...</>
                        ) : (
                            <><ClipboardPaste className="mr-2 h-4 w-4" /> Import vào máy</>
                        )}
                    </Button>
                </CardFooter>
            </Card>
        </div>
    )
}

