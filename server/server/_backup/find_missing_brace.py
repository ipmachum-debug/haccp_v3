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

# Track depth every 500 lines
depth = 0
for i, line in enumerate(lines):
    opens = line.count("{")
    closes = line.count("}")
    depth += opens - closes
    
    if (i+1) % 500 == 0:
        print(f"Line {i+1}: depth={depth}")

print(f"Line {len(lines)}: depth={depth}")
print(f"---")

# Now find where depth increases unexpectedly
# The extra { is somewhere - find where depth is 1 more than expected
# Look at appRouter level (depth=1 means top level of appRouter)
# Each router item should go depth 1 -> higher -> back to 1
# If at some point it goes to 2 and never comes back, that's the issue

depth = 0
last_depth1_line = 67
for i, line in enumerate(lines):
    opens = line.count("{")
    closes = line.count("}")
    prev_depth = depth
    depth += opens - closes
    
    # Track where depth is exactly 1 (top level of appRouter)
    if depth == 1 and prev_depth != 1 and i > 66:
        last_depth1_line = i + 1

# The last time depth was 1 before the end
print(f"Last depth=1 at line: {last_depth1_line}")

# Check around that area - the missing } should be after this point
# Show lines around where depth stays at 2 instead of dropping to 1
depth = 0
for i, line in enumerate(lines):
    opens = line.count("{")
    closes = line.count("}")
    prev_depth = depth
    depth += opens - closes
    
    # Show where depth should be 1 but is 2
    if i > last_depth1_line and depth == 2 and (opens > 0 or closes > 0):
        print(f"Line {i+1}: depth={depth}: {orig_lines[i].rstrip()[:70]}")
        if i + 1 < len(orig_lines):
            print(f"  next: {orig_lines[i+1].rstrip()[:70]}")
