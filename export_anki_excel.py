import os
import sqlite3
import zipfile
import tempfile
import json
import re
import pandas as pd

# ============================================================
# Unicode Detection Helpers (Ported from TS)
# ============================================================

def has_chinese(text: str) -> bool:
    return bool(re.search(r'[\u4e00-\u9fff\u3400-\u4dbf]', text))

def is_only_chinese(text: str) -> bool:
    clean = re.sub(r'[\s\d.,!?;:()（）【】\[\]\-\/·。，、：；！？""\'\'《》]', '', text)
    return len(clean) > 0 and all('\u4e00' <= c <= '\u9fff' or '\u3400' <= c <= '\u4dbf' for c in clean)

def has_vietnamese_diacritics(text: str) -> bool:
    return bool(re.search(r'[àáạảãăắằẳẵặâấầẩẫậèéẹẻẽêếềểễệìíịỉĩòóọỏõôốồổỗộơớờởỡợùúụủũưứừửữựỳýỵỷỹđĐ]', text, re.IGNORECASE))

def has_pinyin_tones(text: str) -> bool:
    return bool(re.search(r'[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]', text))

def is_pinyin(text: str) -> bool:
    if has_vietnamese_diacritics(text): return False
    if has_pinyin_tones(text): return True
    if re.match(r'^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s\d,\'·\-]+$', text) and re.search(r'[a-zA-Z]', text) and len(text) < 60:
        return True
    return False

def is_metadata(text: str) -> bool:
    return bool(re.match(r'^(Bộ:|Hán Việt:|Số nét:|HSK|Strokes|Radical|部首|笔画|Level|Tags?:|Note|Từ phồn thể)', text, re.IGNORECASE))

def is_example_sentence(text: str) -> bool:
    if re.match(r'^\d+\.\s*[A-Z]', text) and len(text) > 40: return True
    if len(text) > 100 and not has_vietnamese_diacritics(text): return True
    return False

def strip_html(html: str) -> str:
    if not html: return ''
    text = html
    text = re.sub(r'(?i)<style[^>]*>[\s\S]*?</style>', '', text)
    text = re.sub(r'(?i)<script[^>]*>[\s\S]*?</script>', '', text)
    text = re.sub(r'(?i)\[sound:[^\]]+\]', '', text)
    text = re.sub(r'(?i)<audio[^>]*>[\s\S]*?</audio>', '', text)
    text = re.sub(r'(?i)<button[^>]*>[\s\S]*?</button>', '', text)
    text = re.sub(r'(?i)<input[^>]*>', '', text)
    text = re.sub(r'(?i)<img[^>]*>', '', text)
    # Block elements to newline
    text = re.sub(r'(?i)<br\s*/?>', '\n', text)
    text = re.sub(r'(?i)</div>', '\n', text)
    text = re.sub(r'(?i)</p>', '\n', text)
    text = re.sub(r'(?i)</li>', '\n', text)
    text = re.sub(r'(?i)</tr>', '\n', text)
    # Remove all other tags
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&').replace('&lt;', '<').replace('&gt;', '>')
    return text.strip()

# ============================================================
# Field Mapping
# ============================================================

HANZI_FIELD_NAMES = [
    'mặt trước', 'chữ hán', 'front', 'sentence', 'phrase chinese', 'phrase_chinese',
    'word', 'hanzi', 'chinese', 'simplified', 'keyword', '汉字', 'character'
]

MEANING_FIELD_NAMES = [
    'nghĩa', 'tiếng việt', 'mặt sau', 'vietnamese', 'definitions', 'definition',
    'phrase vietnamese', 'phrase_vietnamese', 'short vietnamese', 'short_vietnamese',
    'meaning', 'back', '意思', 'translation_vn', 'full vietnamese'
]

PINYIN_FIELD_NAMES = [
    'pinyin', 'phiên âm', 'reading', 'pronunciation', '拼音',
    'transcription', 'ipa'
]

HANVIET_FIELD_NAMES = [
    'hán việt'
]

def matches_field_name(name: str, patterns: list) -> bool:
    lower = name.lower().strip()
    return any(p == lower or p in lower for p in patterns)

class ParsedCard:
    def __init__(self):
        self.hanzi = ""
        self.pinyin = ""
        self.meaning = ""

def parse_named_fields(fields: dict, result: ParsedCard) -> bool:
    found = False
    for key, value in fields.items():
        if not value or not isinstance(value, str): continue
        clean_val = strip_html(value)
        if not clean_val or len(clean_val) < 1: continue

        if not result.hanzi and matches_field_name(key, HANZI_FIELD_NAMES):
            result.hanzi = clean_val
            found = True
        elif not result.meaning and matches_field_name(key, MEANING_FIELD_NAMES):
            result.meaning = clean_val[:77] + '...' if len(clean_val) > 80 else clean_val
            found = True
        elif not result.pinyin and matches_field_name(key, PINYIN_FIELD_NAMES):
            result.pinyin = clean_val
            found = True
        elif matches_field_name(key, HANVIET_FIELD_NAMES):
            found = True
    return found

def parse_array_fields(fields: list, result: ParsedCard) -> bool:
    if not fields or len(fields) < 2: return False
    cleaned = [strip_html(f or '') for f in fields]

    if cleaned[0] and has_chinese(cleaned[0]):
        result.hanzi = cleaned[0]
        if len(cleaned) >= 3:
            f1, f2 = cleaned[1], cleaned[2]
            if f1 and not has_chinese(f1):
                if has_vietnamese_diacritics(f1) or (not is_pinyin(f1) and not has_pinyin_tones(f1)):
                    result.meaning = f1[:77] + '...' if len(f1) > 80 else f1
                    if f2 and not has_chinese(f2) and (is_pinyin(f2) or has_pinyin_tones(f2)):
                        result.pinyin = f2
                elif has_pinyin_tones(f1):
                    result.pinyin = f1
                    if len(cleaned) > 3 and cleaned[3] and not has_chinese(cleaned[3]):
                        result.meaning = cleaned[3][:77] + '...' if len(cleaned[3]) > 80 else cleaned[3]
        elif len(cleaned) == 2:
            f1 = cleaned[1]
            if f1 and not has_chinese(f1):
                if has_vietnamese_diacritics(f1) or not is_pinyin(f1):
                    result.meaning = f1[:77] + '...' if len(f1) > 80 else f1
                else:
                    result.pinyin = f1
        return True

    if len(cleaned) > 3 and cleaned[3] and has_chinese(cleaned[3]):
        result.hanzi = cleaned[3]
        if cleaned[1] and not has_chinese(cleaned[1]):
            result.meaning = cleaned[1][:77] + '...' if len(cleaned[1]) > 80 else cleaned[1]
        if cleaned[2] and not has_chinese(cleaned[2]):
            result.pinyin = cleaned[2]
        return True

    for f in cleaned:
        if not result.hanzi and has_chinese(f):
            result.hanzi = f
        elif not result.meaning and f and not has_chinese(f) and f != result.hanzi:
            if has_vietnamese_diacritics(f) or not is_pinyin(f):
                result.meaning = f[:77] + '...' if len(f) > 80 else f
            elif not result.pinyin:
                result.pinyin = f

    return bool(result.hanzi or result.meaning)

def parse_card_fields(named_fields: dict, array_fields: list, front_html: str, back_html: str) -> ParsedCard:
    result = ParsedCard()
    
    # 1. Named Fields
    if named_fields:
        success = parse_named_fields(named_fields, result)
        if success and result.hanzi and result.meaning: return result

    # 2. Array Fields
    if array_fields and len(array_fields) >= 2:
        success = parse_array_fields(array_fields, result)
        if success and result.hanzi and result.meaning: return result

    # 3. HTML parsing fallback
    front_text = strip_html(front_html)
    if not result.hanzi and has_chinese(front_text):
        lines = [l.strip() for l in front_text.split('\n') if l.strip()]
        result.hanzi = lines[0] if lines else front_text

    if not result.meaning or not result.pinyin:
        back_text = strip_html(back_html)
        # Note: simplistic stripping for python version, skipping the <hr id=answer> logic 
        # since we don't easily have full generated HTML. We process all fields anyway.
        
    return result

# ============================================================
# Main Processing
# ============================================================

def process_anki_files(directory_path, output_excel):
    all_data = []

    if not os.path.exists(directory_path):
        print(f"Directory not found: {directory_path}")
        return

    for filename in os.listdir(directory_path):
        if not filename.endswith(".apkg"): continue
        file_path = os.path.join(directory_path, filename)
        print(f"\nProcessing {filename}...")
        
        with tempfile.TemporaryDirectory() as temp_dir:
            try:
                with zipfile.ZipFile(file_path, 'r') as z:
                    z.extractall(temp_dir)
            except Exception as e:
                print(f"Error extracting {filename}: {e}")
                continue

            db_path = None
            if os.path.exists(os.path.join(temp_dir, 'collection.anki21')):
                db_path = os.path.join(temp_dir, 'collection.anki21')
            elif os.path.exists(os.path.join(temp_dir, 'collection.anki2')):
                db_path = os.path.join(temp_dir, 'collection.anki2')
            
            if not db_path:
                print(f"No database found in {filename}")
                continue

            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            # Load models
            models_dict = {}
            try:
                cursor.execute("SELECT models FROM col")
                models_json = cursor.fetchone()[0]
                models = json.loads(models_json)
                for m_id, m in models.items():
                    # Extract field names
                    field_names = [f['name'] for f in m.get('flds', [])]
                    models_dict[int(m_id)] = field_names
            except Exception as e:
                print(f"Error loading models: {e}")

            # Load notes
            try:
                cursor.execute("SELECT id, mid, flds FROM notes")
                notes = cursor.fetchall()
                for nid, mid, flds_str in notes:
                    flds = flds_str.split('\x1f')
                    
                    # Construct named_fields based on model
                    named_fields = {}
                    field_names = models_dict.get(mid, [])
                    for i, val in enumerate(flds):
                        if i < len(field_names):
                            named_fields[field_names[i]] = val
                        else:
                            named_fields[f"Field_{i}"] = val

                    # Parse using web app logic
                    parsed = parse_card_fields(named_fields, flds, flds[0] if len(flds) > 0 else '', '\n'.join(flds))
                    
                    all_data.append({
                        "Deck / File": filename,
                        "Note ID": nid,
                        "Raw Fields": " | ".join([strip_html(f) for f in flds][:3]), # first 3 fields for context
                        "Extracted Hanzi": parsed.hanzi,
                        "Extracted Pinyin": parsed.pinyin,
                        "Extracted Meaning": parsed.meaning
                    })
            except Exception as e:
                print(f"Error processing notes: {e}")
                
            conn.close()

    if all_data:
        df = pd.DataFrame(all_data)
        df.to_excel(output_excel, index=False)
        print(f"\nSaved {len(all_data)} rows to {output_excel}")
    else:
        print("\nNo data found.")

if __name__ == "__main__":
    directory = r"D:\Tu moi tieng trung\file Anki"
    output_path = r"D:\Tu moi tieng trung\parsed_anki_results.xlsx"
    process_anki_files(directory, output_path)
