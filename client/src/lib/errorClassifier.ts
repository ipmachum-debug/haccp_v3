/**
 * Y-시리즈 페이지 공통 에러 메시지 변환
 *
 * 사용자 친화적 라벨 + 운영자 안내 분리.
 * Raw SQL 또는 기술적 메시지는 collapse 로 숨김.
 */

import type { ReactNode } from "react";

export interface FriendlyError {
  /** 한 줄 사용자 메시지 */
  title: string;
  /** 운영자 / 관리자 안내 (선택) */
  hint?: string;
  /** 기술 상세 (collapse / debug 용) — raw 메시지 */
  detail: string;
}

/**
 * tRPC error message → 사용자 친화적 변환.
 *
 * 패턴:
 *   - "Failed query: select ..." → DB 테이블 / 컬럼 미존재 가능성 안내
 *   - "ECONNREFUSED" / "ETIMEDOUT" → 연결 안내
 *   - "FORBIDDEN" / "UNAUTHORIZED" → 권한 안내
 *   - 그 외 → "데이터를 불러올 수 없습니다" + 원본 첨부
 */
export function classifyError(rawMessage: string | null | undefined): FriendlyError {
  const msg = String(rawMessage ?? "").trim();

  if (!msg) {
    return {
      title: "데이터를 불러올 수 없습니다",
      hint: "잠시 후 다시 시도해 주세요.",
      detail: "(빈 응답)",
    };
  }

  // DB 쿼리 실패 — 테이블 / 컬럼 미존재 가능성
  if (msg.includes("Failed query") || msg.toLowerCase().includes("doesn't exist")
      || msg.toLowerCase().includes("unknown column")) {
    return {
      title: "데이터베이스가 준비되지 않았습니다",
      hint: "이 모듈은 신규 기능입니다. 시스템 관리자에게 마이그레이션 실행을 요청하세요.",
      detail: msg,
    };
  }

  // 연결 오류
  if (msg.includes("ECONNREFUSED") || msg.includes("ETIMEDOUT")
      || msg.toLowerCase().includes("connection")) {
    return {
      title: "서버 연결이 일시적으로 불안정합니다",
      hint: "잠시 후 다시 시도해 주세요. 계속될 경우 시스템 관리자에게 문의하세요.",
      detail: msg,
    };
  }

  // 권한
  if (msg.toUpperCase().includes("FORBIDDEN") || msg.toUpperCase().includes("UNAUTHORIZED")) {
    return {
      title: "접근 권한이 없습니다",
      hint: "관리자에게 권한 부여를 요청하세요.",
      detail: msg,
    };
  }

  // 기타
  return {
    title: "데이터를 불러올 수 없습니다",
    hint: "문제가 계속되면 시스템 관리자에게 문의하세요.",
    detail: msg,
  };
}
