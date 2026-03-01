"use client"

/**
 * Utility: Parse Anki card into 3 distinct fields for study modes
 * - hanzi: Chinese characters (汉字)
 * - pinyin: Phonetic transcription (pīnyīn)
 * - meaning: Vietnamese/English translation (nghĩa)
 */

// ============================================================
// Unicode Detection Helpers
// ============================================================

/** Check if text contains Chinese characters */
export function hasChinese(text: string): boolean {
    return /[\u4e00-\u9fff\u3400-\u4dbf]/.test(text);
}

/** Check if text is ONLY Chinese characters (plus punctuation/numbers) */
export function isOnlyChinese(text: string): boolean {
    const clean = text.replace(/[\s\d.,!?;:()（）【】\[\]\-\/·。，、：；！？""''《》]/g, '');
    return clean.length > 0 && [...clean].every(c => /[\u4e00-\u9fff\u3400-\u4dbf]/.test(c));
}

/** Check if text contains pinyin tone marks */
export function hasPinyinTones(text: string): boolean {
    return /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(text);
}

/** Check if text looks like pinyin (Latin + tone marks or tone numbers) */
export function isPinyin(text: string): boolean {
    if (hasPinyinTones(text)) return true;
    // Check for numbered pinyin like "bai2" or "xia4"
    if (/^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s\d,'·\-]+$/.test(text) && /[a-zA-Z]/.test(text) && text.length < 60) {
        return true;
    }
    return false;
}

/** Check if text is metadata line (Bộ:, Hán Việt:, etc.) */
function isMetadata(text: string): boolean {
    return /^(Bộ:|Hán Việt:|Số nét:|HSK|Strokes|Radical|部首|笔画|Level|Tags?:|Note)/i.test(text);
}

// ============================================================
// Core Parser
// ============================================================

export interface ParsedCardFields {
    hanzi: string;      // Chinese characters
    pinyin: string;     // Phonetic transcription
    meaning: string;    // Vietnamese/English meaning
}

/** Strip HTML tags and clean text */
function stripHtml(html: string): string {
    if (!html) return '';
    let text = html;
    text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
    text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
    text = text.replace(/\[sound:[^\]]+\]/gi, '');
    text = text.replace(/<audio[^>]*>[\s\S]*?<\/audio>/gi, '');
    text = text.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '');
    text = text.replace(/<input[^>]*>/gi, '');
    text = text.replace(/<img[^>]*>/gi, '');
    // Add line breaks before block elements
    text = text.replace(/<br\s*\/?>/gi, '\n');
    text = text.replace(/<\/div>/gi, '\n');
    text = text.replace(/<\/p>/gi, '\n');
    text = text.replace(/<\/li>/gi, '\n');
    text = text.replace(/<\/tr>/gi, '\n');
    // Remove all remaining tags
    text = text.replace(/<[^>]+>/g, '');
    text = text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
    text = text.replace(/&lt;/g, '<').replace(/&gt;/g, '>');
    return text.trim();
}

/**
 * Parse an Anki card into 3 separate fields: hanzi, pinyin, meaning.
 * Works with diverse Anki card structures (HSK, GTHN, custom decks).
 */
export function parseCardFields(card: { front_html?: string; back_html?: string; fields?: any }): ParsedCardFields {
    const result: ParsedCardFields = { hanzi: '', pinyin: '', meaning: '' };

    // === Step 1: Extract hanzi from front_html ===
    const frontText = stripHtml(card.front_html || '');
    if (hasChinese(frontText)) {
        result.hanzi = frontText.split('\n').map(l => l.trim()).filter(l => l.length > 0)[0] || frontText;
    } else {
        // front might be pinyin or meaning in some decks
        result.meaning = frontText;
    }

    // === Step 2: Parse back_html into lines and classify each ===
    let backHtml = card.back_html || '';

    // Cut off FrontSide repetition (before <hr id=answer>)
    const hrMatch = backHtml.match(/<hr[^>]*id=["']?answer["']?[^>]*>/i);
    if (hrMatch && hrMatch.index !== undefined) {
        backHtml = backHtml.substring(hrMatch.index + hrMatch[0].length);
    }

    const backText = stripHtml(backHtml);
    const lines = backText.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    for (const line of lines) {
        // Skip metadata lines
        if (isMetadata(line)) continue;
        // Skip very short lines (single chars, dots, etc.)
        if (line.length < 2) continue;

        if (isOnlyChinese(line)) {
            // This is likely a repeat of the front hanzi, skip if we already have hanzi
            if (!result.hanzi) result.hanzi = line;
            continue;
        }

        // LUÔN kiểm tra Pinyin trước khi gán meaning — đảm bảo meaning là TV/EN thuần
        if (isPinyin(line)) {
            if (!result.pinyin) result.pinyin = line;
            continue; // Bỏ qua, KHÔNG BAO GIỜ gán pinyin vào meaning
        }

        if (!result.meaning && !isOnlyChinese(line) && !hasChinese(line)) {
            result.meaning = line.length > 80 ? line.substring(0, 77) + '...' : line;
            continue;
        }

        // If both pinyin and meaning are filled, stop
        if (result.pinyin && result.meaning) break;
    }

    // === Step 3: Try to use structured fields JSON if available ===
    if (card.fields && typeof card.fields === 'object') {
        const f = card.fields;
        // Common field name patterns
        if (!result.hanzi && (f.Simplified || f.Hanzi || f.Chinese || f.Word || f.Front || f['汉字'])) {
            result.hanzi = stripHtml(f.Simplified || f.Hanzi || f.Chinese || f.Word || f.Front || f['汉字']);
        }
        if (!result.pinyin && (f.Pinyin || f.Reading || f.Pronunciation || f['拼音'])) {
            result.pinyin = stripHtml(f.Pinyin || f.Reading || f.Pronunciation || f['拼音']);
        }
        if (!result.meaning && (f.Meaning || f.Vietnamese || f.English || f.Back || f.Definition || f['意思'] || f['nghĩa'])) {
            result.meaning = stripHtml(f.Meaning || f.Vietnamese || f.English || f.Back || f.Definition || f['意思'] || f['nghĩa']);
        }
    }

    // === Step 4: Fallbacks ===
    if (!result.hanzi && frontText) {
        result.hanzi = frontText;
    }

    // If meaning is still empty but we have content, try harder
    if (!result.meaning && lines.length > 0) {
        for (const line of lines) {
            if (line !== result.hanzi && line !== result.pinyin && !isOnlyChinese(line) && !isMetadata(line)) {
                result.meaning = line.length > 80 ? line.substring(0, 77) + '...' : line;
                break;
            }
        }
    }

    return result;
}

// ============================================================
// Study Direction Types
// ============================================================

export type StudyDirection = 'hanzi_to_meaning' | 'hanzi_to_pinyin' | 'meaning_to_hanzi' | 'pinyin_to_meaning';

export interface StudyPair {
    prompt: string;     // What to show as the question
    answer: string;     // What the user needs to answer
    promptLabel: string; // Label for the prompt (e.g., "Chữ Hán")
    answerLabel: string; // Label for the answer (e.g., "Nghĩa Tiếng Việt")
}

/**
 * Get the prompt/answer pair for a given study direction.
 */
export function getStudyPair(fields: ParsedCardFields, direction: StudyDirection): StudyPair {
    switch (direction) {
        case 'hanzi_to_meaning':
            return {
                prompt: fields.hanzi || '?',
                answer: fields.meaning || fields.pinyin || '?',
                promptLabel: 'Chữ Hán',
                answerLabel: 'Nghĩa Tiếng Việt',
            };
        case 'hanzi_to_pinyin':
            return {
                prompt: fields.hanzi || '?',
                answer: fields.pinyin || '?',
                promptLabel: 'Chữ Hán',
                answerLabel: 'Pinyin',
            };
        case 'meaning_to_hanzi':
            return {
                prompt: fields.meaning || fields.pinyin || '?',
                answer: fields.hanzi || '?',
                promptLabel: 'Nghĩa Tiếng Việt',
                answerLabel: 'Chữ Hán',
            };
        case 'pinyin_to_meaning':
            return {
                prompt: fields.pinyin || fields.hanzi || '?',
                answer: fields.meaning || '?',
                promptLabel: 'Pinyin',
                answerLabel: 'Nghĩa Tiếng Việt',
            };
        default:
            return {
                prompt: fields.hanzi || '?',
                answer: fields.meaning || '?',
                promptLabel: 'Thuật ngữ',
                answerLabel: 'Đáp án',
            };
    }
}
