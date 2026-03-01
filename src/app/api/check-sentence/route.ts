import { NextRequest, NextResponse } from 'next/server'

interface CheckSentenceRequest {
    sentence: string        // User's Chinese sentence
    targetWord: string      // The word being learned (Hanzi)
    meaning: string         // Vietnamese meaning for context
    pinyin?: string         // Pinyin for context
}

interface CheckSentenceResponse {
    correct: boolean
    score: number           // 1-10
    feedback: string        // Feedback in Vietnamese
    correction?: string     // Corrected sentence (if wrong)
    pinyin?: string         // Pinyin for user's sentence
    heuristicOnly?: boolean // True if AI was not used
}

// ─── Heuristic Layer (always runs first) ──────────────────────
function heuristicCheck(sentence: string, targetWord: string): { passed: boolean; reason?: string } {
    const trimmed = sentence.trim()

    if (trimmed.length < 2) {
        return { passed: false, reason: 'Câu quá ngắn. Hãy viết ít nhất một câu hoàn chỉnh.' }
    }

    // Must contain Chinese characters
    if (!/[\u4e00-\u9fff\u3400-\u4dbf]/.test(trimmed)) {
        return { passed: false, reason: 'Câu phải được viết bằng chữ Hán (tiếng Trung).' }
    }

    // Target word must appear in sentence
    if (targetWord && !trimmed.includes(targetWord)) {
        return { passed: false, reason: `Câu chưa chứa từ "${targetWord}". Hãy dùng từ này trong câu của bạn.` }
    }

    if (trimmed.length > 200) {
        return { passed: false, reason: 'Câu quá dài. Hãy viết câu ngắn gọn hơn (dưới 200 ký tự).' }
    }

    return { passed: true }
}

// ─── AI Layer via Cloudflare AI (Workers AI) ──────────────────
async function checkWithAI(
    sentence: string,
    targetWord: string,
    meaning: string,
    pinyin?: string
): Promise<CheckSentenceResponse | null> {
    const cfAccountId = process.env.CLOUDFLARE_ACCOUNT_ID
    const cfApiToken = process.env.CLOUDFLARE_API_TOKEN

    // Fallback to OpenAI if available
    const openaiKey = process.env.OPENAI_API_KEY

    if (openaiKey) {
        return checkWithOpenAI(sentence, targetWord, meaning, pinyin, openaiKey)
    }

    if (!cfAccountId || !cfApiToken) {
        return null // No AI configured
    }

    const prompt = buildPrompt(sentence, targetWord, meaning, pinyin)

    try {
        const res = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${cfAccountId}/ai/run/@cf/meta/llama-3.1-8b-instruct`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${cfApiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [
                        { role: 'system', content: systemPrompt() },
                        { role: 'user', content: prompt },
                    ],
                    max_tokens: 300,
                }),
                signal: AbortSignal.timeout(10000),
            }
        )

        if (!res.ok) return null

        const data = await res.json() as any
        const text: string = data?.result?.response || ''
        return parseAIResponse(text)
    } catch {
        return null
    }
}

async function checkWithOpenAI(
    sentence: string,
    targetWord: string,
    meaning: string,
    pinyin: string | undefined,
    apiKey: string
): Promise<CheckSentenceResponse | null> {
    try {
        const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt() },
                    { role: 'user', content: buildPrompt(sentence, targetWord, meaning, pinyin) },
                ],
                max_tokens: 300,
                temperature: 0.3,
            }),
            signal: AbortSignal.timeout(10000),
        })

        if (!res.ok) return null

        const data = await res.json() as any
        const text: string = data?.choices?.[0]?.message?.content || ''
        return parseAIResponse(text)
    } catch {
        return null
    }
}

function systemPrompt(): string {
    return `Bạn là giáo viên tiếng Trung chuyên dạy người Việt Nam. 
Khi được yêu cầu kiểm tra câu tiếng Trung, hãy trả lời CHÍNH XÁC theo format JSON sau (không thêm gì ngoài JSON):
{
  "correct": true/false,
  "score": 1-10,
  "feedback": "nhận xét ngắn gọn bằng tiếng Việt (tối đa 80 chữ)",
  "correction": "câu đúng (chỉ khi sai ngữ pháp)",
  "pinyin": "phiên âm câu của user"
}`
}

function buildPrompt(sentence: string, targetWord: string, meaning: string, pinyin?: string): string {
    const wordInfo = pinyin ? `"${targetWord}" (${pinyin}) — nghĩa: ${meaning}` : `"${targetWord}" — nghĩa: ${meaning}`
    return `Kiểm tra câu tiếng Trung sau của học sinh Việt Nam:
Từ cần dùng: ${wordInfo}
Câu học sinh viết: "${sentence}"

Đánh giá: ngữ pháp, cách dùng từ, tự nhiên. Cho score 1-10. Feedback bằng tiếng Việt ngắn gọn.`
}

function parseAIResponse(text: string): CheckSentenceResponse | null {
    try {
        // Extract JSON from response (handle markdown code blocks)
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) return null

        const parsed = JSON.parse(jsonMatch[0])
        return {
            correct: Boolean(parsed.correct),
            score: Math.min(10, Math.max(1, Number(parsed.score) || 5)),
            feedback: String(parsed.feedback || ''),
            correction: parsed.correction ? String(parsed.correction) : undefined,
            pinyin: parsed.pinyin ? String(parsed.pinyin) : undefined,
        }
    } catch {
        return null
    }
}

// ─── Route Handler ─────────────────────────────────────────────
export async function POST(req: NextRequest) {
    try {
        const body: CheckSentenceRequest = await req.json()
        const { sentence, targetWord, meaning, pinyin } = body

        if (!sentence?.trim()) {
            return NextResponse.json({ error: 'Câu không được trống' }, { status: 400 })
        }

        // Layer 1: Heuristic check
        const heuristic = heuristicCheck(sentence.trim(), targetWord)
        if (!heuristic.passed) {
            return NextResponse.json({
                correct: false,
                score: 1,
                feedback: heuristic.reason || 'Câu không hợp lệ.',
                heuristicOnly: true,
            } satisfies CheckSentenceResponse)
        }

        // Layer 2: AI check
        const aiResult = await checkWithAI(sentence.trim(), targetWord, meaning, pinyin)

        if (aiResult) {
            return NextResponse.json(aiResult)
        }

        // Fallback: heuristic says OK but no AI → return basic positive
        return NextResponse.json({
            correct: true,
            score: 7,
            feedback: `Câu có chứa từ "${targetWord}" và trông hợp lệ! (Không có AI để kiểm tra chi tiết ngữ pháp.)`,
            heuristicOnly: true,
        } satisfies CheckSentenceResponse)

    } catch (error) {
        console.error('check-sentence error:', error)
        return NextResponse.json({ error: 'Lỗi kiểm tra câu' }, { status: 500 })
    }
}
