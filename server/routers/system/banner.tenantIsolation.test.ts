/**
 * 배너 라우터 — 테넌트 격리 회귀 테스트
 *
 * 검증:
 *  1. resolveBannerTenantId: 일반 admin 은 input.tenantId 를 무시하고 ctx.tenantId 로 강제,
 *     super_admin 만 input.tenantId 를 신뢰한다.
 *  2. assertBannerOwnership: 일반 admin 이 다른 테넌트 배너에 접근하면 throw,
 *     super_admin 은 통과.
 *
 * 이 함수들은 router handler 내부에서 input.tenantId 조작 공격 및
 * 교차 테넌트 수정/삭제/토글 을 막는 핵심 보안 게이트입니다.
 */
import { describe, it, expect } from "vitest";
import {
  resolveBannerTenantId,
  assertBannerOwnership,
} from "./banner.router";

describe("banner — resolveBannerTenantId", () => {
  const TENANT_A = 1;
  const TENANT_B = 2;

  it("일반 admin 의 input.tenantId 는 무시되고 ctx.tenantId 로 강제된다", () => {
    expect(resolveBannerTenantId("admin", TENANT_A, TENANT_B)).toBe(TENANT_A);
  });

  it("일반 admin 이 tenantId=null (전역 배너) 요청해도 자기 테넌트로 강제", () => {
    expect(resolveBannerTenantId("admin", TENANT_A, null)).toBe(TENANT_A);
  });

  it("일반 admin 이 input.tenantId 를 생략하면 ctx.tenantId 사용", () => {
    expect(resolveBannerTenantId("admin", TENANT_A, undefined)).toBe(TENANT_A);
  });

  it("super_admin 은 input.tenantId 를 그대로 사용 (타 테넌트 지정 가능)", () => {
    expect(resolveBannerTenantId("super_admin", TENANT_A, TENANT_B)).toBe(TENANT_B);
  });

  it("super_admin 은 전역 배너(null) 생성 가능", () => {
    expect(resolveBannerTenantId("super_admin", TENANT_A, null)).toBe(null);
  });

  it("super_admin 이 input.tenantId 생략 시 null (전역)", () => {
    expect(resolveBannerTenantId("super_admin", TENANT_A, undefined)).toBe(null);
  });

  it("worker 역할도 일반 admin 과 동일하게 ctx.tenantId 로 강제 (안전한 기본값)", () => {
    // 이론상 banner router 는 adminProcedure 이지만 방어적 기본값 확인
    expect(resolveBannerTenantId("worker", TENANT_A, TENANT_B)).toBe(TENANT_A);
  });
});

describe("banner — assertBannerOwnership", () => {
  const TENANT_A = 1;
  const TENANT_B = 2;

  it("같은 테넌트 배너는 일반 admin 도 수정/삭제 가능", () => {
    expect(() =>
      assertBannerOwnership("admin", TENANT_A, TENANT_A, "수정"),
    ).not.toThrow();
  });

  it("다른 테넌트 배너를 일반 admin 이 수정하려 하면 throw", () => {
    expect(() =>
      assertBannerOwnership("admin", TENANT_A, TENANT_B, "수정"),
    ).toThrow("다른 테넌트의 배너는 수정할 수 없습니다.");
  });

  it("다른 테넌트 배너를 일반 admin 이 삭제하려 하면 throw", () => {
    expect(() =>
      assertBannerOwnership("admin", TENANT_A, TENANT_B, "삭제"),
    ).toThrow("다른 테넌트의 배너는 삭제할 수 없습니다.");
  });

  it("다른 테넌트 배너를 일반 admin 이 토글하려 하면 throw", () => {
    expect(() =>
      assertBannerOwnership("admin", TENANT_A, TENANT_B, "제어"),
    ).toThrow("다른 테넌트의 배너는 제어할 수 없습니다.");
  });

  it("전역 배너(null) 는 일반 admin 이 건드릴 수 없음", () => {
    expect(() =>
      assertBannerOwnership("admin", TENANT_A, null, "수정"),
    ).toThrow();
  });

  it("super_admin 은 다른 테넌트 배너도 자유롭게 수정 가능", () => {
    expect(() =>
      assertBannerOwnership("super_admin", TENANT_A, TENANT_B, "수정"),
    ).not.toThrow();
  });

  it("super_admin 은 전역 배너(null) 도 자유롭게 제어 가능", () => {
    expect(() =>
      assertBannerOwnership("super_admin", TENANT_A, null, "제어"),
    ).not.toThrow();
  });
});
