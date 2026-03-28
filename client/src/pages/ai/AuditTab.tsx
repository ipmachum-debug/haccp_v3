import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  FileText, CheckCircle, Shield, AlertTriangle, Clock,
  Eye, FileCheck, RefreshCw, Loader2,
} from "lucide-react";

// ============================================================================
// Tab: 감사 자료 자동 묶기
// ============================================================================
export function AuditTab() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const [startDate, setStartDate] = useState(`${year}-${month}-01`);
  const [endDate, setEndDate] = useState(`${year}-${month}-${String(now.getDate()).padStart(2, "0")}`);
  const [enabled, setEnabled] = useState(false);

  const auditDocs = trpc.ai.gatherAuditDocs.useQuery(
    { startDate, endDate },
    { enabled }
  );

  const handleGather = () => setEnabled(true);

  const summary = auditDocs.data?.summary as any;

  return (
    <div className="space-y-2.5">
      <Card>
        <CardContent className="py-2.5 px-3 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <FileText className="w-4 h-4" /> 감사/점검 대응 자료 현황
          </h3>
          <p className="text-sm text-muted-foreground">
            HACCP 인증 심사 또는 내부 점검 시 필요한 기록 현황을 기간별로 확인합니다.
          </p>
          <div className="flex items-end gap-2">
            <div>
              <Label>시작일</Label>
              <Input type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); setEnabled(false); }} />
            </div>
            <div>
              <Label>종료일</Label>
              <Input type="date" value={endDate} onChange={(e) => { setEndDate(e.target.value); setEnabled(false); }} />
            </div>
            <Button onClick={handleGather} disabled={auditDocs.isLoading}>
              {auditDocs.isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
              현황 조회
            </Button>
          </div>
        </CardContent>
      </Card>

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          <AuditCard title="체크리스트" total={summary.checklists?.cnt || 0} detail={`완료 ${summary.checklists?.completed || 0}건`} icon={<CheckCircle className="w-5 h-5 text-green-600" />} />
          <AuditCard title="CCP 모니터링" total={summary.ccpMonitoring?.cnt || 0} detail={`승인 ${summary.ccpMonitoring?.approved || 0}건`} icon={<Shield className="w-5 h-5 text-blue-600" />} />
          <AuditCard title="시정조치" total={summary.correctiveActions?.cnt || 0} detail={`해결 ${summary.correctiveActions?.resolved || 0}건`} icon={<AlertTriangle className="w-5 h-5 text-orange-600" />} />
          <AuditCard title="검교정" total={summary.calibrations?.cnt || 0} detail="실시 기록" icon={<Clock className="w-5 h-5 text-purple-600" />} />
          <AuditCard title="위생점검" total={summary.hygieneInspections?.cnt || 0} detail="실시 기록" icon={<Shield className="w-5 h-5 text-teal-600" />} />
          <AuditCard title="교육훈련" total={summary.trainings?.cnt || 0} detail="실시 기록" icon={<FileText className="w-5 h-5 text-indigo-600" />} />
          <AuditCard title="수입검사" total={summary.inspections?.material || 0} detail="실시 기록" icon={<Eye className="w-5 h-5 text-yellow-600" />} />
          <AuditCard title="출하검사" total={summary.inspections?.shipping || 0} detail="실시 기록" icon={<FileCheck className="w-5 h-5 text-red-600" />} />
        </div>
      )}
    </div>
  );
}

function AuditCard({ title, total, detail, icon }: { title: string; total: number; detail: string; icon: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="py-2.5 px-3">
        <div className="flex items-center gap-2 mb-2">
          {icon}
          <span className="text-sm font-medium">{title}</span>
        </div>
        <div className="text-lg font-bold">{total}건</div>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}
