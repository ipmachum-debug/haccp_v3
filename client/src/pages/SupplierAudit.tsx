import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Building2, ClipboardCheck, Star, BarChart3 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";

export default function SupplierAudit({ embedded, ..._ }: { embedded?: boolean; [key: string]: any } = {}) {
  const [activeTab, setActiveTab] = useState("suppliers");
  const [isCreateSupplierOpen, setIsCreateSupplierOpen] = useState(false);
  const [isCreateAuditOpen, setIsCreateAuditOpen] = useState(false);
  const [isCreateEvalOpen, setIsCreateEvalOpen] = useState(false);

  // 데이터 조회
  const { data: suppliers, refetch: refetchSuppliers } = trpc.supplierAudit.listSuppliers.useQuery({ limit: 100 });
  const { data: audits, refetch: refetchAudits } = trpc.supplierAudit.listAudits.useQuery({ limit: 100 });
  const { data: evaluations, refetch: refetchEvals } = trpc.supplierAudit.listEvaluations.useQuery({ limit: 100 });
  const { data: dashboard } = trpc.supplierAudit.getDashboard.useQuery();

  // 뮤테이션
  const createSupplierMut = trpc.supplierAudit.createSupplier.useMutation({
    onSuccess: () => { alert("공급업체가 등록되었습니다."); setIsCreateSupplierOpen(false); refetchSuppliers(); },
    onError: (err: any) => alert(`등록 실패: ${err.message}`),
  });

  const createAuditMut = trpc.supplierAudit.createAudit.useMutation({
    onSuccess: () => { alert("감사가 등록되었습니다."); setIsCreateAuditOpen(false); refetchAudits(); },
    onError: (err: any) => alert(`등록 실패: ${err.message}`),
  });

  const createEvalMut = trpc.supplierAudit.createEvaluation.useMutation({
    onSuccess: () => { alert("평가가 등록되었습니다."); setIsCreateEvalOpen(false); refetchEvals(); },
    onError: (err: any) => alert(`등록 실패: ${err.message}`),
  });

  const handleCreateSupplier = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createSupplierMut.mutate({
      supplierCode: fd.get("supplierCode") as string,
      supplierName: fd.get("supplierName") as string,
      businessNumber: fd.get("businessNumber") as string,
      contactPerson: fd.get("contactPerson") as string,
      phone: fd.get("phone") as string,
      email: fd.get("email") as string,
      address: fd.get("address") as string,
      supplierType: fd.get("supplierType") as string,
      certifications: fd.get("certifications") as string,
    });
  };

  const handleCreateAudit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createAuditMut.mutate({
      supplierId: parseInt(fd.get("supplierId") as string),
      auditDate: fd.get("auditDate") as string,
      auditType: fd.get("auditType") as string,
      auditorName: fd.get("auditorName") as string,
      score: parseFloat(fd.get("score") as string),
      result: fd.get("result") as any,
      findings: fd.get("findings") as string,
      recommendations: fd.get("recommendations") as string,
      nextAuditDate: fd.get("nextAuditDate") as string,
    });
  };

  const handleCreateEval = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createEvalMut.mutate({
      supplierId: parseInt(fd.get("supplierId") as string),
      evaluationDate: fd.get("evaluationDate") as string,
      qualityScore: parseInt(fd.get("qualityScore") as string),
      deliveryScore: parseInt(fd.get("deliveryScore") as string),
      priceScore: parseInt(fd.get("priceScore") as string),
      serviceScore: parseInt(fd.get("serviceScore") as string),
      responseScore: parseInt(fd.get("responseScore") as string),
      comments: fd.get("comments") as string,
      strengths: fd.get("strengths") as string,
      weaknesses: fd.get("weaknesses") as string,
      recommendations: fd.get("recommendations") as string,
    });
  };

  const getResultBadge = (result: string | null) => {
    if (!result) return "-";
    const cfg: Record<string, { label: string; className: string }> = {
      pass: { label: "합격", className: "bg-green-500" },
      fail: { label: "불합격", className: "bg-red-500" },
      conditional: { label: "조건부", className: "bg-yellow-500" },
    };
    const c = cfg[result] || { label: result, className: "bg-gray-500" };
    return <Badge className={c.className}>{c.label}</Badge>;
  };

    const content = (
      <>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">거래처 감사 관리</h1>
            <p className="text-gray-500 mt-1">공급업체 관리, 감사, 평가를 종합적으로 관리합니다.</p>
          </div>
        </div>

        {/* 대시보드 카드 */}
        {dashboard && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">전체 공급업체</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{dashboard.supplierStats?.total || 0}</p><p className="text-xs text-gray-500">활성: {dashboard.supplierStats?.active || 0}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">감사 합격률</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{dashboard.auditStats?.total ? Math.round((dashboard.auditStats.pass / dashboard.auditStats.total) * 100) : 0}%</p><p className="text-xs text-gray-500">총 {dashboard.auditStats?.total || 0}건</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">평균 감사 점수</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{dashboard.auditStats?.avgScore ? Number(dashboard.auditStats.avgScore).toFixed(1) : "-"}</p></CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm text-gray-500">평균 평가 점수</CardTitle></CardHeader>
              <CardContent><p className="text-2xl font-bold">{dashboard.evalStats?.avgOverall ? Number(dashboard.evalStats.avgOverall).toFixed(2) : "-"}/5.0</p></CardContent>
            </Card>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="suppliers"><Building2 className="w-4 h-4 mr-2" />공급업체</TabsTrigger>
            <TabsTrigger value="audits"><ClipboardCheck className="w-4 h-4 mr-2" />감사</TabsTrigger>
            <TabsTrigger value="evaluations"><Star className="w-4 h-4 mr-2" />평가</TabsTrigger>
          </TabsList>

          {/* 공급업체 탭 */}
          <TabsContent value="suppliers" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setIsCreateSupplierOpen(true)} className="w-full md:w-auto"><Plus className="w-4 h-4 mr-2" />공급업체 등록</Button>
            </div>
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>코드</TableHead>
                      <TableHead>업체명</TableHead>
                      <TableHead>사업자번호</TableHead>
                      <TableHead>담당자</TableHead>
                      <TableHead>연락처</TableHead>
                      <TableHead>유형</TableHead>
                      <TableHead>등급</TableHead>
                      <TableHead>상태</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {suppliers?.map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="font-medium">{s.supplierCode || "-"}</TableCell>
                        <TableCell>{s.supplierName}</TableCell>
                        <TableCell>{s.businessNumber || "-"}</TableCell>
                        <TableCell>{s.contactPerson || "-"}</TableCell>
                        <TableCell>{s.phone || "-"}</TableCell>
                        <TableCell>{s.supplierType || "-"}</TableCell>
                        <TableCell>{s.rating || "-"}</TableCell>
                        <TableCell><Badge className={s.isActive ? "bg-green-500" : "bg-gray-500"}>{s.isActive ? "활성" : "비활성"}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {(!suppliers || suppliers.length === 0) && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-500">등록된 공급업체가 없습니다.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 감사 탭 */}
          <TabsContent value="audits" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setIsCreateAuditOpen(true)} className="w-full md:w-auto"><Plus className="w-4 h-4 mr-2" />감사 등록</Button>
            </div>
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>감사일</TableHead>
                      <TableHead>공급업체 ID</TableHead>
                      <TableHead>감사 유형</TableHead>
                      <TableHead>감사원</TableHead>
                      <TableHead>점수</TableHead>
                      <TableHead>결과</TableHead>
                      <TableHead>다음 감사일</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {audits?.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.auditDate}</TableCell>
                        <TableCell>{a.supplierId}</TableCell>
                        <TableCell>{a.auditType || "-"}</TableCell>
                        <TableCell>{a.auditorName || "-"}</TableCell>
                        <TableCell>{a.score || "-"}</TableCell>
                        <TableCell>{getResultBadge(a.result)}</TableCell>
                        <TableCell>{a.nextAuditDate || "-"}</TableCell>
                      </TableRow>
                    ))}
                    {(!audits || audits.length === 0) && (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-gray-500">등록된 감사가 없습니다.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 평가 탭 */}
          <TabsContent value="evaluations" className="space-y-4">
            <div className="flex justify-end">
              <Button onClick={() => setIsCreateEvalOpen(true)}><Plus className="w-4 h-4 mr-2" />평가 등록</Button>
            </div>
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>평가일</TableHead>
                      <TableHead>공급업체 ID</TableHead>
                      <TableHead>품질</TableHead>
                      <TableHead>납기</TableHead>
                      <TableHead>가격</TableHead>
                      <TableHead>서비스</TableHead>
                      <TableHead>대응</TableHead>
                      <TableHead>종합</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {evaluations?.map((ev: any) => (
                      <TableRow key={ev.id}>
                        <TableCell>{ev.evaluationDate}</TableCell>
                        <TableCell>{ev.supplierId}</TableCell>
                        <TableCell>{ev.qualityScore}/5</TableCell>
                        <TableCell>{ev.deliveryScore}/5</TableCell>
                        <TableCell>{ev.priceScore}/5</TableCell>
                        <TableCell>{ev.serviceScore}/5</TableCell>
                        <TableCell>{ev.responseScore}/5</TableCell>
                        <TableCell className="font-bold">{ev.overallScore}/5</TableCell>
                      </TableRow>
                    ))}
                    {(!evaluations || evaluations.length === 0) && (
                      <TableRow><TableCell colSpan={8} className="text-center py-8 text-gray-500">등록된 평가가 없습니다.</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 공급업체 등록 다이얼로그 */}
        <Dialog open={isCreateSupplierOpen} onOpenChange={setIsCreateSupplierOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>공급업체 등록</DialogTitle>
              <DialogDescription>새로운 공급업체를 등록합니다.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateSupplier} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><Label>업체 코드</Label><Input name="supplierCode" placeholder="SUP-001" /></div>
                <div><Label>업체명 *</Label><Input name="supplierName" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>사업자번호</Label><Input name="businessNumber" /></div>
                <div><Label>담당자</Label><Input name="contactPerson" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>연락처</Label><Input name="phone" /></div>
                <div><Label>이메일</Label><Input name="email" type="email" /></div>
              </div>
              <div><Label>주소</Label><Input name="address" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>업체 유형</Label>
                  <Select name="supplierType">
                    <SelectTrigger><SelectValue placeholder="유형 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="raw_material">원료 공급</SelectItem>
                      <SelectItem value="packaging">포장재 공급</SelectItem>
                      <SelectItem value="equipment">설비 공급</SelectItem>
                      <SelectItem value="service">서비스</SelectItem>
                      <SelectItem value="other">기타</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>인증 현황</Label><Input name="certifications" placeholder="HACCP, ISO22000" /></div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateSupplierOpen(false)}>취소</Button>
                <Button type="submit" disabled={createSupplierMut.isPending}>{createSupplierMut.isPending ? "등록 중..." : "등록"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 감사 등록 다이얼로그 */}
        <Dialog open={isCreateAuditOpen} onOpenChange={setIsCreateAuditOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>감사 등록</DialogTitle>
              <DialogDescription>공급업체 감사를 등록합니다.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateAudit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>공급업체 *</Label>
                  <Select name="supplierId" required>
                    <SelectTrigger><SelectValue placeholder="공급업체 선택" /></SelectTrigger>
                    <SelectContent>
                      {suppliers?.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.supplierName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>감사일 *</Label><Input name="auditDate" type="date" required /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>감사 유형</Label>
                  <Select name="auditType">
                    <SelectTrigger><SelectValue placeholder="유형 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="initial">초기 감사</SelectItem>
                      <SelectItem value="periodic">정기 감사</SelectItem>
                      <SelectItem value="special">특별 감사</SelectItem>
                      <SelectItem value="follow_up">추적 감사</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>감사원</Label><Input name="auditorName" /></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>점수</Label><Input name="score" type="number" step="0.01" min="0" max="100" /></div>
                <div>
                  <Label>결과</Label>
                  <Select name="result">
                    <SelectTrigger><SelectValue placeholder="결과 선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pass">합격</SelectItem>
                      <SelectItem value="fail">불합격</SelectItem>
                      <SelectItem value="conditional">조건부</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>발견 사항</Label><Textarea name="findings" rows={3} /></div>
              <div><Label>권장 사항</Label><Textarea name="recommendations" rows={3} /></div>
              <div><Label>다음 감사 예정일</Label><Input name="nextAuditDate" type="date" /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateAuditOpen(false)}>취소</Button>
                <Button type="submit" disabled={createAuditMut.isPending}>{createAuditMut.isPending ? "등록 중..." : "등록"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* 평가 등록 다이얼로그 */}
        <Dialog open={isCreateEvalOpen} onOpenChange={setIsCreateEvalOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>공급업체 평가</DialogTitle>
              <DialogDescription>공급업체를 5개 항목으로 평가합니다 (1-5점).</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleCreateEval} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>공급업체 *</Label>
                  <Select name="supplierId" required>
                    <SelectTrigger><SelectValue placeholder="공급업체 선택" /></SelectTrigger>
                    <SelectContent>
                      {suppliers?.map((s: any) => (
                        <SelectItem key={s.id} value={String(s.id)}>{s.supplierName}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>평가일 *</Label><Input name="evaluationDate" type="date" required /></div>
              </div>
              <div className="grid grid-cols-5 gap-2">
                <div><Label>품질 *</Label><Input name="qualityScore" type="number" min="1" max="5" required /></div>
                <div><Label>납기 *</Label><Input name="deliveryScore" type="number" min="1" max="5" required /></div>
                <div><Label>가격 *</Label><Input name="priceScore" type="number" min="1" max="5" required /></div>
                <div><Label>서비스 *</Label><Input name="serviceScore" type="number" min="1" max="5" required /></div>
                <div><Label>대응 *</Label><Input name="responseScore" type="number" min="1" max="5" required /></div>
              </div>
              <div><Label>종합 의견</Label><Textarea name="comments" rows={2} /></div>
              <div className="grid grid-cols-2 gap-4">
                <div><Label>강점</Label><Textarea name="strengths" rows={2} /></div>
                <div><Label>약점</Label><Textarea name="weaknesses" rows={2} /></div>
              </div>
              <div><Label>개선 권장사항</Label><Textarea name="recommendations" rows={2} /></div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setIsCreateEvalOpen(false)}>취소</Button>
                <Button type="submit" disabled={createEvalMut.isPending}>{createEvalMut.isPending ? "등록 중..." : "등록"}</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      </>
    );
    if (embedded) return content;
    return <DashboardLayout>{content}</DashboardLayout>;
}
