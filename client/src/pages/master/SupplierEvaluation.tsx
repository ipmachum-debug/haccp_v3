import { useState } from "react";
import { useRoute } from "wouter";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { Star, TrendingUp, TrendingDown, Minus, Plus } from "lucide-react";
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

import { todayLocal } from "../../lib/dateUtils";

export default function SupplierEvaluation() {
  const [, params] = useRoute("/dashboard/suppliers/:id/evaluations");
  const supplierId = params?.id ? parseInt(params.id) : 0;

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [evaluationDate, setEvaluationDate] = useState(todayLocal());
  const [qualityScore, setQualityScore] = useState(3);
  const [deliveryScore, setDeliveryScore] = useState(3);
  const [priceScore, setPriceScore] = useState(3);
  const [serviceScore, setServiceScore] = useState(3);
  const [responseScore, setResponseScore] = useState(3);
  const [comments, setComments] = useState("");
  const [strengths, setStrengths] = useState("");
  const [weaknesses, setWeaknesses] = useState("");
  const [recommendations, setRecommendations] = useState("");

  // 거래처 정보 조회
  const { data: supplier } = trpc.supplier.getById.useQuery({ id: supplierId });

  // 평가 목록 조회
  const { data: evaluations, refetch } = trpc.supplierEvaluation.list.useQuery({ supplierId });

  // 평가 통계 조회
  const { data: stats } = trpc.supplierEvaluation.getStats.useQuery({ supplierId });

  // 평가 생성
  const createMutation = trpc.supplierEvaluation.create.useMutation({
    onSuccess: () => {
      alert("평가가 등록되었습니다.");
      setIsDialogOpen(false);
      resetForm();
      refetch();
    },
    onError: (error: any) => {
      alert(`평가 등록 실패: ${error.message}`);
    },
  });

  const resetForm = () => {
    setEvaluationDate(todayLocal());
    setQualityScore(3);
    setDeliveryScore(3);
    setPriceScore(3);
    setServiceScore(3);
    setResponseScore(3);
    setComments("");
    setStrengths("");
    setWeaknesses("");
    setRecommendations("");
  };

  const handleSubmit = (e: any) => {
    e.preventDefault();
    createMutation.mutate({
      supplierId,
      evaluationDate,
      qualityScore,
      deliveryScore,
      priceScore,
      serviceScore,
      responseScore,
      comments,
      strengths,
      weaknesses,
      recommendations,
    });
  };

  // 레이더 차트 데이터
  const radarData = stats
    ? [
        { subject: "품질", score: Number(stats.avgQuality), fullMark: 5 },
        { subject: "납기", score: Number(stats.avgDelivery), fullMark: 5 },
        { subject: "가격", score: Number(stats.avgPrice), fullMark: 5 },
        { subject: "서비스", score: Number(stats.avgService), fullMark: 5 },
        { subject: "대응", score: Number(stats.avgResponse), fullMark: 5 },
      ]
    : [];

  // 평가 추이 차트 데이터
  const trendData = evaluations
    ? evaluations.slice(0, 10).reverse().map((e: any) => ({
        date: format(new Date(e.evaluationDate), "MM/dd", { locale: ko }),
        품질: e.qualityScore,
        납기: e.deliveryScore,
        가격: e.priceScore,
        서비스: e.serviceScore,
        대응: e.responseScore,
      }))
    : [];

  const ScoreInput = ({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) => (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.max(1, value - 1))}
        >
          <Minus className="h-4 w-4" />
        </Button>
        <div className="flex-1 text-center">
          <div className="text-2xl font-bold">{value}</div>
          <div className="flex justify-center gap-1 mt-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={`h-4 w-4 ${i <= value ? "fill-yellow-400 text-yellow-400" : "text-gray-300"}`}
              />
            ))}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => onChange(Math.min(5, value + 1))}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">거래처 평가</h1>
            <p className="text-muted-foreground mt-2">
              {supplier?.supplierName || "거래처"} 평가 및 통계
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button size="lg">
                <Plus className="mr-2 h-4 w-4" />
                평가 등록
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>거래처 평가 등록</DialogTitle>
                <DialogDescription>
                  {supplier?.supplierName}에 대한 평가를 등록합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="evaluationDate">평가 날짜</Label>
                  <Input
                    id="evaluationDate"
                    type="date"
                    value={evaluationDate}
                    onChange={(e) => setEvaluationDate(e.target.value)}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <ScoreInput label="품질" value={qualityScore} onChange={setQualityScore} />
                  <ScoreInput label="납기" value={deliveryScore} onChange={setDeliveryScore} />
                  <ScoreInput label="가격" value={priceScore} onChange={setPriceScore} />
                  <ScoreInput label="서비스" value={serviceScore} onChange={setServiceScore} />
                  <ScoreInput label="대응" value={responseScore} onChange={setResponseScore} />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="comments">종합 의견</Label>
                  <Textarea
                    id="comments"
                    placeholder="종합 의견을 입력하세요..."
                    value={comments}
                    onChange={(e) => setComments(e.target.value)}
                    rows={3}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="strengths">강점</Label>
                  <Textarea
                    id="strengths"
                    placeholder="거래처의 강점을 입력하세요..."
                    value={strengths}
                    onChange={(e) => setStrengths(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="weaknesses">약점</Label>
                  <Textarea
                    id="weaknesses"
                    placeholder="거래처의 약점을 입력하세요..."
                    value={weaknesses}
                    onChange={(e) => setWeaknesses(e.target.value)}
                    rows={2}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="recommendations">개선 권장사항</Label>
                  <Textarea
                    id="recommendations"
                    placeholder="개선이 필요한 사항을 입력하세요..."
                    value={recommendations}
                    onChange={(e) => setRecommendations(e.target.value)}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                  취소
                </Button>
                <Button onClick={handleSubmit} disabled={createMutation.isPending}>
                  등록
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* 평가 통계 */}
        {stats && (
          <div className="grid gap-4 md:grid-cols-2">
            {/* 레이더 차트 */}
            <Card>
              <CardHeader>
                <CardTitle>평가 항목별 평균</CardTitle>
                <CardDescription>
                  총 {stats.totalEvaluations}회 평가 | 평균 {stats.avgOverall}점
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={radarData}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="subject" />
                    <PolarRadiusAxis angle={90} domain={[0, 5]} />
                    <Radar
                      name="평균 점수"
                      dataKey="score"
                      stroke="#3b82f6"
                      fill="#3b82f6"
                      fillOpacity={0.6}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 평가 추이 차트 */}
            <Card>
              <CardHeader>
                <CardTitle>평가 추이</CardTitle>
                <CardDescription>최근 10회 평가 점수 변화</CardDescription>
              </CardHeader>
              <CardContent>
                {trendData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" />
                      <YAxis domain={[0, 5]} />
                      <Tooltip />
                      <Legend />
                      <Line type="monotone" dataKey="품질" stroke="#10b981" />
                      <Line type="monotone" dataKey="납기" stroke="#3b82f6" />
                      <Line type="monotone" dataKey="가격" stroke="#f59e0b" />
                      <Line type="monotone" dataKey="서비스" stroke="#8b5cf6" />
                      <Line type="monotone" dataKey="대응" stroke="#ef4444" />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">평가 데이터가 없습니다</div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* 평가 이력 */}
        <Card>
          <CardHeader>
            <CardTitle>평가 이력</CardTitle>
            <CardDescription>거래처에 대한 평가 기록</CardDescription>
          </CardHeader>
          <CardContent>
            {evaluations && evaluations.length > 0 ? (
              <div className="space-y-4">
                {evaluations?.map((evaluation: any) => (                  <div key={evaluation.id} className="p-4 rounded-lg border">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <div className="font-medium">
                          {format(new Date(evaluation.evaluationDate), "yyyy년 MM월 dd일", {
                            locale: ko,
                          })}
                        </div>
                        <div className="text-sm text-muted-foreground">
                          평균 점수: {evaluation.overallScore}점
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Star
                            key={i}
                            className={`h-5 w-5 ${
                              i <= Number(evaluation.overallScore)
                                ? "fill-yellow-400 text-yellow-400"
                                : "text-gray-300"
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-5 gap-2 mb-3">
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">품질</div>
                        <div className="text-lg font-bold">{evaluation.qualityScore}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">납기</div>
                        <div className="text-lg font-bold">{evaluation.deliveryScore}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">가격</div>
                        <div className="text-lg font-bold">{evaluation.priceScore}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">서비스</div>
                        <div className="text-lg font-bold">{evaluation.serviceScore}</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xs text-muted-foreground">대응</div>
                        <div className="text-lg font-bold">{evaluation.responseScore}</div>
                      </div>
                    </div>
                    {evaluation.comments && (
                      <div className="text-sm text-muted-foreground mb-2">
                        <strong>종합 의견:</strong> {evaluation.comments}
                      </div>
                    )}
                    {evaluation.strengths && (
                      <div className="text-sm text-muted-foreground mb-2">
                        <strong>강점:</strong> {evaluation.strengths}
                      </div>
                    )}
                    {evaluation.weaknesses && (
                      <div className="text-sm text-muted-foreground mb-2">
                        <strong>약점:</strong> {evaluation.weaknesses}
                      </div>
                    )}
                    {evaluation.recommendations && (
                      <div className="text-sm text-muted-foreground">
                        <strong>개선 권장사항:</strong> {evaluation.recommendations}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">평가 이력이 없습니다.</div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
