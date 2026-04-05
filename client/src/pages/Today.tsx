import { useState } from "react";
import { useTabWithUrl } from "@/hooks/useTabWithUrl";
import DashboardLayout from "@/components/DashboardLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsTrigger } from "@/components/ui/tabs"
import { TabsList } from "@/components/ui/tabs";
import { Link } from "wouter";
import { 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  Package, 
  ClipboardCheck,
  FileCheck,
  AlertTriangle,
  BookOpen
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

export default function Today() {
  const [activeTab, setActiveTab] = useTabWithUrl('tab', 'batches');
  const today = new Date();
  const todayStr = format(today, "yyyy-MM-dd");

  // 배치 조회 (오늘 생성된 배치만 필터링)
  const { data: batchesData, isLoading: batchesLoading } = trpc.batch.list.useQuery({});
  
  const todayBatches = (batchesData?.items || []).filter((batch: any) => {
    const batchDate = new Date(batch.createdAt);
    return batchDate.toDateString() === today.toDateString();
  });

  // 오늘 교육 미완료 수
  const { data: trainingIncomplete } = trpc.dailyTraining.getIncompleteCount.useQuery();

  // 오늘 미완료 CCP 조회
  const { data: pendingCcps, isLoading: ccpsLoading } = trpc.ccp.getAllRecords.useQuery({
    status: "draft",
  });

  // 통계 계산
  const stats = {
    totalBatches: todayBatches?.length || 0,
    inProgressBatches: todayBatches?.filter((b: any) => b.status === "in_progress").length || 0,
    pendingCcps: pendingCcps?.length || 0,
    failedItems: 0, // TODO: 실패/이탈 항목 조회
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* 헤더 */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Today</h1>
          <p className="text-muted-foreground">
            {format(today, "yyyy년 M월 d일 EEEE", { locale: ko })} - 오늘 해야 할 업무를 확인하세요
          </p>
        </div>

        {/* 주요 지표 */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">오늘 배치</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.totalBatches}</div>
              <p className="text-xs text-muted-foreground">
                진행 중: {stats.inProgressBatches}건
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">미완료 CCP</CardTitle>
              <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingCcps}</div>
              <p className="text-xs text-muted-foreground">
                점검 필요
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">미완료 검사</CardTitle>
              <FileCheck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">0</div>
              <p className="text-xs text-muted-foreground">
                검사 대기 중
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">이탈/실패</CardTitle>
              <AlertTriangle className="h-4 w-4 text-destructive" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-destructive">{stats.failedItems}</div>
              <p className="text-xs text-muted-foreground">
                시정 조치 필요
              </p>
            </CardContent>
          </Card>

          <Card className={trainingIncomplete?.count ? "border-violet-200 bg-violet-50/30" : ""}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">교육 미완료</CardTitle>
              <BookOpen className="h-4 w-4 text-violet-500" />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${trainingIncomplete?.count ? "text-violet-600" : ""}`}>
                {trainingIncomplete?.assigned ? trainingIncomplete.count : "-"}
              </div>
              <p className="text-xs text-muted-foreground">
                {trainingIncomplete?.assigned ? `전체 ${trainingIncomplete.total}명 중` : "오늘 배정 없음"}
              </p>
            </CardContent>
          </Card>
        </div>

        {/* 업무 목록 탭 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="batches">
              <Package className="h-4 w-4 mr-2" />
              배치 ({stats.totalBatches})
            </TabsTrigger>
            <TabsTrigger value="ccps">
              <ClipboardCheck className="h-4 w-4 mr-2" />
              CCP ({stats.pendingCcps})
            </TabsTrigger>
            <TabsTrigger value="inspections">
              <FileCheck className="h-4 w-4 mr-2" />
              검사 (0)
            </TabsTrigger>
            <TabsTrigger value="failures">
              <AlertTriangle className="h-4 w-4 mr-2" />
              이탈/실패 (0)
            </TabsTrigger>
          </TabsList>

          {/* 오늘 배치 */}
          <TabsContent value="batches" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>오늘 생성된 배치</CardTitle>
                <CardDescription>
                  오늘 생성되었거나 진행 중인 배치 목록입니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                {batchesLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </div>
                ) : todayBatches && todayBatches.length > 0 ? (
                  <div className="space-y-4">
                    {todayBatches.map((batch: any) => (
                      <Link key={batch.id} href={`/dashboard/batch/${batch.id}`}>
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">{batch.batchNumber}</span>
                              <Badge variant={
                                batch.status === "completed" ? "default" :
                                batch.status === "in_progress" ? "secondary" :
                                batch.status === "under_review" ? "outline" :
                                "destructive"
                              }>
                                {batch.status === "completed" ? "완료" :
                                 batch.status === "in_progress" ? "진행 중" :
                                 batch.status === "under_review" ? "검토 중" :
                                 batch.status === "approved" ? "승인됨" :
                                 "계획"}
                              </Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {batch.productName} • {batch.quantity}개
                            </p>
                          </div>
                          <div className="text-sm text-muted-foreground">
                            {format(new Date(batch.createdAt), "HH:mm")}
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>오늘 생성된 배치가 없습니다</p>
                    <Link href="/dashboard/batch-management?tab=create">
                      <Button className="mt-4" variant="outline">
                        새 배치 만들기
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 미완료 CCP */}
          <TabsContent value="ccps" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>미완료 CCP 점검</CardTitle>
                <CardDescription>
                  제출되지 않은 CCP 점검 기록입니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                {ccpsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    로딩 중...
                  </div>
                ) : pendingCcps && pendingCcps.length > 0 ? (
                  <div className="space-y-4">
                    {pendingCcps.map((ccp: any) => (
                      <Link key={ccp.id} href={`/dashboard/ccp/${ccp.id}`}>
                        <div className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent cursor-pointer transition-colors">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium">CCP 점검</span>
                              <Badge variant="outline">임시 저장</Badge>
                            </div>
                            <p className="text-sm text-muted-foreground">
                              배치: {ccp.batchCode || "N/A"}
                            </p>
                          </div>
                          <Clock className="h-4 w-4 text-muted-foreground" />
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50 text-green-500" />
                    <p>미완료 CCP 점검이 없습니다</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 미완료 검사 */}
          <TabsContent value="inspections" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>미완료 검사</CardTitle>
                <CardDescription>
                  완료되지 않은 검사 항목입니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50 text-green-500" />
                  <p>미완료 검사가 없습니다</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 이탈/실패 */}
          <TabsContent value="failures" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>이탈 및 실패 항목</CardTitle>
                <CardDescription>
                  시정 조치가 필요한 항목입니다
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50 text-green-500" />
                  <p>이탈/실패 항목이 없습니다</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
