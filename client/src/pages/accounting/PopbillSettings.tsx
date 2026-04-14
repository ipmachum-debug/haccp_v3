/**
 * 팝빌 (Popbill) 설정 컴포넌트 — Phase C Part 2 UI (2026-04-14)
 * ═══════════════════════════════════════════════════════════════
 * - 세금계산서 페이지에서 모달 형태로 열림 (독립 페이지 X)
 * - 테넌트별 팝빌 연동 설정 (CorpNum, 활성화, 테스트/운영)
 * - 팝빌 회원 등록 (RegistContact)
 * - 잔여 포인트 조회
 * - STUB 모드 안내
 * ═══════════════════════════════════════════════════════════════
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  RefreshCw,
  UserPlus,
  CheckCircle2,
  Save,
  Coins,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

export default function PopbillSettingsContent() {
  const [corpNum, setCorpNum] = useState("");
  const [userId, setUserId] = useState("");
  const [isEnabled, setIsEnabled] = useState(false);
  const [isTestMode, setIsTestMode] = useState(true);
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");

  // 회원 등록용
  const [regCorpName, setRegCorpName] = useState("");
  const [regCeoName, setRegCeoName] = useState("");
  const [regAddr, setRegAddr] = useState("");
  const [regBizType, setRegBizType] = useState("");
  const [regBizClass, setRegBizClass] = useState("");

  const utils = trpc.useUtils();

  // 현재 설정 조회
  const { data: settingsData } = trpc.popbillSettings.get.useQuery();
  const mode = settingsData?.mode ?? "stub";
  const isStubMode = mode === "stub";

  // 기존 설정 로드
  useEffect(() => {
    const s = settingsData?.settings;
    if (s) {
      setCorpNum(s.corpNum || "");
      setUserId(s.userId || "");
      setIsEnabled(Boolean(s.isEnabled));
      setIsTestMode(Boolean(s.isTestMode));
      setContactName(s.contactName || "");
      setContactEmail(s.contactEmail || "");
      setContactPhone(s.contactPhone || "");
      setNotes(s.notes || "");
    }
  }, [settingsData]);

  const upsertMutation = trpc.popbillSettings.upsert.useMutation({
    onSuccess: (res: any) => {
      toast({ title: "저장 완료", description: res.message });
      utils.popbillSettings.get.invalidate();
    },
    onError: (e: any) =>
      toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  const registMutation = trpc.popbillSettings.registMember.useMutation({
    onSuccess: (res: any) => {
      toast({
        title: res.alreadyMember ? "이미 가입됨" : "회원 등록 완료",
        description: res.message,
      });
      utils.popbillSettings.get.invalidate();
    },
    onError: (e: any) =>
      toast({ title: "회원 등록 실패", description: e.message, variant: "destructive" }),
  });

  const refreshBalanceMutation = trpc.popbillSettings.refreshBalance.useMutation({
    onSuccess: (res: any) => {
      toast({
        title: "포인트 조회 완료",
        description: `잔여: ${Number(res.remainPoint).toLocaleString()}P`,
      });
      utils.popbillSettings.get.invalidate();
    },
    onError: (e: any) =>
      toast({ title: "포인트 조회 실패", description: e.message, variant: "destructive" }),
  });

  const handleSave = () => {
    if (!corpNum || corpNum.replace(/-/g, "").length < 10) {
      toast({
        title: "사업자번호 필수",
        description: "10자리 사업자번호를 입력하세요.",
        variant: "destructive",
      });
      return;
    }
    upsertMutation.mutate({
      corpNum,
      userId: userId || undefined,
      isEnabled,
      isTestMode,
      contactName: contactName || undefined,
      contactEmail: contactEmail || undefined,
      contactPhone: contactPhone || undefined,
      notes: notes || undefined,
    });
  };

  const handleRegist = () => {
    if (!regCorpName) {
      toast({ title: "상호를 입력하세요", variant: "destructive" });
      return;
    }
    registMutation.mutate({
      corpName: regCorpName,
      ceoName: regCeoName || undefined,
      addr: regAddr || undefined,
      bizType: regBizType || undefined,
      bizClass: regBizClass || undefined,
    });
  };

  const s = settingsData?.settings;
  const isMember = Boolean(s?.isMember);
  const balance = Number(s?.balanceCached || 0);

  return (
    <div className="space-y-4">
      {/* STUB 모드 배너 */}
      {isStubMode && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="py-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-700 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-900 space-y-1">
              <div>
                <strong>현재 STUB 모드</strong> — 환경변수가 설정되지 않아 팝빌 호출이
                가짜 응답을 반환합니다.
              </div>
              <div>
                운영 모드 활성화:{" "}
                <code className="bg-amber-100 px-1 rounded">POPBILL_LINK_ID</code>,{" "}
                <code className="bg-amber-100 px-1 rounded">POPBILL_SECRET_KEY</code>,{" "}
                <code className="bg-amber-100 px-1 rounded">POPBILL_IS_TEST</code>{" "}
                환경변수를 설정하고 서버를 재시작하세요.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 모드 / 회원 / 포인트 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">연동 모드</div>
            <div className="text-lg font-bold flex items-center gap-2 mt-1">
              {isStubMode ? (
                <Badge className="bg-amber-500 text-white">STUB (개발)</Badge>
              ) : (
                <Badge className="bg-emerald-600 text-white">LIVE (운영)</Badge>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground">회원 상태</div>
            <div className="text-lg font-bold flex items-center gap-2 mt-1">
              {isMember ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                  <span className="text-emerald-600">가입 완료</span>
                </>
              ) : (
                <span className="text-muted-foreground">미가입</span>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Coins className="h-3 w-3" /> 잔여 포인트
            </div>
            <div className="text-lg font-bold flex items-center gap-2 mt-1">
              {balance.toLocaleString()}P
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0"
                onClick={() => refreshBalanceMutation.mutate()}
                disabled={refreshBalanceMutation.isPending}
              >
                <RefreshCw className="h-3 w-3" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 기본 설정 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">기본 설정</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>사업자번호 * (10자리)</Label>
              <Input
                value={corpNum}
                onChange={(e) => setCorpNum(e.target.value)}
                placeholder="000-00-00000 또는 0000000000"
              />
            </div>
            <div>
              <Label>팝빌 ID (선택)</Label>
              <Input
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="팝빌 가입 ID (있으면)"
              />
            </div>
          </div>

          <div className="flex gap-6 py-2">
            <div className="flex items-center gap-2">
              <Switch checked={isEnabled} onCheckedChange={setIsEnabled} />
              <Label>연동 활성화</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={isTestMode} onCheckedChange={setIsTestMode} />
              <Label>테스트 모드 (OFF = 운영)</Label>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>담당자 이름</Label>
              <Input
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
            <div>
              <Label>담당자 이메일</Label>
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div>
              <Label>담당자 전화</Label>
              <Input
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>메모</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex justify-end">
            <Button
              onClick={handleSave}
              disabled={upsertMutation.isPending}
              className="bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700"
            >
              <Save className="h-4 w-4 mr-1" />
              {upsertMutation.isPending ? "저장 중..." : "설정 저장"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 팝빌 회원 등록 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" />
            팝빌 회원 등록
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            먼저 [기본 설정]에서 사업자번호를 저장한 뒤 등록하세요.
            {isMember && " (이미 가입되어 있습니다)"}
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>상호 *</Label>
              <Input
                value={regCorpName}
                onChange={(e) => setRegCorpName(e.target.value)}
                placeholder="(주)회사명"
              />
            </div>
            <div>
              <Label>대표자</Label>
              <Input
                value={regCeoName}
                onChange={(e) => setRegCeoName(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label>사업장 주소</Label>
              <Input value={regAddr} onChange={(e) => setRegAddr(e.target.value)} />
            </div>
            <div>
              <Label>업태</Label>
              <Input
                value={regBizType}
                onChange={(e) => setRegBizType(e.target.value)}
                placeholder="제조업, 서비스업 등"
              />
            </div>
            <div>
              <Label>종목</Label>
              <Input
                value={regBizClass}
                onChange={(e) => setRegBizClass(e.target.value)}
                placeholder="식품 제조 등"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              variant="outline"
              onClick={handleRegist}
              disabled={registMutation.isPending || !corpNum}
              className="border-blue-300 text-blue-700 hover:bg-blue-50"
            >
              <UserPlus className="h-4 w-4 mr-1" />
              {registMutation.isPending ? "등록 중..." : "팝빌 회원 등록"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
