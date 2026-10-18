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
