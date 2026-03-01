import os
import pandas as pd
import json
import re

def parse_example(example_text):
    if not isinstance(example_text, str) or not example_text.strip():
        return None
    
    # Try to split into 3 lines: Hanzi, Pinyin, Vietnamese
    lines = [L.strip() for L in example_text.split('\n') if L.strip()]
    
    if len(lines) >= 3:
        return {
            "sentence_hanzi": lines[0],
            "sentence_pinyin": lines[1],
            "sentence_meaning": " ".join(lines[2:])
        }
    
    # Fallback pattern matching
    parts = re.split(r'\n', example_text.strip(), maxsplit=2)
    if len(parts) == 3:
         return {
            "sentence_hanzi": parts[0].strip(),
            "sentence_pinyin": parts[1].strip(),
            "sentence_meaning": parts[2].strip()
        }
        
    return {
        "sentence_hanzi": lines[0] if len(lines) > 0 else example_text,
        "sentence_pinyin": "",
        "sentence_meaning": " ".join(lines[1:]) if len(lines) > 1 else ""
    }

def main():
    input_dir = r"D:\Tu moi tieng trung\HSK exel"
    output_json = r"D:\Tu moi tieng trung\anki-chinese-app\public\hsk_database.json"
    
    if not os.path.exists(input_dir):
        print(f"Error: Directory {input_dir} not found.")
        return

    all_vocabulary = []

    for filename in os.listdir(input_dir):
        if not filename.endswith(".csv"):
            continue
            
        filepath = os.path.join(input_dir, filename)
        print(f"Reading {filename}...")
        
        # Determine HSK level from filename
        level_match = re.search(r'HSK\s*(\d+)', filename, re.IGNORECASE)
        level = f"HSK {level_match.group(1)}" if level_match else "Unknown"
        
        if "4+" in filename or "4 +" in filename: level = "HSK 4+"
        if "6 +" in filename or "6+" in filename: level = "HSK 6+"
        
        try:
            # Read CSV. It seems there are headers at row 1.
            df = pd.read_csv(filepath)
            
            # The columns based on my view are:
            # 0: 🌷 (ID)
            # 1: ‧₊˚♪ GIẢN THỂ ♪
            # 2: 🎧
            # 3: 𐙚 ̊PINYIN ⋆.𐙚 ̊
            # 4: ⋆｡ﾟ VIETNAMESE ⋆｡ﾟ⋆｡
            # 5: VD
            
            for index, row in df.iterrows():
                try:
                    hanzi = str(row.iloc[1]).strip()
                    pinyin = str(row.iloc[3]).strip()
                    meaning = str(row.iloc[4]).strip()
                    example_raw = str(row.iloc[5]) if len(row) > 5 else ""
                    
                    if hanzi == 'nan' or not hanzi: continue
                    if meaning == 'nan': meaning = ""
                    if pinyin == 'nan': pinyin = ""
                    if example_raw == 'nan': example_raw = ""
                    
                    if hanzi == '‧₊˚♪ GIẢN THỂ ♪' or hanzi == 'Hanzi': continue
                    
                    vocab_card = {
                        "hanzi": hanzi,
                        "pinyin": pinyin,
                        "meaning": meaning,
                        "deck": level,
                    }
                    
                    example_obj = parse_example(example_raw)
                    if example_obj and example_obj['sentence_hanzi']:
                        vocab_card["example"] = example_obj
                        
                    all_vocabulary.append(vocab_card)
                    
                except Exception as e:
                    print(f"Error processing row {index} in {filename}: {e}")
                    
        except Exception as e:
            print(f"Error reading file {filename}: {e}")

    # Remove duplicates based on Hanzi, keeping highest level or just first encountered
    unique_vocab = {}
    for card in all_vocabulary:
        if card['hanzi'] not in unique_vocab:
            unique_vocab[card['hanzi']] = card
            
    final_list = list(unique_vocab.values())
    
    # Save to JSON
    with open(output_json, 'w', encoding='utf-8') as f:
        json.dump(final_list, f, ensure_ascii=False, indent=2)
        
    print(f"\nProcessing complete!")
    print(f"Total raw items: {len(all_vocabulary)}")
    print(f"Total unique items: {len(final_list)}")
    print(f"Saved to: {output_json}")

if __name__ == "__main__":
    main()
