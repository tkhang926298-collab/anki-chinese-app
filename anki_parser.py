"""
Anki File Parser & Field Analyzer for Web App
==============================================
Parses .apkg files, distinguishes fields (Front/Back/Pinyin/Meaning),
splits into subdecks by tags/hierarchy, and exports JSON for web app.
"""

import zipfile
import sqlite3
import json
import os
import re
import shutil
import sys
from pathlib import Path

# ============================================================
# CONFIG
# ============================================================
ANKI_DIR = r"D:\Tu moi tieng trung\file Anki"
OUTPUT_DIR = r"D:\Tu moi tieng trung\anki-chinese-app\parsed_output"

# ============================================================
# UTILITY: Detect content type via Unicode/Regex
# ============================================================
def has_chinese(text):
    """Check if text contains Chinese characters (CJK Unified Ideographs)"""
    return bool(re.search(r'[\u4e00-\u9fff\u3400-\u4dbf]', text))

def has_pinyin_tones(text):
    """Check if text contains pinyin with tone marks"""
    return bool(re.search(r'[āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ]', text))

def is_mostly_ascii(text):
    """Check if text is mostly ASCII (English/Vietnamese without Chinese)"""
    clean = re.sub(r'<[^>]+>', '', text).strip()
    if not clean:
        return False
    ascii_chars = sum(1 for c in clean if ord(c) < 256)
    return ascii_chars / max(len(clean), 1) > 0.7

def strip_html(text):
    """Remove HTML tags and decode entities"""
    if not text:
        return ""
    text = re.sub(r'<style[^>]*>[\s\S]*?</style>', '', text, flags=re.I)
    text = re.sub(r'<script[^>]*>[\s\S]*?</script>', '', text, flags=re.I)
    text = re.sub(r'\[sound:[^\]]+\]', '', text)
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.I)
    text = re.sub(r'<[^>]+>', '', text)
    text = text.replace('&nbsp;', ' ').replace('&amp;', '&')
    text = text.replace('&lt;', '<').replace('&gt;', '>')
    return text.strip()

def classify_field(field_name, sample_values):
    """Classify field type based on name and sample content"""
    name_lower = field_name.lower().strip()
    
    # By field name
    if any(k in name_lower for k in ['front', 'word', 'hanzi', '汉字', 'character', 'chinese', 'simplified']):
        return 'front'
    if any(k in name_lower for k in ['pinyin', 'pronunciation', 'reading', '拼音']):
        return 'pinyin'
    if any(k in name_lower for k in ['back', 'meaning', 'definition', 'translation', 'english', 'vietnamese', '意思', 'nghĩa']):
        return 'back'
    if any(k in name_lower for k in ['audio', 'sound', 'media']):
        return 'audio'
    if any(k in name_lower for k in ['example', 'sentence', '例句', 'ví dụ']):
        return 'example'
    if any(k in name_lower for k in ['image', 'picture', 'img']):
        return 'image'
    
    # By content analysis
    chinese_count = sum(1 for v in sample_values if has_chinese(strip_html(v)))
    pinyin_count = sum(1 for v in sample_values if has_pinyin_tones(strip_html(v)))
    ascii_count = sum(1 for v in sample_values if is_mostly_ascii(strip_html(v)))
    total = max(len(sample_values), 1)
    
    if chinese_count / total > 0.6:
        return 'front'  # Mostly Chinese = front/question
    if pinyin_count / total > 0.4:
        return 'pinyin'
    if ascii_count / total > 0.6:
        return 'back'  # Mostly ASCII = meaning/answer
    
    return 'other'

# ============================================================
# CORE: Parse a single .apkg file
# ============================================================
def parse_apkg(apkg_path):
    """Parse an .apkg file and return structured data"""
    filename = Path(apkg_path).stem
    temp_dir = os.path.join(OUTPUT_DIR, f"_temp_{filename}")
    
    print(f"\n{'='*60}")
    print(f"📦 Parsing: {Path(apkg_path).name}")
    print(f"{'='*60}")
    
    try:
        # Step 1: Extract .apkg (it's a zip file)
        os.makedirs(temp_dir, exist_ok=True)
        with zipfile.ZipFile(apkg_path, 'r') as zf:
            zf.extractall(temp_dir)
        
        # Step 2: Find the SQLite database
        db_path = None
        for candidate in ['collection.anki2', 'collection.anki21']:
            p = os.path.join(temp_dir, candidate)
            if os.path.exists(p):
                db_path = p
                break
        
        if not db_path:
            print(f"  ❌ No SQLite database found in {apkg_path}")
            return None
        
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Step 3: Extract Models (note types) with field definitions
        col_row = cursor.execute("SELECT models, decks FROM col").fetchone()
        models_json = json.loads(col_row[0])
        decks_json = json.loads(col_row[1])
        
        print(f"\n  📋 Decks found:")
        deck_map = {}
        for did, deck in decks_json.items():
            deck_name = deck.get('name', 'Default')
            deck_map[int(did)] = deck_name
            if deck_name != 'Default' or len(decks_json) == 1:
                print(f"     • {deck_name}")
        
        print(f"\n  📝 Note Types (Models):")
        model_fields = {}
        for mid, model in models_json.items():
            model_name = model.get('name', 'Unknown')
            field_names = [f['name'] for f in model.get('flds', [])]
            model_fields[int(mid)] = {
                'name': model_name,
                'fields': field_names
            }
            print(f"     • {model_name}: {field_names}")
        
        # Step 4: Extract all notes
        notes = cursor.execute("""
            SELECT n.id, n.mid, n.flds, n.tags 
            FROM notes n
        """).fetchall()
        
        print(f"\n  📊 Total notes: {len(notes)}")
        
        # Step 5: Extract cards to get deck assignments
        cards = cursor.execute("""
            SELECT c.nid, c.did 
            FROM cards c
        """).fetchall()
        
        note_to_deck = {}
        for nid, did in cards:
            note_to_deck[nid] = did
        
        # Step 6: Analyze field types with sample data
        print(f"\n  🔍 Field Analysis:")
        model_field_types = {}
        
        for mid, info in model_fields.items():
            field_names = info['fields']
            # Collect samples for each field
            samples = {i: [] for i in range(len(field_names))}
            
            for note in notes:
                if note[1] == mid:
                    fields = note[2].split('\x1f')  # Anki uses \x1f as field separator
                    for i, val in enumerate(fields):
                        if i < len(field_names) and len(samples[i]) < 20:
                            samples[i].append(val)
            
            field_types = {}
            for i, fname in enumerate(field_names):
                ftype = classify_field(fname, samples.get(i, []))
                field_types[i] = ftype
                sample_text = strip_html(samples.get(i, [''])[0])[:60] if samples.get(i) else ''
                print(f"     [{info['name']}] Field '{fname}' → {ftype.upper()} (sample: \"{sample_text}\")")
            
            model_field_types[mid] = field_types
        
        # Step 7: Build structured card data grouped by deck and tags
        result = {
            'source_file': Path(apkg_path).name,
            'decks': {}
        }
        
        tag_groups = {}  # For tag-based splitting
        
        for note in notes:
            nid, mid, flds_raw, tags_raw = note
            fields_data = flds_raw.split('\x1f')
            tags = [t.strip() for t in tags_raw.strip().split() if t.strip()]
            
            info = model_fields.get(mid, {'name': 'Unknown', 'fields': []})
            field_types = model_field_types.get(mid, {})
            
            # Build card object
            card_obj = {
                'front': '',
                'pinyin': '',
                'back': '',
                'audio': '',
                'example': '',
                'raw_fields': {}
            }
            
            for i, val in enumerate(fields_data):
                fname = info['fields'][i] if i < len(info['fields']) else f'field_{i}'
                ftype = field_types.get(i, 'other')
                clean_val = strip_html(val)
                
                card_obj['raw_fields'][fname] = clean_val
                
                if ftype == 'front' and not card_obj['front']:
                    card_obj['front'] = clean_val
                elif ftype == 'pinyin' and not card_obj['pinyin']:
                    card_obj['pinyin'] = clean_val
                elif ftype == 'back' and not card_obj['back']:
                    card_obj['back'] = clean_val
                elif ftype == 'audio':
                    card_obj['audio'] = val  # Keep raw for sound tags
                elif ftype == 'example':
                    card_obj['example'] = clean_val
            
            # Fallback: If no front detected, use first field with Chinese
            if not card_obj['front']:
                for i, val in enumerate(fields_data):
                    clean = strip_html(val)
                    if has_chinese(clean):
                        card_obj['front'] = clean
                        break
            
            # Fallback: If no back detected, use first non-Chinese field
            if not card_obj['back']:
                for i, val in enumerate(fields_data):
                    clean = strip_html(val)
                    if clean and not has_chinese(clean) and clean != card_obj['front'] and clean != card_obj['pinyin']:
                        card_obj['back'] = clean
                        break
            
            # Skip empty cards
            if not card_obj['front'] and not card_obj['back']:
                continue
            
            # Determine deck name
            did = note_to_deck.get(nid, 1)
            deck_name = deck_map.get(did, 'Default')
            
            # Add to deck
            if deck_name not in result['decks']:
                result['decks'][deck_name] = []
            result['decks'][deck_name].append(card_obj)
            
            # Also group by tags
            if tags:
                for tag in tags:
                    if tag not in tag_groups:
                        tag_groups[tag] = []
                    tag_groups[tag].append(card_obj)
        
        # Step 8: If only 1 deck but multiple tags → split by tags
        deck_names = list(result['decks'].keys())
        if len(deck_names) <= 1 and len(tag_groups) > 1:
            print(f"\n  🏷️  Single deck detected, splitting by Tags:")
            result['decks'] = {}
            for tag, cards_list in tag_groups.items():
                result['decks'][f"{filename} 〉 {tag}"] = cards_list
                print(f"     • {tag}: {len(cards_list)} cards")
        # Also split subdecks with :: notation
        else:
            new_decks = {}
            for dname, cards_list in result['decks'].items():
                if '::' in dname:
                    parts = dname.split('::')
                    new_decks[' 〉 '.join(parts)] = cards_list
                else:
                    new_decks[dname] = cards_list
            result['decks'] = new_decks
        
        # Print summary
        total_cards = sum(len(c) for c in result['decks'].values())
        print(f"\n  ✅ Parsed {total_cards} cards across {len(result['decks'])} decks")
        for dname, cards_list in result['decks'].items():
            sample = cards_list[0] if cards_list else {}
            print(f"     • {dname} ({len(cards_list)} cards)")
            if sample:
                print(f"       Front: \"{sample.get('front','')[:40]}\"")
                print(f"       Pinyin: \"{sample.get('pinyin','')[:40]}\"")
                print(f"       Back: \"{sample.get('back','')[:40]}\"")
        
        conn.close()
        return result
        
    except Exception as e:
        print(f"  ❌ Error parsing {apkg_path}: {e}")
        import traceback
        traceback.print_exc()
        return None
    finally:
        # Cleanup temp
        if os.path.exists(temp_dir):
            shutil.rmtree(temp_dir, ignore_errors=True)


# ============================================================
# EXPORT: Generate Web App JSON
# ============================================================
def export_web_json(all_results, output_dir):
    """Export parsed data to JSON for web app"""
    os.makedirs(output_dir, exist_ok=True)
    
    # 1. Combined master JSON
    master = []
    for result in all_results:
        if not result:
            continue
        for deck_name, cards in result['decks'].items():
            master.append({
                'source': result['source_file'],
                'deck': deck_name,
                'card_count': len(cards),
                'cards': [{
                    'front': c['front'],
                    'pinyin': c['pinyin'],
                    'back': c['back'],
                    'example': c.get('example', ''),
                } for c in cards]
            })
    
    master_path = os.path.join(output_dir, 'all_decks.json')
    with open(master_path, 'w', encoding='utf-8') as f:
        json.dump(master, f, ensure_ascii=False, indent=2)
    print(f"\n📁 Master JSON saved: {master_path} ({len(master)} decks)")
    
    # 2. Individual deck JSONs
    for deck_data in master:
        safe_name = re.sub(r'[<>:"/\\|?*]', '_', deck_data['deck'])[:80]
        deck_path = os.path.join(output_dir, f"{safe_name}.json")
        with open(deck_path, 'w', encoding='utf-8') as f:
            json.dump(deck_data, f, ensure_ascii=False, indent=2)
    
    # 3. Summary report
    report_path = os.path.join(output_dir, 'REPORT.txt')
    with open(report_path, 'w', encoding='utf-8') as f:
        f.write("ANKI PARSER REPORT\n")
        f.write("=" * 60 + "\n\n")
        total_cards = 0
        for deck_data in master:
            f.write(f"📦 {deck_data['source']}\n")
            f.write(f"   Deck: {deck_data['deck']}\n")
            f.write(f"   Cards: {deck_data['card_count']}\n")
            if deck_data['cards']:
                sample = deck_data['cards'][0]
                f.write(f"   Sample: Front=\"{sample['front'][:40]}\" | Back=\"{sample['back'][:40]}\"\n")
            f.write("\n")
            total_cards += deck_data['card_count']
        f.write(f"\nTOTAL: {total_cards} cards in {len(master)} decks\n")
    
    print(f"📊 Report saved: {report_path}")
    print(f"\n{'='*60}")
    print(f"🎉 DONE! Total: {sum(d['card_count'] for d in master)} cards across {len(master)} decks")
    print(f"{'='*60}")


# ============================================================
# MAIN
# ============================================================
if __name__ == '__main__':
    print("🚀 Starting Anki Parser...")
    print(f"📂 Scanning: {ANKI_DIR}")
    
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    apkg_files = list(Path(ANKI_DIR).glob('*.apkg'))
    print(f"📦 Found {len(apkg_files)} .apkg files\n")
    
    all_results = []
    for apkg in apkg_files:
        result = parse_apkg(str(apkg))
        if result:
            all_results.append(result)
    
    if all_results:
        export_web_json(all_results, OUTPUT_DIR)
    else:
        print("❌ No files were parsed successfully.")
