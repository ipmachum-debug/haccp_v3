/**
 * /notifications 단독 화면 (상단 알림 종 "모두 보기" · 모바일 하단바 "알림")
 * 2026-10-14 대표 보고: 레이아웃 없이 알림 센터만 떠서 모바일에서 헤더·뒤로가기·하단바가 없었다 → 공통 레이아웃으로 감싼다.
 * 알림 관리(/dashboard/notifications)의 '센터' 탭과 같은 컴포넌트.
 */
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import NotificationCenter from "./NotificationCenter";

export default function NotificationCenterPage() {
  return (
    <DashboardLayout>
      <NotificationCenter />
    </DashboardLayout>
  );
}
