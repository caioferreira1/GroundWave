#!/usr/bin/env python3
"""
Batch-extract plain text from every .docx file under a folder.

.docx is a zip archive containing word/document.xml with the visible text
wrapped in XML tags. The Read tool used by Claude Code cannot open binary
.docx files directly, so this script converts them to plain .txt first.

Usage:
    python3 extract_docx.py <source_folder> [output_folder]

If output_folder is omitted, files are written to
<source_folder>/extracted_txt/ using the original filename + ".txt".

No third-party dependencies — uses only the Python standard library
(zipfile, re, os, sys), so it runs anywhere Python 3 is available.
"""

import os
import re
import sys
import zipfile


def extract_docx_text(path: str) -> str:
    with zipfile.ZipFile(path) as z:
        xml = z.read("word/document.xml").decode("utf-8")
    xml = xml.replace("</w:p>", "\n")  # paragraph breaks
    text = re.sub(r"<[^>]+>", "", xml)  # strip all remaining tags
    text = re.sub(r"\n{2,}", "\n", text)  # collapse blank lines
    return text


def main() -> None:
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    source = sys.argv[1]
    outdir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(source, "extracted_txt")
    os.makedirs(outdir, exist_ok=True)

    found = False
    for root, _dirs, files in os.walk(source):
        if os.path.abspath(root) == os.path.abspath(outdir):
            continue
        for fname in files:
            if not fname.lower().endswith(".docx") or fname.startswith("~$"):
                continue
            found = True
            fpath = os.path.join(root, fname)
            try:
                text = extract_docx_text(fpath)
                outname = os.path.join(outdir, fname + ".txt")
                with open(outname, "w", encoding="utf-8") as out:
                    out.write(text)
                print(f"OK   {fpath} -> {outname} ({len(text)} chars)")
            except Exception as e:
                print(f"FAIL {fpath}: {e}")

    if not found:
        print(f"No .docx files found under {source}")


if __name__ == "__main__":
    main()
