/**
 * LOT 추적 — 테넌트 격리 회귀 테스트
 *
 * 검증:
 *  traceLotForward / traceLotBackward / traceLotByProductLotNumber / traceLotByMaterialLotNumber 가
 *  만드는 모든 SQL 에 호출한 회사의 tenant_id 조건이 들어가고,
 *  LEFT JOIN 상대(h_products_v2 / h_materials / h_inventory_lots)도 같은 회사로 묶이며,
 *  LOT 번호 → 정방향/역방향 내부 재호출에도 같은 tenantId 가 전달되는지 확인한다.
 *
 * 이전 결함: 첫 lotId / batchId 조회와 LOT 번호 조회에 회사 조건이 없었고,
 *  LOT 번호 조회 뒤 내부 추적 호출에 tenantId 를 넘기지 않았다.
 *  (scripts/_lint/verify-tenant-isolation.ts 는 raw SQL 만 검사해 Drizzle 빌더 쿼리는 잡지 못한다.)
 *
 * DB 는 drizzle mysql-proxy 로 대체해 실제 생성 SQL 과 바인딩 값을 기록한다.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/mysql-proxy";

type Captured = { sql: string; params: unknown[] };
const captured: Captured[] = [];
let responses: unknown[][][] = [];

const fakeDb = drizzle(async (sql, params) => {
  captured.push({ sql, params });
  return { rows: responses.shift() ?? [] };
});

vi.mock("../connection", () => ({
  getDb: async () => fakeDb,
}));

const {
  traceLotForward,
  traceLotBackward,
  traceLotByProductLotNumber,
  traceLotByMaterialLotNumber,
} = await import("./traceability");

const TENANT = 7;

/** WHERE 절에 `<table>`.`tenant_id` = ? 가 있고, 그 자리의 바인딩 값이 TENANT 인지 확인 */
function expectWhereTenant(q: Captured, table: string) {
  const where = q.sql.slice(q.sql.indexOf(" where "));
  const marker = `\`${table}\`.\`tenant_id\` = ?`;
  expect(where, `${table} WHERE 에 tenant 조건 없음: ${q.sql}`).toContain(marker);
  const before = q.sql.slice(0, q.sql.indexOf(marker, q.sql.indexOf(" where ")));
  const paramIndex = (before.match(/\?/g) ?? []).length;
  expect(q.params[paramIndex]).toBe(TENANT);
}

/** LEFT JOIN 상대 테이블의 ON 절에 tenant_id 짝맞춤이 있는지 확인 */
function expectJoinTenant(q: Captured, joined: string, parent: string) {
  const re = new RegExp(`left join \`${joined}\` on ([^]*?)(?= left join | where )`);
  const on = q.sql.match(re)?.[1] ?? "";
  expect(on, `${joined} JOIN 에 tenant 조건 없음: ${q.sql}`).toContain(
    `\`${joined}\`.\`tenant_id\` = \`${parent}\`.\`tenant_id\``,
  );
}

beforeEach(() => {
  captured.length = 0;
  responses = [];
});

describe("LOT 추적 — 테넌트 격리", () => {
  it("정방향: LOT 조회 · 투입 · 배치 · 완제품 조회가 모두 회사로 제한된다", async () => {
    responses = [[[101]], [[55, "10", "kg"]], [], []];
    await traceLotForward(101, TENANT);

    expect(captured).toHaveLength(4);
    expectWhereTenant(captured[0], "h_inventory_lots");
    expectWhereTenant(captured[1], "h_batch_inputs");
    expectWhereTenant(captured[2], "h_batches");
    expectJoinTenant(captured[2], "h_products_v2", "h_batches");
    expectWhereTenant(captured[3], "h_batch_products");
  });

  it("정방향: 다른 회사의 lotId 는 첫 조회에서 찾을 수 없음으로 끝난다", async () => {
    responses = [[]];
    await expect(traceLotForward(999, TENANT)).rejects.toThrow("LOT을 찾을 수 없습니다.");
    expect(captured).toHaveLength(1);
    expectWhereTenant(captured[0], "h_inventory_lots");
  });

  it("역방향: 배치 · 투입 원료 · 완제품 조회와 원료 · LOT JOIN 이 모두 회사로 제한된다", async () => {
    responses = [[[55]], [], []];
    await traceLotBackward(55, TENANT);

    expect(captured).toHaveLength(3);
    expectWhereTenant(captured[0], "h_batches");
    expectJoinTenant(captured[0], "h_products_v2", "h_batches");
    expectWhereTenant(captured[1], "h_batch_inputs");
    expectJoinTenant(captured[1], "h_materials", "h_batch_inputs");
    expectJoinTenant(captured[1], "h_inventory_lots", "h_batch_inputs");
    expectWhereTenant(captured[2], "h_batch_products");
  });

  it("역방향: 다른 회사의 batchId 는 찾을 수 없음으로 끝난다", async () => {
    responses = [[]];
    await expect(traceLotBackward(999, TENANT)).rejects.toThrow("배치를 찾을 수 없습니다.");
    expectWhereTenant(captured[0], "h_batches");
  });

  it("완제품 LOT 번호: 번호 조회와 이어지는 역방향 추적 전부 같은 회사로 제한된다", async () => {
    // h_batch_products 첫 행: id, tenant_id, batch_id ... (batchId 는 세 번째 칼럼)
    responses = [[[1, TENANT, 55]], [[55]], [], []];
    await traceLotByProductLotNumber("P-0001", TENANT);

    expect(captured).toHaveLength(4);
    expectWhereTenant(captured[0], "h_batch_products");
    expectWhereTenant(captured[1], "h_batches");
    expectWhereTenant(captured[2], "h_batch_inputs");
    expectWhereTenant(captured[3], "h_batch_products");
  });

  it("원재료 LOT 번호: 번호 조회와 이어지는 정방향 추적 전부 같은 회사로 제한된다", async () => {
    responses = [[[101]], [[101]], [], []];
    await traceLotByMaterialLotNumber("M-0001", TENANT);

    expect(captured.length).toBeGreaterThanOrEqual(3);
    expectWhereTenant(captured[0], "h_inventory_lots");
    expectWhereTenant(captured[1], "h_inventory_lots");
    expectWhereTenant(captured[2], "h_batch_inputs");
  });
});
