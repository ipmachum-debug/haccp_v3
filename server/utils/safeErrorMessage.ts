/**
 * 화면에 보낼 오류 문장 — DB 오류 원문(SQL·파라미터)은 내보내지 않는다 (지티컴퍼니 QA R01, 2026-10-18)
 *
 * Drizzle/mysql2 오류는 "Failed query: insert into ... params: ..." 처럼 SQL·입력값을 메시지에 담는다.
 * tRPC errorFormatter 가 이 함수로 바꿔 보낸다 — 원문은 서버 로그에만.
 * 업무 오류(한글 안내 문장)는 그대로 둔다.
 */

const SQL_LIKE = /Failed query:|\bparams:|\binsert into\b|\bupdate\s+`?\w+`?\s+set\b|\bselect\b[\s\S]+\bfrom\b|\bdelete from\b|sqlMessage|\bER_[A-Z_]{3,}\b|Duplicate entry|You have an error in your SQL syntax/i;

const MESSAGE_BY_CODE: Record<string, string> = {
  ER_DUP_ENTRY: "이미 등록된 값과 겹칩니다 (코드·번호 중복). 다른 값으로 다시 입력하세요.",
  ER_NO_REFERENCED_ROW_2: "연결할 항목을 찾을 수 없습니다. 선택한 값을 확인하세요.",
  ER_ROW_IS_REFERENCED_2: "다른 기록에서 쓰고 있어 처리할 수 없습니다.",
  ER_DATA_TOO_LONG: "입력한 값이 너무 깁니다. 줄여서 다시 입력하세요.",
  ER_TRUNCATED_WRONG_VALUE: "입력한 값의 형식이 맞지 않습니다.",
  ER_BAD_NULL_ERROR: "필수 항목이 비어 있습니다.",
};
const GENERIC = "데이터를 처리하지 못했습니다 — 잠시 후 다시 시도하세요. 계속되면 관리자에게 알려 주세요.";

/** 오류와 원인 사슬에서 MySQL 오류 코드 */
function mysqlCode(err: unknown): string | null {
  let cur: any = err;
  for (let i = 0; cur && i < 5; i++) {
    if (typeof cur.code === "string" && cur.code.startsWith("ER_")) return cur.code;
    cur = cur.cause;
  }
  return null;
}

/** 원문 그대로 보내도 되면 message 를, 아니면 안내 문장을 돌려준다 */
export function toSafeErrorMessage(err: unknown): string {
  const message = String((err as any)?.message ?? "");
  const code = mysqlCode(err);
  if (!code && !SQL_LIKE.test(message)) return message;
  return (code && MESSAGE_BY_CODE[code]) || (/Duplicate entry/i.test(message) ? MESSAGE_BY_CODE.ER_DUP_ENTRY : GENERIC);
}

/**
 * 입력 검증(zod) 오류 → 고칠 수 있는 업무 문장 (Codex #590 UX, 2026-10-18)
 *   tRPC 는 입력 검증 실패 때 검증 결과 JSON 원문을 message 로 보낸다 ("[{ expected: string, … }]").
 *   스키마에 한글 안내가 있으면 그 문장을, 없으면 항목·이유를 한국어로.
 */
const FIELD_LABEL: Record<string, string> = {
  workDate: "작업일", date: "날짜", plannedDate: "계획일", quantity: "수량", qty: "수량", plannedQuantity: "계획 수량",
  productId: "제품", materialId: "원재료", partnerId: "거래처", batchId: "배치", batchCount: "배치수", name: "이름",
  code: "코드", unit: "단위", price: "단가", amount: "금액", formRecordId: "기록지", ccpType: "CCP 유형",
};
const TYPE_LABEL: Record<string, string> = { string: "글자", number: "숫자", boolean: "예/아니오", date: "날짜", array: "목록", object: "항목" };
const HANGUL = /[가-힣]/;

export interface ValidationIssueLike {
  code?: string;
  path?: Array<string | number>;
  message?: string;
  expected?: string;
  minimum?: number | bigint;
  maximum?: number | bigint;
  origin?: string;
}

function fieldName(path: Array<string | number> | undefined): string {
  const parts = (path ?? []).filter((p) => typeof p === "string") as string[];
  const last = parts[parts.length - 1];
  if (!last) return "입력값";
  return FIELD_LABEL[last] ?? `'${last}'`;
}

function issueText(i: ValidationIssueLike): string {
  const f = fieldName(i.path);
  if (i.message && HANGUL.test(i.message)) return `${f}: ${i.message}`;
  const received = /received (\w+)/.exec(i.message ?? "")?.[1];
  switch (i.code) {
    case "invalid_type":
      if (received === "undefined" || received === "null") return `${f}: 값이 없습니다.`;
      return `${f}: 형식이 맞지 않습니다${i.expected ? ` (${TYPE_LABEL[i.expected] ?? i.expected} 필요)` : ""}.`;
    case "too_small":
      return i.origin === "string" || i.origin === "array"
        ? `${f}: ${i.minimum != null && Number(i.minimum) <= 1 ? "비어 있습니다" : `${i.minimum}개(자) 이상 입력하세요`}.`
        : `${f}: ${i.minimum != null ? `${i.minimum} 이상이어야 합니다` : "값이 너무 작습니다"}.`;
    case "too_big":
      return i.origin === "string" || i.origin === "array"
        ? `${f}: ${i.maximum}개(자) 이하로 입력하세요.`
        : `${f}: ${i.maximum != null ? `${i.maximum} 이하여야 합니다` : "값이 너무 큽니다"}.`;
    case "invalid_value":
    case "invalid_enum_value":
      return `${f}: 선택할 수 없는 값입니다.`;
    default:
      return `${f}: 형식이 맞지 않습니다.`;
  }
}

/** 입력 검증 오류이면 업무 문장, 아니면 null */
export function toValidationMessage(err: unknown): string | null {
  const cause: any = (err as any)?.cause;
  const issues: ValidationIssueLike[] | undefined = Array.isArray(cause?.issues) ? cause.issues : undefined;
  if (!issues || issues.length === 0) return null;
  const head = issues.slice(0, 3).map(issueText).join(" / ");
  return `입력값을 확인하세요 — ${head}${issues.length > 3 ? ` 외 ${issues.length - 3}건` : ""}`;
}
