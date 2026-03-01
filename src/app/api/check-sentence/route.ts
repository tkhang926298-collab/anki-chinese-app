import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// ─── Types ─────────────────────────────────────────────────────
interface CheckSentenceRequest {
    sentence: string
    targetWord: string
    meaning: string
    pinyin?: string
    cardId?: string
    userId?: string       // pass from client for history saving
}

export interface CheckSentenceResponse {
    correct: boolean
    score?: number            // 1-10 (absent if google/heuristic only)
    feedback?: string         // explanation in Vietnamese
    correction?: string       // corrected sentence
    sentencePinyin?: string   // pinyin of user's sentence
    checkedBy: 'groq' | 'openai' | 'languagetool' | 'cloudflare' | 'google' | 'heuristic'
    historyId?: string        // Supabase record id if saved
}

// ─── 0. Heuristic (always first) ──────────────────────────────
function heuristicCheck(sentence: string, targetWord: string): string | null {
    const s = sentence.trim()
    if (s.length < 2) return 'Câu quá ngắn. Hãy viết ít nhất một câu hoàn chỉnh.'
    if (!/[\u4e00-\u9fff\u3400-\u4dbf]/.test(s)) return 'Câu phải viết bằng chữ Hán.'
    if (targetWord && !s.includes(targetWord)) return `Câu chưa chứa từ "${targetWord}". Hãy dùng từ này trong câu.`
    if (s.length > 200) return 'Câu quá dài (>200 ký tự). Hãy viết ngắn lại.'
    return null // OK
}

// ─── Shared helpers ────────────────────────────────────────────
const SYSTEM_PROMPT = `Bạn là giáo viên tiếng Trung dạy người Việt Nam. Kiểm tra câu tiếng Trung và trả lời CHỈ bằng JSON hợp lệ theo cấu trúc:
{"correct":true/false,"score":1-10,"feedback":"nhận xét tiếng Việt tối đa 80 chữ","correction":"câu sửa nếu sai (null nếu đúng)","pinyin":"phiên âm câu user"}`

function buildUserMessage(sentence: string, targetWord: string, meaning: string, pinyin?: string): string {
    return `Từ cần dùng: "${targetWord}"${pinyin ? ` (${pinyin})` : ''} — nghĩa: ${meaning}
Câu học sinh: "${sentence}"
Đánh giá ngữ pháp, dùng từ, tự nhiên. Trả lời JSON:`
}

function parseJSON(text: string): CheckSentenceResponse | null {
    try {
        const m = text.match(/\{[\s\S]*?\}/)
        if (!m) return null
        const p = JSON.parse(m[0])
        return {
            correct: Boolean(p.correct),
            score: p.score ? Math.min(10, Math.max(1, Number(p.score))) : undefined,
            feedback: p.feedback ? String(p.feedback) : undefined,
            correction: p.correction && p.correction !== 'null' ? String(p.correction) : undefined,
            sentencePinyin: p.pinyin ? String(p.pinyin) : undefined,
            checkedBy: 'groq', // will be overridden by caller
        }
    } catch { return null }
}

const TIMEOUT_MS = 8000
// AbortSignal.timeout is available in Node 17+ and Edge runtime
const makeSignal = () => {
    try { return (AbortSignal as any).timeout(TIMEOUT_MS) } catch { return undefined }
}

// ─── Layer 1: Groq ─────────────────────────────────────────────
async function checkWithGroq(sentence: string, word: string, meaning: string, pinyin?: string): Promise<CheckSentenceResponse | null> {
    const key = process.env.GROQ_API_KEY
    if (!key) return null
    try {
        const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserMessage(sentence, word, meaning, pinyin) }],
                max_tokens: 300, temperature: 0.2,
            }),
            signal: makeSignal(),
        })
        if (!res.ok) return null
        const data: any = await res.json()
        const text: string = data?.choices?.[0]?.message?.content || ''
        const parsed = parseJSON(text)
        if (parsed) { parsed.checkedBy = 'groq'; return parsed }
    } catch { /* fallthrough */ }
    return null
}

// ─── Layer 2: OpenAI ───────────────────────────────────────────
async function checkWithOpenAI(sentence: string, word: string, meaning: string, pinyin?: string): Promise<CheckSentenceResponse | null> {
    const key = process.env.OPENAI_API_KEY
    if (!key) return null
    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserMessage(sentence, word, meaning, pinyin) }],
                max_tokens: 300, temperature: 0.2,
            }),
            signal: makeSignal(),
        })
        if (!res.ok) return null
        const data: any = await res.json()
        const text: string = data?.choices?.[0]?.message?.content || ''
        const parsed = parseJSON(text)
        if (parsed) { parsed.checkedBy = 'openai'; return parsed }
    } catch { /* fallthrough */ }
    return null
}

// ─── Layer 3: LanguageTool (free, Chinese support is limited but tries) ───
async function checkWithLanguageTool(sentence: string, word: string): Promise<CheckSentenceResponse | null> {
    try {
        const body = new URLSearchParams({ text: sentence, language: 'zh-CN' })
        const res = await fetch('https://api.languagetool.org/v2/check', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
            signal: makeSignal(),
        })
        if (!res.ok) return null
        const data: any = await res.json()
        const matches: any[] = data?.matches || []
        if (!sentence.includes(word)) {
            return { correct: false, feedback: `Câu chưa chứa từ "${word}".`, checkedBy: 'languagetool' }
        }
        if (matches.length === 0) {
            return { correct: true, score: 8, feedback: 'LanguageTool không phát hiện lỗi ngữ pháp.', checkedBy: 'languagetool' }
        }
        const firstMatch = matches[0]
        const correction = firstMatch?.replacements?.[0]?.value
        const context = firstMatch?.context?.text || ''
        return {
            correct: false,
            score: Math.max(1, 7 - matches.length),
            feedback: `Phát hiện ${matches.length} lỗi. Lỗi đầu: "${context.trim()}"`,
            correction: correction ? sentence.replace(firstMatch.context.text.slice(firstMatch.context.offset, firstMatch.context.offset + firstMatch.length), correction) : undefined,
            checkedBy: 'languagetool',
        }
    } catch { /* fallthrough */ }
    return null
}

// ─── Layer 4: Cloudflare AI ────────────────────────────────────
async function checkWithCloudflare(sentence: string, word: string, meaning: string, pinyin?: string): Promise<CheckSentenceResponse | null> {
    const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const token = process.env.CLOUDFLARE_API_TOKEN
    if (!accountId || !token) return null
    try {
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: buildUserMessage(sentence, word, meaning, pinyin) }],
                    max_tokens: 300,
                }),
                signal: makeSignal(),
            }
        )
        if (!res.ok) return null
        const data: any = await res.json()
        const text: string = data?.result?.response || ''
        const parsed = parseJSON(text)
        if (parsed) { parsed.checkedBy = 'cloudflare'; return parsed }
    } catch { /* fallthrough */ }
    return null
}

// ─── Layer 5: Google Translate (detect → just correct/incorrect) ───
async function checkWithGoogle(sentence: string, word: string): Promise<CheckSentenceResponse | null> {
    try {
        // Free Google Translate endpoint — translates to Vietnamese, we just check it works
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=zh-CN&tl=vi&dt=t&q=${encodeURIComponent(sentence)}`
        const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
        if (!res.ok) return null
        const data: any = await res.json()
        // If translation returned text, sentence is valid Chinese
        const translated: string = data?.[0]?.[0]?.[0] || ''
        const containsWord = sentence.includes(word)
        return {
            correct: translated.length > 0 && containsWord,
            feedback: translated.length > 0 && containsWord
                ? `Google Dịch: "${translated}"`
                : `Câu không hợp lệ hoặc chưa chứa từ "${word}".`,
            checkedBy: 'google',
        }
    } catch { /* fallthrough */ }
    return null
}

// ─── Save to Supabase ─────────────────────────────────────────
async function saveHistory(
    userId: string | undefined,
    cardId: string | undefined,
    req: CheckSentenceRequest,
    result: CheckSentenceResponse
): Promise<string | undefined> {
    if (!userId) return undefined
    try {
        const supabase = createClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.SUPABASE_SERVICE_ROLE_KEY!
        )
        const { data, error } = await supabase.from('sentence_history').insert({
            user_id: userId,
            card_id: cardId || null,
            hanzi: req.targetWord,
            pinyin: req.pinyin || null,
            meaning: req.meaning || null,
            sentence: req.sentence,
            is_correct: result.correct,
            score: result.score || null,
            feedback: result.feedback || null,
            correction: result.correction || null,
            checked_by: result.checkedBy,
        }).select('id').single()
        if (error) console.error('saveHistory error:', error.message)
        return data?.id
    } catch (e) {
        console.error('saveHistory exception:', e)
        return undefined
    }
}

// ─── Main Route Handler ───────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const body: CheckSentenceRequest = await req.json()
        const { sentence, targetWord, meaning, pinyin, cardId, userId } = body

        if (!sentence?.trim()) {
            return NextResponse.json({ error: 'Câu không được trống' }, { status: 400 })
        }

        // Step 0: Heuristic pre-check
        const heuristicError = heuristicCheck(sentence.trim(), targetWord)
        if (heuristicError) {
            const result: CheckSentenceResponse = {
                correct: false,
                feedback: heuristicError,
                checkedBy: 'heuristic',
            }
            // Save even failed heuristic checks
            result.historyId = await saveHistory(userId, cardId, body, result)
            return NextResponse.json(result)
        }

        // Step 1-5: Try AI providers in order
        const providers = [
            () => checkWithGroq(sentence.trim(), targetWord, meaning, pinyin),
            () => checkWithOpenAI(sentence.trim(), targetWord, meaning, pinyin),
            () => checkWithLanguageTool(sentence.trim(), targetWord),
            () => checkWithCloudflare(sentence.trim(), targetWord, meaning, pinyin),
            () => checkWithGoogle(sentence.trim(), targetWord),
        ]

        let result: CheckSentenceResponse | null = null
        for (const provider of providers) {
            result = await provider()
            if (result) break
        }

        // Final fallback: all providers failed
        if (!result) {
            result = {
                correct: true,
                feedback: 'Câu có vẻ hợp lệ (không có dịch vụ AI khả dụng để kiểm tra chi tiết).',
                checkedBy: 'heuristic',
            }
        }

        // Save to Supabase
        result.historyId = await saveHistory(userId, cardId, body, result)

        return NextResponse.json(result)

    } catch (error) {
        console.error('check-sentence route error:', error)
        return NextResponse.json({ error: 'Lỗi máy chủ' }, { status: 500 })
    }
}
