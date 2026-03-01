"use client"

/**
 * Utility: Parse Anki card into 3 distinct fields for study modes
 * - hanzi: Chinese characters (汉字)
 * - pinyin: Phonetic transcription (pīnyīn)
 * - meaning: Vietnamese/English translation (nghĩa)
 *
 * Supports multiple Anki deck formats:
 *   Format A: HSK Full (7 fields): [Mặt trước, Tiếng Việt, Phiên âm, Audio, Hình ảnh, Từ Điển, Mở rộng]
 *   Format B: T_vng_HSK (3 fields): [Mặt trước, Mặt sau, Phiên âm]
 *   Format C: 3000 Câu (8 fields): [Sentence, Translation, Target Word, Definitions, ...]
 *   Format D: Chinese Speaking (9 fields): [№, Phrase Vietnamese, Part of Speech, Phrase Chinese, ...]
 *   Format E/F: English decks with Vietnamese meaning
 *   Generic: Basic [Front, Back] format
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

/** Check if text contains Vietnamese diacritics — MUST check BEFORE isPinyin */
export function hasVietnameseDiacritics(text: string): boolean {
    return /[àáạảãăắằẳẵặâấầẩẫậèéẹẻẽêếềểễệìíịỉĩòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹđĐ]/i.test(text);
}

/** Check if text contains pinyin tone marks */
export function hasPinyinTones(text: string): boolean {
    return /[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]/.test(text);
}

/** Check if text looks like pinyin (Latin + tone marks or tone numbers) */
export function isPinyin(text: string): boolean {
    // Vietnamese text is NEVER pinyin
    if (hasVietnameseDiacritics(text)) return false;
    if (hasPinyinTones(text)) return true;
    // Check for numbered pinyin like "bai2" or "xia4"
    if (/^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s\d,'·\-]+$/.test(text) && /[a-zA-Z]/.test(text) && text.length < 60) {
        return true;
    }
    return false;
}

/** Check if text is metadata line (Bộ:, Hán Việt:, etc.) */
function isMetadata(text: string): boolean {
    return /^(Bộ:|Hán Việt:|Số nét:|HSK|Strokes|Radical|部首|笔画|Level|Tags?:|Note|Từ phồn thể)/i.test(text);
}

/** Check if text is an example sentence (numbered, long, English) */
function isExampleSentence(text: string): boolean {
    // Numbered sentences like "1.Mother always filled things up..."
    if (/^\d+\.\s*[A-Z]/.test(text) && text.length > 40) return true;
    // Very long text is likely an example, not a meaning
    if (text.length > 100 && !hasVietnameseDiacritics(text)) return true;
    return false;
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

// ============================================================
// Field Name Mapping for structured fields
// ============================================================

const HANZI_FIELD_NAMES = [
    'mặt trước', 'chữ hán', 'front', 'sentence', 'phrase chinese', 'phrase_chinese',
    'word', 'hanzi', 'chinese', 'simplified', 'keyword', '汉字', 'character'
];

const MEANING_FIELD_NAMES = [
    'nghĩa', 'tiếng việt', 'mặt sau', 'vietnamese', 'definitions', 'definition',
    'phrase vietnamese', 'phrase_vietnamese', 'short vietnamese', 'short_vietnamese',
    'meaning', 'back', '意思', 'translation_vn', 'full vietnamese'
];

const PINYIN_FIELD_NAMES = [
    'pinyin', 'phiên âm', 'reading', 'pronunciation', '拼音',
    'transcription', 'ipa'
];

const HANVIET_FIELD_NAMES = [
    'hán việt'
];

function matchesFieldName(name: string, patterns: string[]): boolean {
    const lower = name.toLowerCase().trim();
    return patterns.some(p => lower === p || lower.includes(p));
}

/**
 * Parse structured fields (JSON object with named keys).
 * Returns true if successfully extracted at least hanzi or meaning.
 */
function parseNamedFields(fields: Record<string, any>, result: ParsedCardFields): boolean {
    let found = false;

    for (const [key, value] of Object.entries(fields)) {
        if (!value || typeof value !== 'string') continue;
        const cleanVal = stripHtml(value);
        if (!cleanVal || cleanVal.length < 1) continue;

        if (!result.hanzi && matchesFieldName(key, HANZI_FIELD_NAMES)) {
            result.hanzi = cleanVal;
            found = true;
        } else if (!result.meaning && matchesFieldName(key, MEANING_FIELD_NAMES)) {
            result.meaning = cleanVal.length > 80 ? cleanVal.substring(0, 77) + '...' : cleanVal;
            found = true;
        } else if (!result.pinyin && matchesFieldName(key, PINYIN_FIELD_NAMES)) {
            result.pinyin = cleanVal;
            found = true;
        } else if (matchesFieldName(key, HANVIET_FIELD_NAMES)) {
            // Hán Việt is stored but not used for display; skip to avoid confusion
            found = true;
        }
    }

    return found;
}

/**
 * Parse structured fields (JSON array — positional).
 * Uses field position heuristics based on known Anki formats.
 */
function parseArrayFields(fields: string[], result: ParsedCardFields): boolean {
    if (!fields || fields.length < 2) return false;

    // Clean all fields first
    const cleaned = fields.map(f => stripHtml(f || ''));

    // === Strategy: Analyze content to determine format ===

    // Check if field[0] is Chinese → HSK-like format
    if (cleaned[0] && hasChinese(cleaned[0])) {
        result.hanzi = cleaned[0];

        if (cleaned.length >= 3) {
            // Format A/B: [Hanzi, Vietnamese, Pinyin, ...]
            // Check if field[1] looks like Vietnamese meaning (not Pinyin)
            const f1 = cleaned[1];
            const f2 = cleaned[2];

            if (f1 && !hasChinese(f1)) {
                // Field[1] could be Vietnamese meaning or Pinyin
                if (hasVietnameseDiacritics(f1) || (!isPinyin(f1) && !hasPinyinTones(f1))) {
                    // It's Vietnamese meaning
                    result.meaning = f1.length > 80 ? f1.substring(0, 77) + '...' : f1;
                    if (f2 && !hasChinese(f2) && (isPinyin(f2) || hasPinyinTones(f2))) {
                        result.pinyin = f2;
                    }
                } else if (hasPinyinTones(f1)) {
                    // Format C-like: [Sentence, Pinyin, ?, Meaning]
                    result.pinyin = f1;
                    // Look for meaning in field[3] (Definitions)
                    if (cleaned.length > 3 && cleaned[3] && !hasChinese(cleaned[3])) {
                        result.meaning = cleaned[3].length > 80 ? cleaned[3].substring(0, 77) + '...' : cleaned[3];
                    }
                }
            }
        } else if (cleaned.length === 2) {
            // Simple [Hanzi, Meaning/Pinyin]
            const f1 = cleaned[1];
            if (f1 && !hasChinese(f1)) {
                if (hasVietnameseDiacritics(f1) || !isPinyin(f1)) {
                    result.meaning = f1.length > 80 ? f1.substring(0, 77) + '...' : f1;
                } else {
                    result.pinyin = f1;
                }
            }
        }
        return true;
    }

    // Check if field[3] is Chinese → Chinese Speaking Practice format (D)
    if (cleaned.length > 3 && cleaned[3] && hasChinese(cleaned[3])) {
        result.hanzi = cleaned[3];
        if (cleaned[1] && !hasChinese(cleaned[1])) {
            result.meaning = cleaned[1].length > 80 ? cleaned[1].substring(0, 77) + '...' : cleaned[1];
        }
        if (cleaned[2] && !hasChinese(cleaned[2])) {
            result.pinyin = cleaned[2];
        }
        return true;
    }

    // Fallback: first field with Chinese = hanzi, first non-Chinese = meaning
    for (const f of cleaned) {
        if (!result.hanzi && hasChinese(f)) {
            result.hanzi = f;
        } else if (!result.meaning && f && !hasChinese(f) && f !== result.hanzi) {
            if (hasVietnameseDiacritics(f) || !isPinyin(f)) {
                result.meaning = f.length > 80 ? f.substring(0, 77) + '...' : f;
            } else if (!result.pinyin) {
                result.pinyin = f;
            }
        }
    }

    return !!(result.hanzi || result.meaning);
}

/**
 * Parse an Anki card into 3 separate fields: hanzi, pinyin, meaning.
 * Works with diverse Anki card structures (HSK, GTHN, custom decks).
 *
 * Priority:
 *  1. fields JSON (named object) → field name mapping
 *  2. fields JSON (array) → positional heuristics
 *  3. front_html + back_html → line-by-line classification
 */
export function parseCardFields(card: { front_html?: string; back_html?: string; fields?: any; namedFields?: Record<string, string> }): ParsedCardFields {
    const result: ParsedCardFields = { hanzi: '', pinyin: '', meaning: '' };

    // === Step 1: Try namedFields first (highest priority — has field names) ===
    if (card.namedFields && typeof card.namedFields === 'object') {
        const success = parseNamedFields(card.namedFields, result);
        if (success && result.hanzi && result.meaning) return result;
    }

    // === Step 2: Try structured fields ===
    if (card.fields) {
        if (Array.isArray(card.fields) && card.fields.length >= 2) {
            const success = parseArrayFields(card.fields as string[], result);
            if (success && result.hanzi && result.meaning) return result;
        } else if (typeof card.fields === 'object' && !Array.isArray(card.fields)) {
            const success = parseNamedFields(card.fields, result);
            if (success && result.hanzi && result.meaning) return result;
        }
    }

    // === Step 3: Extract hanzi from front_html (if not already found) ===
    const frontText = stripHtml(card.front_html || '');
    if (!result.hanzi && hasChinese(frontText)) {
        result.hanzi = frontText.split('\n').map(l => l.trim()).filter(l => l.length > 0)[0] || frontText;
    } else if (!result.hanzi && frontText && !hasChinese(frontText)) {
        // Reversed card: front is Vietnamese meaning, back should have Chinese
        // Don't assign to meaning here — let back_html parsing find hanzi first
    }

    // === Step 4: Parse back_html into lines and classify each ===
    if (!result.meaning || !result.pinyin) {
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
            // Skip example sentences
            if (isExampleSentence(line)) continue;

            // Pure Chinese → hanzi (skip if already have)
            if (isOnlyChinese(line)) {
                if (!result.hanzi) result.hanzi = line;
                continue;
            }

            // ⭐ Check Vietnamese FIRST — Vietnamese is ALWAYS meaning, NEVER pinyin
            if (hasVietnameseDiacritics(line) && !hasChinese(line)) {
                if (!result.meaning) {
                    result.meaning = line.length > 80 ? line.substring(0, 77) + '...' : line;
                }
                continue;
            }

            // Check Pinyin (tone marks) — only after excluding Vietnamese
            if (hasPinyinTones(line) && !hasChinese(line)) {
                if (!result.pinyin) result.pinyin = line;
                continue;
            }

            // Check pure Latin short text → likely pinyin without tone marks
            if (isPinyin(line)) {
                if (!result.pinyin) result.pinyin = line;
                continue;
            }

            // Remaining non-Chinese text → meaning (fallback)
            if (!result.meaning && !hasChinese(line)) {
                result.meaning = line.length > 80 ? line.substring(0, 77) + '...' : line;
                continue;
            }

            // If both pinyin and meaning are filled, stop
            if (result.pinyin && result.meaning) break;
        }
    }

    // === Step 4: Fallbacks ===
    if (!result.hanzi && frontText) {
        result.hanzi = frontText;
    }

    // If meaning is still empty, try harder from back_html lines
    if (!result.meaning) {
        const backText = stripHtml(card.back_html || '');
        const lines = backText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (const line of lines) {
            if (line !== result.hanzi && line !== result.pinyin && !isOnlyChinese(line) && !isMetadata(line) && !isExampleSentence(line)) {
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
