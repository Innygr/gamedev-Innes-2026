#!/usr/bin/env python3
"""
HTML Syntax Fixer
-----------------
Scans HTML files and uses HTML Tidy to detect and repair markup errors.

Safe by default:
  python syntax_fixer.py              # check only
  python syntax_fixer.py --fix        # repair files, keeping .bak backups
  python syntax_fixer.py --fix --path ./pages
  python syntax_fixer.py --check-only # explicit check mode

Requirements:
  HTML Tidy (command: tidy) must be installed and available on PATH.

This tool does not rewrite CSS, JavaScript, URLs, or non-HTML files.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

HTML_EXTENSIONS = {".html", ".htm"}
SKIP_DIRS = {".git", ".github", "node_modules", "venv", ".venv", "__pycache__"}


def find_html_files(root: Path) -> list[Path]:
    """Find HTML files recursively, excluding generated/dependency folders."""
    files = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix.lower() not in HTML_EXTENSIONS:
            continue
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        files.append(path)
    return sorted(files)


def run_tidy(path: Path, *, fix: bool) -> tuple[int, str]:
    """Run HTML Tidy. Return its exit code and combined diagnostic output."""
    command = [
        "tidy",
        "-quiet",
        "-utf8",
        "-wrap", "0",
        "-show-warnings", "yes",
        "-show-errors", "20",
        "-force-output", "yes",
    ]

    if fix:
        command += ["-modify"]

    command.append(str(path))

    result = subprocess.run(
        command,
        text=True,
        encoding="utf-8",
        errors="replace",
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )
    return result.returncode, result.stdout.strip()


def check_file(path: Path, *, fix: bool) -> bool:
    """Check one file; repair it only when requested."""
    print(f"\n[{ 'FIX' if fix else 'CHECK' }] {path}")

    if fix:
        backup = path.with_suffix(path.suffix + ".bak")
        if backup.exists():
            print(f"  SKIPPED: backup already exists: {backup.name}")
            return False

        shutil.copy2(path, backup)

    code, output = run_tidy(path, fix=fix)

    if output:
        for line in output.splitlines():
            print(f"  {line}")

    # Tidy uses nonzero exit codes for warnings/errors, even when it can
    # produce repaired output. The backup makes --fix reversible.
    if fix and path.exists():
        print("  Repair pass completed. Original saved as " +
              path.with_suffix(path.suffix + ".bak").name)
        return True

    if code == 0:
        print("  No syntax issues reported.")
        return True

    print("  Issues found; run with --fix to attempt safe HTML Tidy repairs.")
    return False


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check and optionally repair HTML syntax using HTML Tidy."
    )
    parser.add_argument(
        "--path",
        type=Path,
        default=Path("."),
        help="Folder or HTML file to scan (default: current directory).",
    )
    parser.add_argument(
        "--fix",
        action="store_true",
        help="Repair files and create .bak backups first.",
    )
    parser.add_argument(
        "--check-only",
        action="store_true",
        help="Explicitly run without modifying files (default behavior).",
    )
    args = parser.parse_args()

    if shutil.which("tidy") is None:
        print("ERROR: HTML Tidy was not found.")
        print("Install it, then make sure the 'tidy' command is on PATH.")
        print("Ubuntu/Debian: sudo apt install tidy")
        print("Windows: install HTML Tidy and add its folder to PATH.")
        return 2

    target = args.path.resolve()
    if not target.exists():
        print(f"ERROR: Path does not exist: {target}")
        return 2

    if target.is_file():
        if target.suffix.lower() not in HTML_EXTENSIONS:
            print("ERROR: The selected file is not .html or .htm.")
            return 2
        files = [target]
    else:
        files = find_html_files(target)

    if not files:
        print(f"No HTML files found in {target}")
        return 0

    fixing = args.fix and not args.check_only
    print(f"Found {len(files)} HTML file(s).")
    print("Mode: " + ("REPAIR (backups enabled)" if fixing else "CHECK ONLY"))

    passed = 0
    for file in files:
        if check_file(file, fix=fixing):
            passed += 1

    print("\n" + "=" * 48)
    print(f"Processed: {len(files)} | Completed: {passed} | Review: {len(files) - passed}")
    if not fixing:
        print("No files were modified. Use --fix to attempt repairs.")
    return 0 if passed == len(files) else 1


if __name__ == "__main__":
    raise SystemExit(main())
