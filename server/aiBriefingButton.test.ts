/**
 * AI 비서 하나 브리핑 — 저절로 띄우지 않는다 (2026-10-20, 대표 요청)
 *   헤더 버튼 + 오늘 아직 안 본 항목 수 표시, 눌렀을 때만 열림.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf-8");

describe("AI 비서 하나 브리핑 — 버튼 + 알림 표시", () => {
  it("로그인 때 저절로 뜨던 말풍선은 없고, 헤더(모바일·데스크톱) 알림 종 옆에 버튼", () => {
    const layout = read("client/src/components/dashboard/DashboardLayout.tsx");
    expect(layout).not.toMatch(/FloatingAIBriefing/);
    expect(existsSync(join(__dirname, "..", "client/src/components/ai/FloatingAIBriefing.tsx"))).toBe(false);
    expect(layout).toMatch(/<AIBriefingButton compact \/>/);
    expect(layout).toMatch(/data-testid="header-work-tools">[^]*<AIBriefingButton \/>[^]*<HeaderAttendance \/>[^]*<\/div>\s*<span aria-hidden className="mx-4 h-6 w-px bg-border" \/>\s*<div className="flex items-center gap-1.5" data-testid="header-account">\s*<NotificationDropdown \/>/);
  });
  it("이름이 보인다 — 프로필 사진으로 오해하지 않게 (데스크톱 'AI 비서 하나', 모바일 'AI 하나')", () => {
    const b = read("client/src/components/ai/AIBriefingButton.tsx");
    expect(b).toMatch(/\{compact \? "AI 하나" : "AI 비서 하나"\}/);
  });
  it("눌렀을 때만 열림 (자동 열기 타이머 없음), '확인했습니다' 는 그날 숫자 표시만 숨김", () => {
    const b = read("client/src/components/ai/AIBriefingButton.tsx");
    expect(b).toMatch(/const \[open, setOpen\] = useState\(false\);/);
    expect(b).not.toMatch(/setTimeout|setOpen\(true\)/);
    expect(b).toMatch(/const showBadge = !seen && count > 0;/);
    expect(b).toMatch(/localStorage\.setItem\(SEEN_KEY, kstToday\(\)\)/);
  });
});
