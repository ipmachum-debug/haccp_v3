/**
 * 교반(가열) 공정그룹 CCP 문서 양식 텍스트 시드
 * ============================================================================
 * 배경: CCP 모니터링일지의 "모니터링 방법 / 개선조치 방법" 문구는 공정그룹별로
 *   달라야 한다(교반 vs 증숙). 렌더러는 ccp_process_groups.monitoring_method /
 *   corrective_action 를 우선 사용하고, 없으면 하드코딩된 "증숙" 문구로 폴백한다.
 *   → 교반 공정그룹은 이 텍스트가 비어 있으면 "증숙(시루/스팀)" 문구로 잘못 표기됨.
 *
 * 조치: 교반 공정그룹(name LIKE '%교반%')에 사용자 제공 기준서 문구를 시드한다.
 *   · monitoring_method: 교반 전용(시루/스팀 문구 없음, "가열(교반)")
 *   · corrective_action: 표준 개선조치(교반/증숙 공통)
 *   증숙 그룹은 건드리지 않음(렌더러 폴백이 이미 올바름).
 *
 * 실행:
 *   npx tsx scripts/seed-ccp-mixing-group-form-text.ts            # DRY-RUN
 *   npx tsx scripts/seed-ccp-mixing-group-form-text.ts --commit   # 반영
 * 옵션: --tenant=2  --like=교반  --overwrite(기존값도 덮어씀; 기본은 빈 값만 채움)
 * ============================================================================
 */
import { config } from "dotenv";
import mysql from "mysql2/promise";

config();
function arg(n: string, d?: string) { const h = process.argv.find(a => a.startsWith(`--${n}=`)); return h ? h.split("=")[1] : d; }
const COMMIT = process.argv.includes("--commit");
const OVERWRITE = process.argv.includes("--overwrite");
const TENANT = Number(arg("tenant", "2"));
const LIKE = arg("like", "교반");

// 사용자 제공 기준서(교반) 문구
const MONITORING_METHOD = [
  "○ 가열시간 : 모니터링 담당자는 검교정된 타이머를 이용하여 시간을 확인하고 일지에 기록",
  "○ 품명 및 해당 품목 가열(교반) 압력확인 - 압력계 수치 확인",
  "○ 품명 및 해당 품목 가열(교반) 시간확인 - 가열(교반) 시간을 타이머로 설정(setting)",
  "○ 타이머로 설정된 시간 종료 후 탐침온도계로 품온 측정 및 측정시간 확인, 기록",
].join("\n");

const CORRECTIVE_ACTION = [
  "○ 가열온도 또는 가열시간 미달 시",
  " - 모니터링 담당자는 한계기준 이탈시 즉시 작업을 중지한다.",
  " - 가열온도와 가열시간을 재조정한 후 미달된 제품에 대해 재가열을 실시하고",
  "   제품검사(관능)를 실시하여 이상이 없는 경우 다음 공정을 진행한다.",
  " - 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록한다.",
  "○ 가열온도 또는 가열시간 초과 시",
  " - 모니터링 담당자는 한계기준 이탈시 즉시 작업을 중지한다.",
  " - 제품검사(관능 등)를 실시하여 이상이 없는 경우 다음공정을 진행한다.",
  " - 한계기준 이탈내용과 개선조치 내용을 모니터링 일지에 기록한다.",
  "○ 기계고장 시",
  " - 모니터링 담당자는 가열기 등 기계고장 시 즉시 작업을 중지한다.",
  " - 수리 후 정상적으로 작동 시 재가동한다.",
  " ※ 즉각적인 수리가 불가능할 경우 교차오염이 되지 않도록 보호조치하여",
  "   냉장창고에 보관한후, 수리가 끝나면 제품 생산을 계속한다.",
  "○ 공통 : 개선조치 시",
  " - 문제 발생 시 HACCP팀장에게 보고 후 조치하며, 개선조치 후 모니터링 일지에",
  "   기록후 HACCP팀장에게 승인을 받는다.",
].join("\n");

(async () => {
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  console.log(`\n=== 교반 공정그룹 CCP 문서 텍스트 시드 (${COMMIT ? "COMMIT" : "DRY-RUN"}) tenant=${TENANT} like=%${LIKE}% overwrite=${OVERWRITE} ===\n`);

  const [rows]: any = await conn.query(
    `SELECT id, name, ccp_type,
            (monitoring_method IS NULL OR monitoring_method = '') AS mm_empty,
            (corrective_action IS NULL OR corrective_action = '') AS ca_empty
       FROM ccp_process_groups
      WHERE tenant_id = ? AND name LIKE ?
      ORDER BY id`,
    [TENANT, `%${LIKE}%`],
  );

  if ((rows as any[]).length === 0) {
    console.log(`매칭되는 공정그룹 없음 (name LIKE '%${LIKE}%'). --like 로 이름 조정 가능.`);
    await conn.end(); process.exit(0);
  }

  console.log(`매칭 공정그룹 ${rows.length}개:`);
  for (const g of rows as any[]) {
    const willMM = OVERWRITE || g.mm_empty;
    const willCA = OVERWRITE || g.ca_empty;
    console.log(`  #${g.id} [${g.ccp_type}] ${g.name}  → 방법:${willMM ? "설정" : "유지"} / 개선조치:${willCA ? "설정" : "유지"}`);
  }

  if (!COMMIT) {
    console.log(`\n--- 미리보기 (monitoring_method) ---\n${MONITORING_METHOD}`);
    console.log(`\n--- 미리보기 (corrective_action) ---\n${CORRECTIVE_ACTION}`);
    console.log(`\nDRY-RUN — --commit 시 위 그룹에 반영. (기본: 빈 값만 채움, --overwrite 로 기존값도 교체)`);
    await conn.end(); process.exit(0);
  }

  let done = 0;
  for (const g of rows as any[]) {
    const sets: string[] = [];
    const params: any[] = [];
    if (OVERWRITE || g.mm_empty) { sets.push("monitoring_method = ?"); params.push(MONITORING_METHOD); }
    if (OVERWRITE || g.ca_empty) { sets.push("corrective_action = ?"); params.push(CORRECTIVE_ACTION); }
    if (sets.length === 0) continue;
    sets.push("updated_at = NOW()");
    params.push(g.id, TENANT);
    await conn.execute(`UPDATE ccp_process_groups SET ${sets.join(", ")} WHERE id = ? AND tenant_id = ?`, params);
    done++;
  }
  console.log(`\n[결과] ${done}개 공정그룹 텍스트 반영 완료.`);

  await conn.end();
  console.log(`\n=== 종료 ===\n`);
  process.exit(0);
})().catch(e => { console.error("시드 실패:", e); process.exit(1); });
