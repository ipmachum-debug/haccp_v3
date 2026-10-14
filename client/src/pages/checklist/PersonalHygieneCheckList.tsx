/**
 * 개인 위생관리 점검표 목록 — 작성 화면이 저장하는 곳(공통 일지 h_generic_checklist_records, formType "personal_hygiene_check")을 그대로 읽는다.
 * 2026-10-15 (Codex 일지 전수 점검): 이전에는 쓰지 않는 옛 전용 테이블을 읽어, 저장한 기록이 목록에 나오지 않았다.
 * 옛 전용 테이블은 덤프 10/14 기준 0건 — 옮길 기록 없음.
 */
import { UserCheck } from "lucide-react";
import ChecklistListPage from "@/components/checklist/ChecklistListPage";

export default function PersonalHygieneCheckList() {
  return (
    <ChecklistListPage
      config={{
        formType: "personal_hygiene_check",
        title: "개인 위생관리 점검표",
        description: "개인 위생관리 점검 기록을 관리합니다",
        icon: <UserCheck className="h-5 w-5 text-purple-600" />,
        basePath: "/personal-hygiene-check",
        backPath: "/quality/checklists",
        dateLabel: "점검 일자",
      }}
    />
  );
}
