"use client"

import { useEffect, useRef, useState } from "react"
import { Play, RotateCcw, PenTool } from "lucide-react"
// @ts-ignore - hanzi-writer không có type definitions chuẩn của Typescript
import HanziWriter from "hanzi-writer"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

interface HanziWriterModalProps {
    isOpen: boolean
    onClose: () => void
    character: string
}

export function HanziWriterModal({ isOpen, onClose, character }: HanziWriterModalProps) {
    const writerRef = useRef<HTMLDivElement>(null)
    const [writerInstance, setWriterInstance] = useState<any>(null)
    const [mode, setMode] = useState<'animate' | 'quiz'>('animate')

    // Khởi tạo HanziWriter khi Modal được mở
    useEffect(() => {
        if (!isOpen || !character || !writerRef.current) return

        // Xoá canvas cũ (nếu có)
        writerRef.current.innerHTML = ""

        try {
            const writer = HanziWriter.create(writerRef.current, character, {
                width: 200,
                height: 200,
                padding: 10,
                strokeAnimationSpeed: 1.5, // Nhanh hơn mặc định 1 chút 
                delayBetweenStrokes: 150, // Giảm độ trễ giữa các nét
                strokeColor: '#10b981', // emerald-500
                outlineColor: '#e2e8f0', // slate-200
                drawingColor: '#3b82f6', // blue-500
                showOutline: true,
                showCharacter: false,
            })
            setWriterInstance(writer)

            // Mặc định tự vẽ 1 lần ngay khi mở lên
            writer.animateCharacter()
        } catch (error) {
            console.error("Lỗi khi load HanziWriter", error)
        }

        return () => {
            // Clean up: không cho quiz chạy ngầm
            if (writerInstance) writerInstance.cancelQuiz()
        }
    }, [isOpen, character])

    // Lắng nghe thay đổi Mode (Animate vs Quiz)
    useEffect(() => {
        if (!writerInstance) return

        if (mode === 'animate') {
            writerInstance.cancelQuiz()
            writerInstance.animateCharacter()
        } else if (mode === 'quiz') {
            // Chạy chế độ Quiz: Bắt người dùng dùng chuột vẽ nét
            writerInstance.quiz({
                onComplete: function (summaryData: any) {
                    console.log('Quiz completed!', summaryData)
                    // Vẽ xong thì flash màu xanh báo hiệu hoàn thành
                    writerInstance.hideOutline()
                    writerInstance.showCharacter()
                    setTimeout(() => {
                        writerInstance.hideCharacter()
                        writerInstance.showOutline()
                        writerInstance.quiz() // Lặp lại quiz
                    }, 1000)
                }
            })
        }
    }, [mode, writerInstance])

    const handleReset = () => {
        if (!writerInstance) return

        if (mode === 'animate') {
            writerInstance.animateCharacter()
        } else {
            writerInstance.cancelQuiz()
            writerInstance.quiz()
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-md border-emerald-500/20 shadow-xl shadow-emerald-500/10">
                <DialogHeader>
                    <DialogTitle className="text-xl flex items-center justify-center gap-2">
                        <PenTool className="w-5 h-5 text-emerald-500" />
                        Luyện Viết Chữ Hán
                    </DialogTitle>
                    <DialogDescription className="text-center">
                        Xem thứ tự nét hoặc tự tay dùng chuột/cảm ứng để tập viết chữ.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center justify-center py-6 space-y-6">
                    {/* Ô vẽ chữ */}
                    <div
                        className="bg-muted/50 rounded-xl border-2 border-emerald-500/20 overflow-hidden relative shadow-inner"
                        id="hanzi-writer-target"
                        ref={writerRef}
                    >
                        {/* HanziWriter Svg/Canvas sẽ mount vào đây */}
                    </div>

                    <h2 className="text-4xl font-serif text-foreground font-bold">
                        {character}
                    </h2>

                    {/* Controls */}
                    <div className="flex gap-4 p-1 bg-muted/50 rounded-lg">
                        <Button
                            type="button"
                            variant={mode === 'animate' ? "default" : "ghost"}
                            className={mode === 'animate' ? "bg-emerald-500 hover:bg-emerald-600 shadow-md" : ""}
                            onClick={() => setMode('animate')}
                        >
                            <Play className="w-4 h-4 mr-2" />
                            Xem mẫu
                        </Button>
                        <Button
                            type="button"
                            variant={mode === 'quiz' ? "default" : "ghost"}
                            className={mode === 'quiz' ? "bg-blue-500 hover:bg-blue-600 shadow-md" : ""}
                            onClick={() => setMode('quiz')}
                        >
                            <PenTool className="w-4 h-4 mr-2" />
                            Tự viết (Quiz)
                        </Button>
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleReset}
                        className="text-muted-foreground"
                    >
                        <RotateCcw className="w-4 h-4 mr-2" />
                        Viết lại
                    </Button>

                </div>
            </DialogContent>
        </Dialog>
    )
}
