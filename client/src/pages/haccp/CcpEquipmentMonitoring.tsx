import { useState } from "react";
import { trpc } from "../../lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";
import { Plus, Thermometer, Gauge, Search as SearchIcon, AlertTriangle } from "lucide-react";
import { toast } from "sonner";

import { formatLocalDate, todayLocal } from "../../lib/dateUtils";

export default function CcpEquipmentMonitoring() {
  const [selectedCcpType, setSelectedCcpType] = useState<string>("CCP-1B");
  const [selectedEquipmentId, setSelectedEquipmentId] = useState<number | null>(null);
  const [showNewRecordDialog, setShowNewRecordDialog] = useState(false);
  const [dateFilter, setDateFilter] = useState({
    startDate: formatLocalDate(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)),
    endDate: todayLocal(),
  });

  // CCP 설비 목록 조회
  const { data: equipments, isLoading: equipLoading } = trpc.ccpMonitoring.getCcpEquipments.useQuery({
    ccpType: selectedCcpType,
  });

  // 설비별 기록 조회
  const { data: records, isLoading: recordsLoading, refetch: refetchRecords } = trpc.ccpMonitoring.getCcpRecordsByEquipment.useQuery({
    equipmentId: selectedEquipmentId || undefined,
    ccpType: selectedCcpType,
    startDate: new Date(dateFilter.startDate),
    endDate: new Date(dateFilter.endDate),
    limit: 100,
  }, {
    enabled: true,
  });

  // 제품 목록
  const { data: _rawProducts } = trpc.product.list.useQuery({ limit: 9999 });
  const products = (_rawProducts as any)?.items ?? (Array.isArray(_rawProducts) ? _rawProducts : []);

  // 신규 기록 생성
  const createMutation = trpc.ccpMonitoring.createCcpRecordByEquipment.useMutation({
    onSuccess: () => {
      toast.success("CCP 기록이 생성되었습니다");
      setShowNewRecordDialog(false);
      refetchRecords();
    },
    onError: (err: any) => toast.error(`생성 실패: ${err.message}`),
  });

  // 신규 기록 폼 상태
  const [newRecord, setNewRecord] = useState({
    equipmentId: 0,
    recordDate: todayLocal(),
    ccpType: "CCP-1B" as "CCP-1B" | "CCP-2B" | "CCP-3B" | "CCP-4P",
    productName: "",
    measurementTime: "",
    heatingTimeMin: undefined as number | undefined,
    pressureMpa: "",
    temperatureC: "",
    tempEdgeC: "",
    tempCenterC: "",
    metalDetectorId: "",
    sensitivitySetting: undefined as number | undefined,
    feTestPiecePass: "",
    stsTestPiecePass: "",
    productOnlyPass: "",
    feProductPass: "",
    stsProductPass: "",
    passedQuantity: undefined as number | undefined,
    detectedQuantity: undefined as number | undefined,
    passFail: "적합" as "적합" | "부적합",
    deviationContent: "",
    correctiveAction: "",
  });

  const handleCreateRecord = () => {
    if (!newRecord.equipmentId) {
      toast.error("설비를 선택해주세요");
      return;
    }
    createMutation.mutate({
      ...newRecord,
      recordDate: new Date(newRecord.recordDate),
      source: "manual",
    });
  };

  const getCcpTypeLabel = (type: string) => {
    switch (type) {
      case "CCP-1B": return "가열 (증숙/살균)";
      case "CCP-2B": return "냉각";
      case "CCP-3B": return "가열 (교반/볶음)";
      case "CCP-4P": return "금속검출";
      default: return type;
    }
  };

  const getCcpTypeIcon = (type: string) => {
    switch (type) {
      case "CCP-1B": return <Thermometer className="h-4 w-4" />;
      case "CCP-2B": return <Thermometer className="h-4 w-4 text-blue-500" />;
      case "CCP-3B": return <Thermometer className="h-4 w-4 text-orange-500" />;
      case "CCP-4P": return <SearchIcon className="h-4 w-4 text-purple-500" />;
      default: return null;
    }
  };

  const equipmentList = Array.isArray(equipments) ? equipments : [];
  const recordList = Array.isArray(records) ? records : [];

  return (
    <div className="space-y-6">
      {/* CCP 유형 선택 */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold">설비 기준 CCP 모니터링</h2>
          <p className="text-sm text-muted-foreground">설비별로 CCP 모니터링 기록을 관리합니다</p>
        </div>
        <Button onClick={() => {
          setNewRecord(prev => ({ ...prev, ccpType: selectedCcpType as any }));
          setShowNewRecordDialog(true);
        }} className="min-h-[44px]">
          <Plus className="mr-2 h-4 w-4" /> 신규 기록
        </Button>
      </div>

      {/* CCP 유형 탭 */}
      <Tabs value={selectedCcpType} onValueChange={(v) => { setSelectedCcpType(v); setSelectedEquipmentId(null); }}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="CCP-1B" className="text-xs md:text-sm">
            {getCcpTypeIcon("CCP-1B")} <span className="ml-1">CCP-1B 가열</span>
          </TabsTrigger>
          <TabsTrigger value="CCP-2B" className="text-xs md:text-sm">
            {getCcpTypeIcon("CCP-2B")} <span className="ml-1">CCP-2B 냉각</span>
          </TabsTrigger>
          <TabsTrigger value="CCP-3B" className="text-xs md:text-sm">
            {getCcpTypeIcon("CCP-3B")} <span className="ml-1">CCP-3B 교반</span>
          </TabsTrigger>
          <TabsTrigger value="CCP-4P" className="text-xs md:text-sm">
            {getCcpTypeIcon("CCP-4P")} <span className="ml-1">CCP-4P 금속</span>
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* 설비 목록 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {equipLoading ? (
          <p className="text-muted-foreground col-span-3 text-center py-8">설비 목록 로딩 중...</p>
        ) : equipmentList.length === 0 ? (
          <Card className="col-span-3">
            <CardContent className="py-8 text-center">
              <p className="text-muted-foreground">등록된 {getCcpTypeLabel(selectedCcpType)} 설비가 없습니다</p>
              <p className="text-sm text-muted-foreground mt-2">마스터데이터 &gt; 설비 관리에서 설비를 등록해주세요</p>
            </CardContent>
          </Card>
        ) : (
          equipmentList.map((eq: any) => (
            <Card
              key={eq.id}
              className={`cursor-pointer transition-all hover:shadow-md ${selectedEquipmentId === eq.id ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelectedEquipmentId(eq.id === selectedEquipmentId ? null : eq.id)}
            >
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{eq.equipment_name}</CardTitle>
                  <Badge variant="outline">{eq.ccp_type}</Badge>
                </div>
                <CardDescription>{eq.location} {eq.zone ? `/ ${eq.zone}` : ''}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {getCcpTypeIcon(eq.ccp_type)}
                  <span>{getCcpTypeLabel(eq.ccp_type)}</span>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* 날짜 필터 */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex flex-col md:flex-row gap-4 items-end">
            <div className="flex-1">
              <Label>시작일</Label>
              <Input
                type="date"
                value={dateFilter.startDate}
                onChange={(e) => setDateFilter(prev => ({ ...prev, startDate: e.target.value }))}
              />
            </div>
            <div className="flex-1">
              <Label>종료일</Label>
              <Input
                type="date"
                value={dateFilter.endDate}
                onChange={(e) => setDateFilter(prev => ({ ...prev, endDate: e.target.value }))}
              />
            </div>
            <Button variant="outline" onClick={() => refetchRecords()} className="min-h-[44px]">
              조회
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 기록 테이블 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {selectedEquipmentId
              ? `${equipmentList.find((e: any) => e.id === selectedEquipmentId)?.equipment_name || ''} 기록`
              : `${getCcpTypeLabel(selectedCcpType)} 전체 기록`
            }
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recordsLoading ? (
            <p className="text-center py-8 text-muted-foreground">로딩 중...</p>
          ) : recordList.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">기록이 없습니다</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>시간</TableHead>
                    <TableHead>제품</TableHead>
                    {(selectedCcpType === "CCP-1B" || selectedCcpType === "CCP-3B") && (
                      <>
                        <TableHead>온도(℃)</TableHead>
                        <TableHead>가열시간(분)</TableHead>
                        <TableHead>압력(Mpa)</TableHead>
                      </>
                    )}
                    {selectedCcpType === "CCP-2B" && (
                      <>
                        <TableHead>가장자리(℃)</TableHead>
                        <TableHead>중심부(℃)</TableHead>
                      </>
                    )}
                    {selectedCcpType === "CCP-4P" && (
                      <>
                        <TableHead>Fe 시험편</TableHead>
                        <TableHead>STS 시험편</TableHead>
                        <TableHead>통과수량</TableHead>
                        <TableHead>검출수량</TableHead>
                      </>
                    )}
                    <TableHead>판정</TableHead>
                    <TableHead>이탈내용</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordList.map((rec: any) => (
                    <TableRow key={rec.id} className={rec.passFail === '부적합' ? 'bg-red-50' : ''}>
                      <TableCell>{rec.recordDate ? new Date(rec.recordDate).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>{rec.measurementTime || '-'}</TableCell>
                      <TableCell>{rec.productName || '-'}</TableCell>
                      {(selectedCcpType === "CCP-1B" || selectedCcpType === "CCP-3B") && (
                        <>
                          <TableCell>{rec.temperatureC || '-'}</TableCell>
                          <TableCell>{rec.heatingTimeMin || '-'}</TableCell>
                          <TableCell>{rec.pressureMpa || '-'}</TableCell>
                        </>
                      )}
                      {selectedCcpType === "CCP-2B" && (
                        <>
                          <TableCell>{rec.tempEdgeC || '-'}</TableCell>
                          <TableCell>{rec.tempCenterC || '-'}</TableCell>
                        </>
                      )}
                      {selectedCcpType === "CCP-4P" && (
                        <>
                          <TableCell>
                            <Badge variant={rec.feTestPiecePass === '적합' ? 'default' : 'destructive'}>
                              {rec.feTestPiecePass || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={rec.stsTestPiecePass === '적합' ? 'default' : 'destructive'}>
                              {rec.stsTestPiecePass || '-'}
                            </Badge>
                          </TableCell>
                          <TableCell>{rec.passedQuantity ?? '-'}</TableCell>
                          <TableCell>{rec.detectedQuantity ?? '-'}</TableCell>
                        </>
                      )}
                      <TableCell>
                        <Badge variant={rec.passFail === '적합' ? 'default' : 'destructive'}>
                          {rec.passFail}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {rec.deviationContent ? (
                          <span className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="h-3 w-3" /> {rec.deviationContent}
                          </span>
                        ) : '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 신규 기록 다이얼로그 */}
      <Dialog open={showNewRecordDialog} onOpenChange={setShowNewRecordDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>CCP 모니터링 기록 생성 ({getCcpTypeLabel(selectedCcpType)})</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>설비 *</Label>
              <Select
                value={newRecord.equipmentId ? String(newRecord.equipmentId) : ""}
                onValueChange={(v) => setNewRecord(prev => ({ ...prev, equipmentId: Number(v) }))}
              >
                <SelectTrigger><SelectValue placeholder="설비 선택" /></SelectTrigger>
                <SelectContent>
                  {equipmentList.map((eq: any) => (
                    <SelectItem key={eq.id} value={String(eq.id)}>{eq.equipment_name} ({eq.location})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>기록일 *</Label>
              <Input type="date" value={newRecord.recordDate} onChange={(e) => setNewRecord(prev => ({ ...prev, recordDate: e.target.value }))} />
            </div>
            <div>
              <Label>측정 시간</Label>
              <Input type="time" value={newRecord.measurementTime} onChange={(e) => setNewRecord(prev => ({ ...prev, measurementTime: e.target.value }))} />
            </div>
            <div>
              <Label>제품명 *</Label>
              <Select
                value={newRecord.productName}
                onValueChange={(v) => setNewRecord(prev => ({ ...prev, productName: v }))}
              >
                <SelectTrigger><SelectValue placeholder="제품 선택" /></SelectTrigger>
                <SelectContent>
                  {products.map((p: any) => (
                    <SelectItem key={p.id} value={p.productName || p.product_name}>{p.productName || p.product_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* CCP-1B, CCP-3B: 가열 관련 */}
            {(selectedCcpType === "CCP-1B" || selectedCcpType === "CCP-3B") && (
              <>
                <div>
                  <Label>온도 (℃)</Label>
                  <Input type="text" value={newRecord.temperatureC} onChange={(e) => setNewRecord(prev => ({ ...prev, temperatureC: e.target.value }))} placeholder="예: 95.5" />
                </div>
                <div>
                  <Label>가열 시간 (분)</Label>
                  <Input type="number" value={newRecord.heatingTimeMin ?? ""} onChange={(e) => setNewRecord(prev => ({ ...prev, heatingTimeMin: e.target.value ? Number(e.target.value) : undefined }))} placeholder="예: 30" />
                </div>
                <div>
                  <Label>압력 (Mpa)</Label>
                  <Input type="text" value={newRecord.pressureMpa} onChange={(e) => setNewRecord(prev => ({ ...prev, pressureMpa: e.target.value }))} placeholder="예: 0.15" />
                </div>
              </>
            )}

            {/* CCP-2B: 냉각 관련 */}
            {selectedCcpType === "CCP-2B" && (
              <>
                <div>
                  <Label>가장자리 온도 (℃)</Label>
                  <Input type="text" value={newRecord.tempEdgeC} onChange={(e) => setNewRecord(prev => ({ ...prev, tempEdgeC: e.target.value }))} placeholder="예: 15.0" />
                </div>
                <div>
                  <Label>중심부 온도 (℃)</Label>
                  <Input type="text" value={newRecord.tempCenterC} onChange={(e) => setNewRecord(prev => ({ ...prev, tempCenterC: e.target.value }))} placeholder="예: 18.5" />
                </div>
              </>
            )}

            {/* CCP-4P: 금속검출 관련 */}
            {selectedCcpType === "CCP-4P" && (
              <>
                <div>
                  <Label>금속검출기 ID</Label>
                  <Input type="text" value={newRecord.metalDetectorId} onChange={(e) => setNewRecord(prev => ({ ...prev, metalDetectorId: e.target.value }))} />
                </div>
                <div>
                  <Label>감도 설정</Label>
                  <Input type="number" value={newRecord.sensitivitySetting ?? ""} onChange={(e) => setNewRecord(prev => ({ ...prev, sensitivitySetting: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div>
                  <Label>Fe 시험편 통과</Label>
                  <Select value={newRecord.feTestPiecePass} onValueChange={(v) => setNewRecord(prev => ({ ...prev, feTestPiecePass: v }))}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="적합">적합</SelectItem>
                      <SelectItem value="부적합">부적합</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>STS 시험편 통과</Label>
                  <Select value={newRecord.stsTestPiecePass} onValueChange={(v) => setNewRecord(prev => ({ ...prev, stsTestPiecePass: v }))}>
                    <SelectTrigger><SelectValue placeholder="선택" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="적합">적합</SelectItem>
                      <SelectItem value="부적합">부적합</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>통과 수량</Label>
                  <Input type="number" value={newRecord.passedQuantity ?? ""} onChange={(e) => setNewRecord(prev => ({ ...prev, passedQuantity: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
                <div>
                  <Label>검출 수량</Label>
                  <Input type="number" value={newRecord.detectedQuantity ?? ""} onChange={(e) => setNewRecord(prev => ({ ...prev, detectedQuantity: e.target.value ? Number(e.target.value) : undefined }))} />
                </div>
              </>
            )}

            <div>
              <Label>판정 *</Label>
              <Select value={newRecord.passFail} onValueChange={(v) => setNewRecord(prev => ({ ...prev, passFail: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="적합">적합</SelectItem>
                  <SelectItem value="부적합">부적합</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>이탈 내용</Label>
              <Input type="text" value={newRecord.deviationContent} onChange={(e) => setNewRecord(prev => ({ ...prev, deviationContent: e.target.value }))} placeholder="이탈 발생 시 내용 기록" />
            </div>
            <div className="md:col-span-2">
              <Label>개선 조치</Label>
              <Input type="text" value={newRecord.correctiveAction} onChange={(e) => setNewRecord(prev => ({ ...prev, correctiveAction: e.target.value }))} placeholder="개선 조치 내용" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewRecordDialog(false)}>취소</Button>
            <Button onClick={handleCreateRecord} disabled={createMutation.isPending}>
              {createMutation.isPending ? "저장 중..." : "저장"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
