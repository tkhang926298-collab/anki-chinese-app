import { db } from "@/lib/db/local"
import { createClient } from "@/lib/supabase/client"

export async function seedHskDatabase() {
    try {
        // Only seed if db is empty
        const deckCount = await db.decks.count()
        if (deckCount > 0) return false

        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        const userId = user?.id || 'offline-user-local'
        const now = new Date().toISOString()

        console.log("Seeding Database from /hsk_database.json...")

        const res = await fetch('/hsk_database.json')
        if (!res.ok) throw new Error("Không thể tải file dữ liệu HSK")
        const hskData = await res.json()

        // Group by deck (HSK 1, HSK 2...)
        const decksMap = new Map<string, any[]>()
        for (const item of hskData) {
            const deckName = item.deck || "HSK Khác"
            if (!decksMap.has(deckName)) {
                decksMap.set(deckName, [])
            }
            decksMap.get(deckName)!.push(item)
        }

        let totalInserted = 0;

        for (const [deckName, items] of decksMap.entries()) {
            const deckId = crypto.randomUUID()
            await db.decks.add({
                id: deckId,
                user_id: userId,
                name: `[Chuẩn] Từ vựng ${deckName}`,
                description: `Bộ từ vựng HSK gốc của hệ thống.`,
                created_at: now,
                last_reviewed: null
            })

            const cards = items.map(item => {
                let frontHtml = `<div class="text-4xl font-bold mb-4 text-center">${item.hanzi}</div>`
                if (item.example) {
                    frontHtml += `<div class="text-sm text-muted-foreground mt-4 text-center italic border-t pt-2">${item.example.sentence_hanzi}</div>`
                }

                let backHtml = `<div class="text-2xl text-primary text-center mb-2">${item.pinyin}</div>`
                backHtml += `<div class="text-lg text-center dark:text-zinc-300 font-medium">${item.meaning}</div>`
                if (item.example) {
                    backHtml += `<div class="mt-4 pt-4 border-t text-sm text-center">`
                    if (item.example.sentence_pinyin) backHtml += `<div class="text-xs text-muted-foreground mb-1">${item.example.sentence_pinyin}</div>`
                    if (item.example.sentence_meaning) backHtml += `<div class="italic text-foreground/80">${item.example.sentence_meaning}</div>`
                    backHtml += `</div>`
                }

                return {
                    id: crypto.randomUUID(),
                    deck_id: deckId,
                    user_id: userId,
                    front_html: frontHtml,
                    back_html: backHtml,
                    fields: item,
                    tags: [deckName],
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
            totalInserted += cards.length
        }

        console.log(`Seeded successfully: ${totalInserted} cards.`)
        return true
    } catch (err) {
        console.error("Failed to seed database:", err)
        return false
    }
}
