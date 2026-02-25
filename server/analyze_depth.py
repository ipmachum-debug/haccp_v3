#!/usr/bin/env python3
import re
import sys

filepath = sys.argv[1] if len(sys.argv) > 1 else "routers.ts"

with open(filepath, "r") as f:
    content = f.read()

# Remove string literals to avoid counting braces inside them
cleaned = re.sub(r'"[^"]*"', '""', content)
cleaned = re.sub(r"'[^']*'", "''", cleaned)
# Template literals (multi-line) - simplified
cleaned = re.sub(r'`[^`]*`', '``', cleaned, flags=re.DOTALL)

lines = cleaned.split("\n")
orig_lines = content.split("\n")
depth = 0

for i, line in enumerate(lines):
    opens = line.count("{")
    closes = line.count("}")
    prev_depth = depth
    depth += opens - closes
    
    # depth drops to 0 inside appRouter (should only happen at the very end)
    if prev_depth == 1 and depth == 0 and i > 66 and i < len(lines) - 5:
        print(f"Line {i+1}: depth 1->0: {orig_lines[i].rstrip()[:70]}")

print(f"\nFinal depth: {depth}")
opens_total = cleaned.count("{")
closes_total = cleaned.count("}")
print(f"Opens: {opens_total}, Closes: {closes_total}, Diff: {opens_total - closes_total}")
