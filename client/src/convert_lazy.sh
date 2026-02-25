#!/bin/bash
# App.tsx의 모든 import를 lazy로 변경
sed -i 's/^import \([A-Z][a-zA-Z]*\) from "\(\.\/pages\/[^"]*\)";$/const \1 = lazy(() => import("\2"));/g' App.tsx
sed -i 's/^import \([A-Z][a-zA-Z]*\) from "@\/pages\/\([^"]*\)";$/const \1 = lazy(() => import("@\/pages\/\2"));/g' App.tsx
