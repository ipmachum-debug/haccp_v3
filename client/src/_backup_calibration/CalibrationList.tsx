import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Plus, Search, Calendar, FileText, CheckCircle, Clock, XCircle, AlertCircle } from "lucide-react";
import { format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";

export default function CalibrationList() {
  const [, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState("");

  // 검교정 설비 목록 조회
  const { data: equipmentList = [], isLoading: equipmentLoading } = trpc.calibration.listEquipment.useQuery({
    isActive: true,
  });

  // 검교정 기록 목록 조회
  const { data: recordsList = [], isLoading: recordsLoading } = trpc.calibration.listRecords.useQuery({});

  // 검색 필터링
  const filteredEquipment = equipmentList.filter((eq) =>
    eq.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    eq.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // D-day 계산
  const calculateDday = (nextDate: Date | string) => {
    const today = new Date();
    const targetDate = new Date(nextDate);
    const diff = differenceInDays(targetDate, today);
    return diff;
  };

  // 상태 뱃지 컴포넌트
  const StatusBadge = ({ status }: { status: string }) => {
    const statusConfig = {
      draft: { label: "임시저장", color: "bg-gray-100 text-gray-800", icon: FileText },
      pending_review: { label: "검토중", color: "bg-yellow-100 text-yellow-800", icon: Clock },
      approved: { label: "승인완료", color: "bg-green-100 text-green-800", icon: CheckCircle },
      rejected: { label: "반려", color: "bg-red-100 text-red-800", icon: XCircle },
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.draft;
    const Icon = config.icon;

    return (
      <Badge className={config.color}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  // D-day 뱃지 컴포넌트
  const DdayBadge = ({ dday }: { dday: number }) => {
    if (dday < 0) {
      return (
        <Badge className="bg-red-100 text-red-800">
          <AlertCircle className="w-3 h-3 mr-1" />
          기간초과 ({Math.abs(dday)}일)
        </Badge>
      );
    } else if (dday <= 7) {
      return (
        <Badge className="bg-orange-100 text-orange-800">
          <Clock className="w-3 h-3 mr-1" />
          D-{dday}
        </Badge>
      );
    } else {
      return (
        <Badge className="bg-blue-100 text-blue-800">
          <Calendar className="w-3 h-3 mr-1" />
          D-{dday}
        </Badge>
      );
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">검교정 관리</h1>
        <p className="text-muted-foreground">
          검교정 설비를 등록하고 자체 검교정 일지를 작성하세요
        </p>
      </div>

      {/* 검색 및 등록 */}
      <div className="flex gap-4 mb-6">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
          <Input
            placeholder="설비명 또는 코드로 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button onClick={() => setLocation("/calibration/equipment/new")}>
          <Plus className="w-4 h-4 mr-2" />
          설비 등록
        </Button>
      </div>

      {/* 검교정 일정 대시보드 */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>검교정 일정 현황</CardTitle>
          <CardDescription>다음 검교정 예정일을 확인하세요</CardDescription>
        </CardHeader>
        <CardContent>
          {equipmentLoading ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : filteredEquipment.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              등록된 검교정 설비가 없습니다
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>설비코드</TableHead>
                  <TableHead>설비명</TableHead>
                  <TableHead>검교정 유형</TableHead>
                  <TableHead>최근 검교정일</TableHead>
                  <TableHead>다음 검교정일</TableHead>
                  <TableHead>D-day</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredEquipment.map((equipment) => {
                  // 해당 설비의 최근 검교정 기록 찾기
                  const latestRecord = recordsList
                    .filter((r) => r.equipmentId === equipment.id)
                    .sort((a, b) => new Date(b.calibrationDate).getTime() - new Date(a.calibrationDate).getTime())[0];

                  const dday = latestRecord ? calculateDday(latestRecord.nextCalibrationDate) : null;

                  return (
                    <TableRow key={equipment.id}>
                      <TableCell className="font-mono">{equipment.code}</TableCell>
                      <TableCell className="font-medium">{equipment.name}</TableCell>
                      <TableCell>
                        <Badge variant={equipment.calibrationType === "certified" ? "default" : "secondary"}>
                          {equipment.calibrationType === "certified" ? "공인기관" : "자체검교정"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {latestRecord ? (
                          format(new Date(latestRecord.calibrationDate), "yyyy-MM-dd", { locale: ko })
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {latestRecord ? (
                          format(new Date(latestRecord.nextCalibrationDate), "yyyy-MM-dd", { locale: ko })
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {dday !== null ? <DdayBadge dday={dday} /> : <span className="text-muted-foreground">-</span>}
                      </TableCell>
                      <TableCell>
                        {latestRecord ? (
                          <StatusBadge status={latestRecord.approvalStatus || "draft"} />
                        ) : (
                          <Badge className="bg-gray-100 text-gray-800">미작성</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setLocation(`/calibration/new?equipmentId=${equipment.id}`)}
                        >
                          <Plus className="w-4 h-4 mr-1" />
                          일지 작성
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 검교정 기록 목록 */}
      <Card>
        <CardHeader>
          <CardTitle>검교정 기록 목록</CardTitle>
          <CardDescription>작성된 검교정 일지를 확인하세요</CardDescription>
        </CardHeader>
        <CardContent>
          {recordsLoading ? (
            <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
          ) : recordsList.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              작성된 검교정 기록이 없습니다
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>설비명</TableHead>
                  <TableHead>검교정일</TableHead>
                  <TableHead>다음 검교정일</TableHead>
                  <TableHead>상태</TableHead>
                  <TableHead className="text-right">작업</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordsList.map((record) => (
                  <TableRow key={record.id}>
                    <TableCell className="font-medium">{record.equipmentName || record.equipment?.name}</TableCell>
                    <TableCell>{format(new Date(record.calibrationDate), "yyyy-MM-dd", { locale: ko })}</TableCell>
                    <TableCell>{format(new Date(record.nextCalibrationDate), "yyyy-MM-dd", { locale: ko })}</TableCell>
                    <TableCell>
                      <StatusBadge status={record.approvalStatus || "draft"} />
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/calibration/${record.id}`)}
                      >
                        상세보기
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setLocation(`/calibration/${record.id}/edit`)}
                      >
                        수정
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
