import fs from 'fs';

// Read database payload (cards already uploaded to Supabase)
const payloadPath = 'd:/Tu moi tieng trung/anki-chinese-app/hsk_export/database_payload.json';
const { decks, cards } = JSON.parse(fs.readFileSync(payloadPath, 'utf8'));

console.log("=== DECKS ===");
decks.forEach(d => console.log(`  ${d.id} | ${d.name}`));

console.log(`\n=== TOTAL CARDS: ${cards.length} ===`);

// Show 10 sample cards from different patterns
const sampleIndices = [0, 1, 2, 10, 50, 100, 200, 500, 1000, 2000];
for (const idx of sampleIndices) {
    if (idx >= cards.length) continue;
    const c = cards[idx];
    const frontClean = (c.front_html || '').replace(/<[^>]*>/g, '').replace(/\[sound:[^\]]+\]/g, '').trim().substring(0, 120);
    const backClean = (c.back_html || '').replace(/<[^>]*>/g, '').replace(/\[sound:[^\]]+\]/g, '').trim().substring(0, 400);
    const fieldsStr = c.fields ? JSON.stringify(c.fields).substring(0, 400) : 'null';
    console.log(`\n--- Card[${idx}] deck_id=${c.deck_id} ---`);
    console.log(`  FRONT: ${frontClean}`);
    console.log(`  BACK: ${backClean}`);
    console.log(`  FIELDS: ${fieldsStr}`);
}

// Analyze back_html patterns across all cards
let hasEnglish = 0;
let hasVietnamese = 0;
let hasPinyinTonesCount = 0;
let hasNumberedBackLines = 0;

const vnChars = /[\u00e0\u00e1\u1ea1\u1ea3\u00e3\u0103\u1eaf\u1eb1\u1eb3\u1eb5\u1eb7\u00e2\u1ea5\u1ea7\u1ea9\u1eab\u1ead\u00e8\u00e9\u1eb9\u1ebb\u1ebd\u00ea\u1ebf\u1ec1\u1ec3\u1ec5\u1ec7\u00ec\u00ed\u1ecb\u1ec9\u0129\u00f2\u00f3\u1ecd\u1ecf\u00f5\u00f4\u1ed1\u1ed3\u1ed5\u1ed7\u1ed9\u01a1\u1edb\u1edd\u1edf\u1ee1\u1ee3\u00f9\u00fa\u1ee5\u1ee7\u0169\u01b0\u1ee9\u1eeb\u1eed\u1eef\u1ef1\u1ef3\u00fd\u1ef5\u1ef7\u1ef9\u0111]/i;
const pinyinTones = /[\u0101\u00e1\u01ce\u00e0\u0113\u00e9\u011b\u00e8\u012b\u00ed\u01d0\u00ec\u014d\u00f3\u01d2\u00f2\u016b\u00fa\u01d4\u00f9\u01d6\u01d8\u01da\u01dc]/;

for (const c of cards) {
    const back = (c.back_html || '').replace(/<[^>]*>/g, '');
    if (vnChars.test(back)) hasVietnamese++;
    if (pinyinTones.test(back)) hasPinyinTonesCount++;
    if (/\d\.\s*[A-Z][a-z]/.test(back)) hasNumberedBackLines++;
    const latinOnly = back.replace(/[^a-zA-Z\s]/g, '').trim();
    if (latinOnly.length > 50 && !vnChars.test(back)) hasEnglish++;
}

console.log("\n=== STATS ===");
console.log(`  Cards with Vietnamese diacritics in back: ${hasVietnamese}`);
console.log(`  Cards with Pinyin tone marks in back: ${hasPinyinTonesCount}`);
console.log(`  Cards with numbered English lines: ${hasNumberedBackLines}`);
console.log(`  Cards with only English (no VN) in back: ${hasEnglish}`);
