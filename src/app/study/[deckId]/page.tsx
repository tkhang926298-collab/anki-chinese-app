"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

const StudyContent = dynamic(() => import("./study-content"), {
    ssr: false,
    loading: () => (
        <div className="flex h-screen w-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
    ),
})

export default function StudyPage() {
    return <StudyContent />
}
