export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';
/**
 * 무료 체험 기간 (일) — 가입 처리(서버)와 첫 화면·가입·FAQ 안내가 모두 이 값 하나를 쓴다 (2026-10-20 신규 회사 시험:
 * 첫 화면 30일 · 가입 14일로 서로 달랐음). 실제 부여 기간은 서버 가입 처리 기준 14일.
 */
export const TRIAL_DAYS = 14;
