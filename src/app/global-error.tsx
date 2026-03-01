"use client"

import { useEffect } from "react"

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string }
    reset: () => void
}) {
    useEffect(() => {
        console.error("Global error:", error)
    }, [error])

    return (
        <html>
            <body>
                <div style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "100vh",
                    fontFamily: "system-ui, sans-serif",
                    padding: "2rem",
                    textAlign: "center",
                    background: "#0a0a0a",
                    color: "#fafafa"
                }}>
                    <h1 style={{ fontSize: "1.5rem", fontWeight: "bold", marginBottom: "0.5rem" }}>
                        Ứng dụng gặp sự cố
                    </h1>
                    <p style={{ color: "#888", marginBottom: "1.5rem" }}>
                        Đã xảy ra lỗi không mong muốn. Vui lòng thử lại.
                    </p>
                    <button
                        onClick={reset}
                        style={{
                            padding: "0.75rem 1.5rem",
                            borderRadius: "0.5rem",
                            border: "1px solid #333",
                            background: "#1a1a1a",
                            color: "#fafafa",
                            cursor: "pointer",
                            fontSize: "0.875rem",
                            fontWeight: "500"
                        }}
                    >
                        Thử lại
                    </button>
                </div>
            </body>
        </html>
    )
}
