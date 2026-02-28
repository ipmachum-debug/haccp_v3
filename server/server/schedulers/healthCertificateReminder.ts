import { getDb } from "../db";
import { healthCertificates, employees, tenants } from "../../drizzle/schema";
import { lte, gte, and, eq } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

/**
 * 건강진단서 만료 알림 스케줄러
 * 30일 전, 7일 전, 만료일에 알림 발송
 * [보안 수정] 테넌트별 격리 처리 적용
 */
export async function checkHealthCertificateReminders() {
  const db = await getDb();
  if (!db) {
    console.error("[건강진단서 알림] 데이터베이스 연결 실패");
    return { notificationCount: 0 };
  }

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  // 30일 후, 7일 후, 오늘 날짜 계산
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);
  
  const in7Days = new Date(today);
  in7Days.setDate(in7Days.getDate() + 7);

  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id, name: tenants.name })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    let totalNotificationCount = 0;

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;
      let notificationCount = 0;

      // 30일 이내 만료 예정 (테넌트별)
      const expiring30Days = await db
        .select({
          cert: healthCertificates,
          employee: employees,
        })
        .from(healthCertificates)
        .leftJoin(employees, eq(healthCertificates.employeeId, employees.id))
        .where(
          and(
            eq(healthCertificates.tenantId, tenantId),
            lte(healthCertificates.expiryDate, in30Days),
            gte(healthCertificates.expiryDate, today),
            eq(employees.status, "active")
          )
        );

      for (const { cert, employee } of expiring30Days) {
        if (!employee) continue;

        const daysLeft = Math.ceil(
          (new Date(cert.expiryDate).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
        );

        let message = "";
        let shouldSend = false;
        
        if (daysLeft <= 0 && cert.reminderSentExpiry === 0) {
          message = `[긴급] ${employee.name} 직원의 건강진단서가 만료되었습니다. 즉시 갱신이 필요합니다. [${tenant.name}]`;
          shouldSend = true;
        } else if (daysLeft > 0 && daysLeft <= 7 && cert.reminderSent7Days === 0) {
          message = `[긴급] ${employee.name} 직원의 건강진단서가 ${daysLeft}일 후 만료됩니다. 조속한 갱신이 필요합니다. [${tenant.name}]`;
          shouldSend = true;
        } else if (daysLeft > 7 && daysLeft <= 30 && cert.reminderSent30Days === 0) {
          message = `${employee.name} 직원의 건강진단서가 ${daysLeft}일 후 만료됩니다. 갱신 준비를 시작해주세요. [${tenant.name}]`;
          shouldSend = true;
        }

        if (message && shouldSend) {
          // 알림 발송
          const sent = await notifyOwner({
            title: "건강진단서 만료 알림",
            content: message,
          });

          if (sent) {
            // 알림 발송 기록 업데이트 (테넌트별)
            const updateData: any = {};
            if (daysLeft <= 0) {
              updateData.reminderSentExpiry = 1;
            } else if (daysLeft <= 7) {
              updateData.reminderSent7Days = 1;
            } else if (daysLeft <= 30) {
              updateData.reminderSent30Days = 1;
            }

            await db
              .update(healthCertificates)
              .set(updateData)
              .where(
                and(
                  eq(healthCertificates.id, cert.id),
                  eq(healthCertificates.tenantId, tenantId)
                )
              );

            notificationCount++;
            console.log(`[건강진단서 알림] [tenant:${tenantId}] ${employee.name} - ${daysLeft}일 남음`);
          }
        }
      }

      if (notificationCount > 0) {
        console.log(`[건강진단서 알림] [tenant:${tenantId}] 총 ${notificationCount}건 발송`);
      }
      totalNotificationCount += notificationCount;
    }

    console.log(`[건강진단서 알림] 전체 ${totalNotificationCount}건 발송`);
    return { notificationCount: totalNotificationCount };
  } catch (error) {
    console.error("[건강진단서 알림] 오류 발생:", error);
    return { notificationCount: 0 };
  }
}

/**
 * 만료된 건강진단서 알림 재설정
 * 갱신된 건강진단서의 reminderSent를 0으로 초기화
 * [보안 수정] 테넌트별 격리 처리 적용
 */
export async function resetExpiredCertificateReminders() {
  const db = await getDb();
  if (!db) return;

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  
  const in30Days = new Date(today);
  in30Days.setDate(in30Days.getDate() + 30);

  try {
    // [보안] 활성 테넌트 목록 조회
    const activeTenants = await db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.status, "active"));

    for (const tenant of activeTenants) {
      const tenantId = tenant.id;

      // 만료일이 30일 이상 남은 건강진단서의 알림 플래그 초기화 (테넌트별)
      await db
        .update(healthCertificates)
        .set({ 
          reminderSent30Days: 0,
          reminderSent7Days: 0,
          reminderSentExpiry: 0,
        })
        .where(
          and(
            eq(healthCertificates.tenantId, tenantId),
            gte(healthCertificates.expiryDate, in30Days)
          )
        );
    }

    console.log("[건강진단서 알림] 만료 알림 플래그 초기화 완료");
  } catch (error) {
    console.error("[건강진단서 알림] 플래그 초기화 오류:", error);
  }
}
