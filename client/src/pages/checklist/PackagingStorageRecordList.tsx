/**
 * 포장재 보관 관리 목록 — 작성 화면이 저장하는 곳(공통 일지 h_generic_checklist_records, formType "packaging_storage_record")을 그대로 읽는다.
 * 2026-10-15 (Codex 일지 전수 점검 후속): 이전에는 쓰지 않는 옛 전용 테이블을 읽어, 저장한 기록이 목록에 나오지 않았다.
 * 옛 전용 테이블은 덤프 10/14 기준 0건 — 옮길 기록 없음.
 */
import { Package } from "lucide-react";
import ChecklistListPage from "@/components/checklist/ChecklistListPage";

export default function PackagingStorageRecordList() {
  return (
    <ChecklistListPage
      config={{
        formType: "packaging_storage_record",
        title: "포장재 보관 관리",
        description: "포장재 보관 관리 기록을 관리합니다",
        icon: <Package className="h-5 w-5 text-indigo-600" />,
        basePath: "/packaging-storage-record",
        backPath: "/quality/checklists",
      }}
    />
  );
}
