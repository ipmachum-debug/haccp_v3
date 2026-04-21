/**
 * Millio AI 레이어 의존성 규칙 (CI 강제)
 *
 * 전체 규칙: docs/architecture/01-dependency-rules.md
 * 레이어 정의: docs/architecture/00-layers.md
 *
 * 현재 단계 (2026-04-21):
 *   - 신규 레이어 구조 (server/platform, server/core-erp, ...) 는 아직 비어있음
 *   - 기존 server/routers, server/db 구조는 일단 유지
 *   - 본 설정은 **신규 폴더가 생길 때부터** 규칙을 강제
 *   - 기존 코드의 명백한 위반(예: core 가 industry import)은 전환 시 해결
 *
 * 실행:
 *   npx depcruise --config .dependency-cruiser.cjs server
 */

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 레이어 의존 규칙
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    {
      name: "platform-cannot-use-core-erp",
      comment: "platform 은 업무 개념을 몰라야 함 (00-layers.md)",
      severity: "error",
      from: { path: "^server/platform/" },
      to: { path: "^server/(core-erp|core-mes|industry|addon)/" },
    },
    {
      name: "platform-cannot-use-shared-kernel",
      comment: "platform 은 shared-kernel 조차 import 안 함 (순수 인프라)",
      severity: "error",
      from: { path: "^server/platform/" },
      to: { path: "^server/shared-kernel/" },
    },
    {
      name: "shared-kernel-is-pure",
      comment: "shared-kernel 은 어떤 레이어도 import 하면 안 됨 (타입/상수만 포함)",
      severity: "error",
      from: { path: "^server/shared-kernel/" },
      to: { path: "^server/(platform|core-erp|core-mes|industry|addon)/" },
    },
    {
      name: "core-cannot-use-industry",
      comment: "core (erp/mes) 는 industry 를 참조하면 안 됨 (ADR-002)",
      severity: "error",
      from: { path: "^server/(core-erp|core-mes)/" },
      to: { path: "^server/industry/" },
    },
    {
      name: "core-cannot-use-addon",
      comment: "core 는 addon 없이도 동작해야 함",
      severity: "error",
      from: { path: "^server/(core-erp|core-mes)/" },
      to: { path: "^server/addon/" },
    },
    {
      name: "core-erp-cannot-use-mes",
      comment: "core-erp 가 core-mes 를 참조 금지 (필요 시 shared-kernel 로 승격)",
      severity: "error",
      from: { path: "^server/core-erp/" },
      to: { path: "^server/core-mes/" },
    },
    {
      name: "industry-cannot-use-other-industry",
      comment: "업종끼리는 독립. 공통 패턴은 core 또는 shared-kernel 로 승격",
      severity: "error",
      from: { path: "^server/industry/([^/]+)/" },
      to: {
        path: "^server/industry/([^/]+)/",
        pathNot: "^server/industry/$1/",
      },
    },
    {
      name: "industry-cannot-use-addon",
      comment: "industry 는 addon 없이 동작해야 함",
      severity: "error",
      from: { path: "^server/industry/" },
      to: { path: "^server/addon/" },
    },
    {
      name: "addon-cannot-use-other-addon",
      comment: "addon 끼리는 독립",
      severity: "error",
      from: { path: "^server/addon/([^/]+)/" },
      to: {
        path: "^server/addon/([^/]+)/",
        pathNot: "^server/addon/$1/",
      },
    },

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 일반적 코드 품질 규칙
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

    {
      name: "no-circular",
      comment: "순환 참조 금지",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "어디서도 import 안 되는 고립된 파일",
      severity: "info",
      from: {
        orphan: true,
        pathNot: [
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts|json)$",
          "\\.d\\.ts$",
          "(^|/)tsconfig\\.json$",
          "(^|/)(babel|webpack|vite|drizzle)\\.config\\.(js|cjs|mjs|ts|json)$",
          "^server/index\\.ts$",
          "^server/scheduler\\.ts$",
          "^server/routers-ai\\.ts$",
          "^scripts/",
          "^drizzle/",
        ],
      },
      to: {},
    },
    {
      name: "no-deprecated-core",
      comment: "node.js deprecated API 금지",
      severity: "warn",
      from: {},
      to: { dependencyTypes: ["deprecated"] },
    },
  ],

  options: {
    doNotFollow: {
      path: ["node_modules", "dist", "build"],
    },
    includeOnly: "^server/",
    tsConfig: {
      fileName: "tsconfig.json",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "require", "node", "default"],
      mainFields: ["main", "types"],
    },
    reporterOptions: {
      dot: {
        collapsePattern: "^server/[^/]+/[^/]+/",
        theme: {
          graph: { rankdir: "TB", splines: "ortho" },
        },
      },
      archi: {
        collapsePattern:
          "^(node_modules|packages|src|lib|server|app|test|spec)/[^/]+|^server/(platform|shared-kernel|core-erp|core-mes|industry|addon)/[^/]+",
      },
    },
  },
};
