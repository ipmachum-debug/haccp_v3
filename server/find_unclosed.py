#!/usr/bin/env python3
import re

with open("routers.ts", "r") as f:
    content = f.read()

# Remove string literals
cleaned = re.sub(r'"[^"]*"', '""', content)
cleaned = re.sub(r"'[^']*'", "''", cleaned)
cleaned = re.sub(r'`[^`]*`', '``', cleaned, flags=re.DOTALL)

lines = cleaned.split("\n")
orig_lines = content.split("\n")

# Find where depth=1 occurs (top-level router items in appRouter)
depth = 0
depth1_ranges = []
last_depth1 = -1

for i, line in enumerate(lines):
    opens = line.count("{")
    closes = line.count("}")
    prev_depth = depth
    depth += opens - closes
    
    if depth == 1 and prev_depth > 1:
        # Just returned to depth 1 - a router item closed
        depth1_ranges.append((last_depth1, i+1, orig_lines[i].rstrip()[:60]))
    
    if depth == 1 and prev_depth <= 1:
        last_depth1 = i + 1

# Now check: after the last depth=1 point, does depth go back to 0?
print("Router item boundaries (depth returns to 1):")
for start, end, text in depth1_ranges[-10:]:
    print(f"  Lines {start}-{end}: {text}")

# Now trace depth more carefully in the last section
print("\n--- Detailed depth trace from line 8230 ---")
depth = 0
for i, line in enumerate(lines):
    opens = line.count("{")
    closes = line.count("}")
    depth += opens - closes
    if i >= 8229:  # line 8230+
        print(f"Line {i+1}: depth={depth}: {orig_lines[i].rstrip()[:60]}")

# The real question: where is the extra { ?
# Let's check each 100-line block
print("\n--- Depth delta per 100-line block ---")
depth = 0
block_start_depth = 0
for i, line in enumerate(lines):
    if i % 100 == 0:
        block_start_depth = depth
    opens = line.count("{")
    closes = line.count("}")
    depth += opens - closes
    if (i+1) % 100 == 0:
        delta = depth - block_start_depth
        if delta != 0:
            print(f"Lines {i-98}-{i+1}: delta={delta:+d}, depth={depth}")
