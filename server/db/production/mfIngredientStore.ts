/**
 * 품목제조보고 버전의 원료 행 저장 — 행 id 를 유지한다 (2026-10-16, Codex PR #534 배포 검토 P2)
 *
 * 이전: 저장마다 전부 DELETE → INSERT. 행 id 가 매번 바뀌어, 저장 직후 다시 저장하거나 두 사람이 같은 보고서를
 *   열어 둔 경우 옛 id 로 보낸 요청이 원본을 못 찾아 CCP 공정 지정 등이 다시 비워질 수 있었다.
 * 지금: 한 트랜잭션에서 현재 행을 잠그고 —
 *   - 모르는 id(오래된 화면) 가 있으면 아무것도 바꾸지 않고 거부
 *   - id 있는 행은 UPDATE (id 유지), id 없는 행은 INSERT, 보내지 않은 기존 행은 DELETE
 *   - 보내지 않은 값은 원래 행에서 이어받는다 (mergeIngredientRows)
 */
import { and, eq, inArray } from "drizzle-orm";
import { hMfIngredients } from "../../../drizzle/schema/schema_recipe_new";
import {
  mergeIngredientRows,
  unknownIngredientIds,
  STALE_INGREDIENTS_MESSAGE,
  type IncomingIngredient,
} from "../../lib/production/mfIngredientMerge";

export async function saveVersionIngredients(db: any, versionId: number, incoming: IncomingIngredient[]): Promise<void> {
  await db.transaction(async (tx: any) => {
    const existing = await tx.select().from(hMfIngredients)
      .where(eq(hMfIngredients.mfReportVersionId, versionId))
      .for("update");
    if (unknownIngredientIds(incoming, existing).length > 0) throw new Error(STALE_INGREDIENTS_MESSAGE);

    const merged = mergeIngredientRows(incoming, existing, versionId);
    const keptIds = new Set<number>();
    for (let i = 0; i < merged.length; i++) {
      const id = incoming[i].id;
      if (id != null) {
        keptIds.add(Number(id));
        await tx.update(hMfIngredients).set(merged[i])
          .where(and(eq(hMfIngredients.id, Number(id)), eq(hMfIngredients.mfReportVersionId, versionId)));
      } else {
        await tx.insert(hMfIngredients).values(merged[i]);
      }
    }
    const removed = (existing as any[]).map((e) => Number(e.id)).filter((id) => !keptIds.has(id));
    if (removed.length > 0) {
      await tx.delete(hMfIngredients)
        .where(and(eq(hMfIngredients.mfReportVersionId, versionId), inArray(hMfIngredients.id, removed)));
    }
  });
}
