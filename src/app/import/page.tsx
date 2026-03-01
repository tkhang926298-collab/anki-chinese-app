"use client"

import dynamic from "next/dynamic"
import { Loader2 } from "lucide-react"

const ImportContent = dynamic(() => import("./import-content"), {
    ssr: false,
    loading: () => (
        <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
    ),
})

export default function ImportPage() {
    return <ImportContent />
}
