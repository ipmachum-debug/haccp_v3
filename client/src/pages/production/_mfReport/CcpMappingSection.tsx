/**
 * MfReportList 분해 — CCP 매핑 섹션 컴포넌트.
 * 제품별 CCP 타입 할당 + 한계기준 요약 표시.
 */
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";

export function CcpMappingSection({ productId, productName }: { productId: number; productName: string }) {
  const CCP_TYPES = [
    { value: "CCP-1B", label: "CCP-1B", description: "금속검출 (입고)" },
    { value: "CCP-2B", label: "CCP-2B", description: "금속검출 (포장 전)" },
    { value: "CCP-3B", label: "CCP-3B", description: "자외선 살균" },
    { value: "CCP-4P", label: "CCP-4P", description: "금속검출 (최종)" },
  ];

  const CCP_TYPE_COLORS: Record<string, string> = {
    "CCP-1B": "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
    "CCP-2B": "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
    "CCP-3B": "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
    "CCP-4P": "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200",
  };

  // 제품-CCP 매핑 정보 조회
  const { data: mappingData, refetch: refetchMappings } = trpc.ccpMonitoring.getProductCcpMappings.useQuery(
    { productId },
    { enabled: !!productId }
  );

  // 제품별 CCP 스펙 조회
  const { data: productSpecs } = trpc.ccpMonitoring.getProductCcpSpecs.useQuery(
    { productId },
    { enabled: !!productId }
  );

  // process_flags 업데이트
  const updateProcessFlagsMutation = trpc.ccpMonitoring.updateProductProcessFlags.useMutation({
    onSuccess: () => {
      toast.success("CCP 매핑이 저장되었습니다.");
      refetchMappings();
    },
    onError: (err: { message: string }) => toast.error(`저장 실패: ${err.message}`),
  });

  // 매핑 데이터에서 현재 제품 정보 추출
  const productMapping = Array.isArray(mappingData) ? (mappingData as any[]).find((m: any) => m.id === productId) : null;
  const processFlags = productMapping?.process_flags || "";

  // 현재 활성 CCP 타입 목록
  const activeCcpTypes: string[] = [];
  if (processFlags.includes("STEAMING")) activeCcpTypes.push("CCP-1B");
  if (processFlags.includes("MIXING") || processFlags.includes("STIRRING")) activeCcpTypes.push("CCP-2B");
  if (processFlags.includes("UV") || processFlags.includes("COOLING")) activeCcpTypes.push("CCP-3B");
  if (processFlags.includes("METAL_DETECTION")) activeCcpTypes.push("CCP-4P");

  // 스펙 찾기
  const getSpecForCcpType = (ccpType: string) => {
    if (!productSpecs || !Array.isArray(productSpecs)) return null;
    return productSpecs.find((s: any) => (s.ccpType || s.ccp_type) === ccpType) || null;
  };

  // CCP 타입 토글
  const [localCcpTypes, setLocalCcpTypes] = useState<string[]>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (!initialized && activeCcpTypes.length > 0) {
      setLocalCcpTypes(activeCcpTypes);
      setInitialized(true);
    } else if (!initialized && processFlags === "" && mappingData) {
      setInitialized(true);
    }
  }, [activeCcpTypes, initialized, processFlags, mappingData]);

  const handleToggle = (ccpType: string) => {
    setLocalCcpTypes((prev) =>
      prev.includes(ccpType) ? prev.filter((t) => t !== ccpType) : [...prev, ccpType]
    );
  };

  const handleSaveMapping = () => {
    const flagMap: Record<string, string> = {
      "CCP-1B": "STEAMING",
      "CCP-2B": "MIXING",
      "CCP-3B": "UV",
      "CCP-4P": "METAL_DETECTION",
    };
    const flags = localCcpTypes.map((t) => flagMap[t] || t).join(",");
    updateProcessFlagsMutation.mutate({ productId, processFlags: flags });
  };

  return (
    <div className="space-y-4">
      {/* CCP 타입 매핑 체크박스 */}
      <div className="grid grid-cols-2 gap-2">
        {CCP_TYPES.map((ccp) => {
          const isActive = localCcpTypes.includes(ccp.value);
          const spec = getSpecForCcpType(ccp.value);
          return (
            <div
              key={ccp.value}
              className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-all ${
                isActive ? "bg-primary/5 border-primary" : "hover:bg-accent/50"
              }`}
              onClick={() => handleToggle(ccp.value)}
            >
              <Checkbox checked={isActive} onCheckedChange={() => handleToggle(ccp.value)} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <Badge className={`${CCP_TYPE_COLORS[ccp.value]} text-[10px] px-1.5 py-0`}>{ccp.label}</Badge>
                  <span className="text-xs text-muted-foreground truncate">{ccp.description}</span>
                </div>
                {isActive && spec && (
                  <div className="text-[10px] text-muted-foreground mt-1">
                    {(spec.minTempC || spec.min_temp_c) && `온도: ${spec.minTempC || spec.min_temp_c}~${spec.maxTempC || spec.max_temp_c}°C`}
                    {(spec.feSensitivity || spec.fe_sensitivity) && `Fe: ${spec.feSensitivity || spec.fe_sensitivity} / SUS: ${spec.susSensitivity || spec.sus_sensitivity}`}
                    {!(spec.minTempC || spec.min_temp_c) && !(spec.feSensitivity || spec.fe_sensitivity) && "한계기준 설정됨"}
                  </div>
                )}
                {isActive && !spec && (
                  <div className="text-[10px] text-orange-500 mt-1">한계기준 미설정</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-end">
        <Button
          size="sm"
          onClick={handleSaveMapping}
          disabled={updateProcessFlagsMutation.isPending}
        >
          {updateProcessFlagsMutation.isPending ? (
            <><Loader2 className="mr-1 h-3 w-3 animate-spin" />저장 중...</>
          ) : (
            <><Save className="mr-1 h-3 w-3" />매핑 저장</>
          )}
        </Button>
      </div>

      {/* 한계기준 요약 테이블 */}
      {localCcpTypes.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-left p-1.5 font-medium">CCP</th>
                <th className="text-right p-1.5 font-medium">온도 (°C)</th>
                <th className="text-right p-1.5 font-medium">시간 (분)</th>
                <th className="text-right p-1.5 font-medium">압력 (bar)</th>
                <th className="text-right p-1.5 font-medium">감도 (Fe/SUS)</th>
              </tr>
            </thead>
            <tbody>
              {localCcpTypes.map((ccpType) => {
                const spec = getSpecForCcpType(ccpType);
                return (
                  <tr key={ccpType} className="border-b">
                    <td className="p-1.5">
                      <Badge className={`${CCP_TYPE_COLORS[ccpType]} text-[10px] px-1.5 py-0`}>{ccpType}</Badge>
                    </td>
                    <td className="p-1.5 text-right">
                      {spec && (spec.minTempC || spec.min_temp_c)
                        ? `${spec.minTempC || spec.min_temp_c} ~ ${spec.maxTempC || spec.max_temp_c}`
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-1.5 text-right">
                      {spec && (spec.minDurationMin || spec.min_duration_min)
                        ? `${spec.minDurationMin || spec.min_duration_min} ~ ${spec.maxDurationMin || spec.max_duration_min}`
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-1.5 text-right">
                      {spec && (spec.minPressureBar || spec.min_pressure_bar)
                        ? `${spec.minPressureBar || spec.min_pressure_bar} ~ ${spec.maxPressureBar || spec.max_pressure_bar}`
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                    <td className="p-1.5 text-right">
                      {spec && (spec.feSensitivity || spec.fe_sensitivity)
                        ? `${spec.feSensitivity || spec.fe_sensitivity} / ${spec.susSensitivity || spec.sus_sensitivity}`
                        : <span className="text-muted-foreground">-</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[10px] text-muted-foreground">
        한계기준 상세 설정은 마스터 데이터 &gt; 제품-CCP 매핑 탭에서 관리할 수 있습니다.
      </p>
    </div>
  );
}
