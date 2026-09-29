#!/usr/bin/env python3
import csv
import glob
import html
import json
import os
import re
import sqlite3
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "app/src/main/assets"
CURRENT_JSON = ASSETS / "data/vocab.json"
ANKI_DB = Path(os.environ["ANKI_DB"])
MAIMEMO_ROOT = Path(os.environ["MAIMEMO_ROOT"])

BOOKS = [
    ("必修第一册", "必修一", "pep2019-compulsory-1"),
    ("必修第二册", "必修二", "pep2019-compulsory-2"),
    ("必修第三册", "必修三", "pep2019-compulsory-3"),
    ("选择性必修第一册", "选择性必修一", "pep2019-optional-1"),
    ("选择性必修第二册", "选择性必修二", "pep2019-optional-2"),
    ("选择性必修第三册", "选择性必修三", "pep2019-optional-3"),
    ("选择性必修第四册", "选择性必修四", "pep2019-optional-4"),
]

def clean_text(value):
    value = html.unescape(value or "")
    value = re.sub(r"<br\s*/?>", "\n", value, flags=re.I)
    value = re.sub(r"<[^>]+>", "", value)
    return re.sub(r"[ \t]+", " ", value).strip()

def norm(value):
    return re.sub(r"\s+", " ", value.strip()).casefold()

def parse_anki():
    conn = sqlite3.connect(ANKI_DB)
    rows = conn.execute("SELECT id, tags, flds FROM notes ORDER BY id").fetchall()
    counters = defaultdict(int)
    result = []
    for _, tags, flds in rows:
        fields = flds.split("\x1f")
        english = fields[0].strip()
        textbook = clean_text(fields[4] if len(fields) > 4 else "")
        basic = clean_text(fields[3] if len(fields) > 3 else "")
        phonetic = clean_text(fields[5] if len(fields) > 5 else "")
        tag = tags.strip()
        book_order = next((i for i, (_, marker, _) in enumerate(BOOKS, 1) if marker in tag), 0)
        if not book_order:
            raise ValueError(f"无法识别 Anki 标签: {tag}")
        book, _, book_id = BOOKS[book_order - 1]
        unit_match = re.search(r"WelcomeUnit|Unit\s*(\d+)", tag, re.I)
        raw_unit = unit_match.group(0) if unit_match else ""
        if raw_unit.lower() == "welcomeunit":
            unit_id, unit_order, unit = "welcome", 1, "Welcome Unit · 预备单元"
        elif unit_match:
            number = int(unit_match.group(1))
            unit_id, unit_order, unit = f"u{number}", number, f"Unit {number}"
        else:
            unit_id, unit_order, unit = "unknown", 99, "未分单元"
        counters[(book_id, unit_id)] += 1
        result.append({
            "sequence": len(result) + 1,
            "book_order": book_order,
            "book_id": book_id,
            "book": book,
            "unit_order": unit_order,
            "unit_id": unit_id,
            "unit": unit,
            "word_order": counters[(book_id, unit_id)],
            "english": english,
            "phonetic": phonetic,
            "definition": textbook or basic or "无",
        })
    return result

def parse_maimemo(anki_words, current_words):
    lookup = {}
    for word in current_words:
        lookup.setdefault((word["book_id"], norm(word["english"])), word)
    for word in anki_words:
        lookup[(word["book_id"], norm(word["english"]))] = word

    result = []
    unit_counters = defaultdict(int)
    for book_order, (book, _, book_id) in enumerate(BOOKS, 1):
        stem = f"人教版高中英语{book}"
        word_path = MAIMEMO_ROOT / "exported/word" / f"{stem}.txt"
        csv_path = MAIMEMO_ROOT / "exported/translation" / f"{stem}.csv"
        words = [line.strip() for line in word_path.read_text(encoding="utf-8").splitlines() if line.strip()]
        translations = list(csv.reader(csv_path.open(encoding="utf-8")))
        definitions = defaultdict(list)
        for row in translations:
            if row:
                definitions[norm(row[0])].append(clean_text(row[1] if len(row) > 1 else ""))
        for english in words:
            matched = lookup.get((book_id, norm(english)))
            unit_id = matched["unit_id"] if matched else "unknown"
            unit = matched["unit"] if matched else "未分单元"
            unit_order = matched["unit_order"] if matched else 99
            unit_counters[(book_id, unit_id)] += 1
            defs = definitions.get(norm(english), [])
            definition = defs.pop(0) if defs else (matched.get("definition", "无") if matched else "无")
            result.append({
                "sequence": len(result) + 1,
                "book_order": book_order,
                "book_id": book_id,
                "book": book,
                "unit_order": unit_order,
                "unit_id": unit_id,
                "unit": unit,
                "word_order": unit_counters[(book_id, unit_id)],
                "english": english,
                "phonetic": matched.get("phonetic", "") if matched else "",
                "definition": definition or "无",
            })
    return result

def write_parts(source_id, words, chunk_size=200):
    out_dir = ASSETS / "data"
    paths = []
    for index in range(0, len(words), chunk_size):
        number = index // chunk_size + 1
        path = out_dir / f"{source_id}-{number:02d}.js"
        payload = json.dumps(words[index:index + chunk_size], ensure_ascii=False, separators=(",", ":"))
        path.write_text(f'window.VOCAB_SOURCES["{source_id}"].push(...{payload});\n', encoding="utf-8")
        paths.append(path)
    return paths

def main():
    current_words = json.loads(CURRENT_JSON.read_text(encoding="utf-8"))["words"]
    anki_words = parse_anki()
    maimemo_words = parse_maimemo(anki_words, current_words)
    output = {
        "anki": write_parts("anki", anki_words),
        "maimemo": write_parts("maimemo", maimemo_words),
    }
    manifest = {
        "lilinji": len(current_words),
        "anki": len(anki_words),
        "maimemo": len(maimemo_words),
        "files": {key: [path.name for path in paths] for key, paths in output.items()},
    }
    (ASSETS / "data/sources.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps(manifest, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
