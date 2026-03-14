import { CronJob } from "cron";
import { getDb } from "../db";
import { checklistSchedules, checklistInstances, checklistTemplates, tenants } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";

/**
 * 체크리스트 자동 생성 스케줄러
 * 주기별로 인스턴스를 자동 생성
 * [보안 수정] 테넌트별 격리 처리 적용
 */

/**
 * 기간 키 생성
 * @param date 날짜
 * @param frequencyType 주기 타입
 * @returns 기간 키 (YYYY-MM-DD, YYYY-Www, YYYY-MM, YYYY)
 */
function generatePeriodKey(date: Date, frequencyType: string): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  switch (frequencyType) {
    case "DAILY":
      return `${year}-${month}-${day}`;
    case "WEEKLY": {
      // ISO 8601 주 번호
      const startOfYear = new Date(year, 0, 1);
      const dayOfYear = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
      const weekNumber = Math.ceil((dayOfYear + startOfYear.getDay() + 1) / 7);
      return `${year}-W${String(weekNumber).padStart(2, "0")}`;
    }
    case "MONTHLY":
      return `${year}-${month}`;
    case "YEARLY":
      return `${year}`;
    default:
      return `${year}-${month}-${day}`;
  }
}

/**
 * 마감 시간 계산
 */
function calculateDueDate(periodKey: string, dueTime: string | null, gracePeriodHours: number): Date {
  const date = new Date(periodKey);
  
  if (dueTime) {
    const [hours, minutes] = dueTime.split(":").map(Number);
    date.setHours(hours, minutes, 0, 0);
  } else {
    date.setHours(23, 59, 59, 999);
  }

  // 유예 시간 추가
  date.setHours(date.getHours() + gracePeriodHours);

  return date;
}

/**
 * 특정 주기의 인스턴스 생성 (테넌트별)
 */
async function generateInstancesForFrequency(frequencyType: string, periodKeyFn: (today: Date) => string, dueDateFn: (today: Date, schedule: any) => Date) {
  const db = await getDb();
  if (!db) {
    console.error("[체크리스트 생성기] 데이터베이스 연결 실패");
    return;
  }

  console.log(`[체크리스트 생성기] ${frequencyType} 인스턴스 생성 시작`);

  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    const today = new Date();
    const periodKey = periodKeyFn(today);

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 활성화된 스케줄 조회 (테넌트별)
      const schedules = await db
        .select()
        .from(checklistSchedules)
        .where(
          and(
            eq(checklistSchedules.tenantId, tenantId),
            eq(checklistSchedules.frequencyType, frequencyType) as any,
            eq(checklistSchedules.active, 1),
            eq(checklistSchedules.autoGenerate, 1)
          )
        );

      for (const schedule of schedules) {
        // 이미 생성된 인스턴스가 있는지 확인 (테넌트별)
        const existing = await db
          .select()
          .from(checklistInstances)
          .where(
            and(
              eq(checklistInstances.tenantId, tenantId),
              eq(checklistInstances.templateId, schedule.templateId),
              eq(checklistInstances.periodKey, periodKey)
            )
          )
          .limit(1);

        if (existing[0]) {
          continue;
        }

        // 템플릿 정보 조회 (테넌트별)
        const templates = await db
          .select()
          .from(checklistTemplates)
          .where(
            and(
              eq(checklistTemplates.id, schedule.templateId),
              eq(checklistTemplates.tenantId, tenantId)
            )
          )
          .limit(1);

        const template = templates[0];

        if (!template) {
          console.error(`[체크리스트 생성기] [tenant:${tenantId}] 템플릿 없음: templateId=${schedule.templateId}`);
          continue;
        }

        // 마감 시간 계산
        const dueDate = dueDateFn(today, schedule);

        // 인스턴스 생성 (tenantId 포함)
        await db.insert(checklistInstances).values({
          tenantId,
          templateId: schedule.templateId,
          periodKey,
          dueDate: dueDate.toISOString().replace('T', ' ').replace('Z', ''),
          status: "pending",
          createdBy: 0, // 시스템 생성
        });

        console.log(`[체크리스트 생성기] [tenant:${tenantId}] 생성 완료: templateId=${schedule.templateId}, periodKey=${periodKey}`);
      }
    }

    console.log(`[체크리스트 생성기] ${frequencyType} 인스턴스 생성 완료`);
  } catch (error) {
    console.error(`[체크리스트 생성기] ${frequencyType} 인스턴스 생성 오류:`, error);
  }
}

/**
 * 일일 인스턴스 생성
 */
async function generateDailyInstances() {
  await generateInstancesForFrequency(
    "DAILY",
    (today) => generatePeriodKey(today, "DAILY"),
    (today, schedule) => calculateDueDate(generatePeriodKey(today, "DAILY"), schedule.dueTime, Number(schedule.gracePeriodHours))
  );
}

/**
 * 주간 인스턴스 생성
 */
async function generateWeeklyInstances() {
  await generateInstancesForFrequency(
    "WEEKLY",
    (today) => generatePeriodKey(today, "WEEKLY"),
    (today, schedule) => {
      const endOfWeek = new Date(today);
      endOfWeek.setDate(endOfWeek.getDate() + (7 - endOfWeek.getDay()));
      return calculateDueDate(endOfWeek.toISOString().split("T")[0], schedule.dueTime, Number(schedule.gracePeriodHours));
    }
  );
}

/**
 * 월간 인스턴스 생성
 */
async function generateMonthlyInstances() {
  await generateInstancesForFrequency(
    "MONTHLY",
    (today) => generatePeriodKey(today, "MONTHLY"),
    (today, schedule) => {
      const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      return calculateDueDate(endOfMonth.toISOString().split("T")[0], schedule.dueTime, Number(schedule.gracePeriodHours));
    }
  );
}

/**
 * 스케줄러 초기화
 */
export function initChecklistGenerator() {
  // 매일 오전 6시에 일일 인스턴스 생성
  new CronJob(
    "0 6 * * *",
    generateDailyInstances,
    null,
    true,
    "Asia/Seoul"
  );

  // 매주 월요일 오전 6시에 주간 인스턴스 생성
  new CronJob(
    "0 6 * * 1",
    generateWeeklyInstances,
    null,
    true,
    "Asia/Seoul"
  );

  // 매월 1일 오전 6시에 월간 인스턴스 생성
  new CronJob(
    "0 6 1 * *",
    generateMonthlyInstances,
    null,
    true,
    "Asia/Seoul"
  );

  console.log("[체크리스트 생성기] 스케줄러 초기화 완료");
}
