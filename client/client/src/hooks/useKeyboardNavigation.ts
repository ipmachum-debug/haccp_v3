import { useEffect, useRef, useCallback } from "react";

export interface KeyboardNavigationOptions {
  onEnter?: () => void;
  onTab?: () => void;
  onShiftTab?: () => void;
  onEscape?: () => void;
  onF2?: () => void;
  onArrowUp?: () => void;
  onArrowDown?: () => void;
  onArrowLeft?: () => void;
  onArrowRight?: () => void;
  enabled?: boolean;
}

/**
 * 엑셀/이카운트 스타일 키보드 네비게이션 훅
 * - Tab: 다음 필드로 이동
 * - Shift+Tab: 이전 필드로 이동
 * - Enter: 다음 행으로 이동 또는 저장
 * - F2: 검색 모달 열기
 * - Esc: 취소 또는 닫기
 * - 방향키: 셀 이동
 */
export function useKeyboardNavigation(options: KeyboardNavigationOptions) {
  const {
    onEnter,
    onTab,
    onShiftTab,
    onEscape,
    onF2,
    onArrowUp,
    onArrowDown,
    onArrowLeft,
    onArrowRight,
    enabled = true,
  } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // 입력 필드에서만 작동하도록 제한 (선택적)
      const target = event.target as HTMLElement;
      const isInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      switch (event.key) {
        case "Enter":
          if (onEnter && !event.shiftKey && !event.ctrlKey) {
            event.preventDefault();
            onEnter();
          }
          break;

        case "Tab":
          if (event.shiftKey && onShiftTab) {
            event.preventDefault();
            onShiftTab();
          } else if (!event.shiftKey && onTab) {
            event.preventDefault();
            onTab();
          }
          break;

        case "Escape":
          if (onEscape) {
            event.preventDefault();
            onEscape();
          }
          break;

        case "F2":
          if (onF2) {
            event.preventDefault();
            onF2();
          }
          break;

        case "ArrowUp":
          if (onArrowUp && !isInput) {
            event.preventDefault();
            onArrowUp();
          }
          break;

        case "ArrowDown":
          if (onArrowDown && !isInput) {
            event.preventDefault();
            onArrowDown();
          }
          break;

        case "ArrowLeft":
          if (onArrowLeft && !isInput) {
            event.preventDefault();
            onArrowLeft();
          }
          break;

        case "ArrowRight":
          if (onArrowRight && !isInput) {
            event.preventDefault();
            onArrowRight();
          }
          break;
      }
    },
    [
      enabled,
      onEnter,
      onTab,
      onShiftTab,
      onEscape,
      onF2,
      onArrowUp,
      onArrowDown,
      onArrowLeft,
      onArrowRight,
    ]
  );

  useEffect(() => {
    if (enabled) {
      window.addEventListener("keydown", handleKeyDown);
      return () => {
        window.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [enabled, handleKeyDown]);
}

/**
 * 특정 요소에 포커스를 이동하는 헬퍼 함수
 */
export function focusElement(selector: string) {
  const element = document.querySelector(selector) as HTMLElement;
  if (element) {
    element.focus();
  }
}

/**
 * 다음/이전 입력 필드로 포커스 이동
 */
export function focusNextInput(currentElement: HTMLElement, direction: "next" | "prev" = "next") {
  const inputs = Array.from(
    document.querySelectorAll<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [contenteditable="true"]'
    )
  );

  const currentIndex = inputs.indexOf(currentElement);
  if (currentIndex === -1) return;

  const nextIndex = direction === "next" ? currentIndex + 1 : currentIndex - 1;
  const nextInput = inputs[nextIndex];

  if (nextInput) {
    nextInput.focus();
  }
}
