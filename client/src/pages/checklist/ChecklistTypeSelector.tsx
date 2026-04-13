import { Link } from "wouter";
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import DashboardLayout from "@/components/dashboard/DashboardLayout";
import {
  Droplets,
  Wind,
  CheckCircle2,
  Users,
  Droplet,
  Wrench,
  AlertTriangle,
  Snowflake,
  Package,
  AlertCircle,
  FileEdit,
  Stethoscope,
  Sparkles,
  ClipboardCheck,
  Bug,
  Shield,
  Gauge,
} from "lucide-react";

interface ChecklistType {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  path: string;
  category: string;
}

const checklistTypes: ChecklistType[] = [
  {
    id: "water-quality-test",
    name: "수질 검사 기록",
    description: "용수의 수질 검사 결과를 기록합니다",
    icon: <Droplets className="w-8 h-8" />,
    path: "/quality/water-quality-tests/new",
    category: "품질",
  },
  {
    id: "air-compressor",
    name: "공기압축기 관리",
    description: "공기압축기의 점검 및 관리 기록",
    icon: <Wind className="w-8 h-8" />,
    path: "/quality/air-compressors/new",
    category: "시설",
  },
  {
    id: "validity-evaluation",
    name: "유효성 평가 기록",
    description: "HACCP 시스템의 유효성 평가 결과",
    icon: <CheckCircle2 className="w-8 h-8" />,
    path: "/quality/validity-evaluations/new",
    category: "품질",
  },
  {
    id: "personal-hygiene-check",
    name: "개인위생 점검표",
    description: "작업자의 개인위생 상태 점검",
    icon: <Users className="w-8 h-8" />,
    path: "/quality/personal-hygiene-checks/new",
    category: "위생",
  },
  {
    id: "water-usage-check",
    name: "용수 사용 점검표",
    description: "용수 사용 현황 및 관리 점검",
    icon: <Droplet className="w-8 h-8" />,
    path: "/quality/water-usage-checks/new",
    category: "시설",
  },
  {
    id: "equipment-cleaning-record",
    name: "설비 세척·소독 기록",
    description: "생산 설비의 세척 및 소독 이력",
    icon: <Wrench className="w-8 h-8" />,
    path: "/quality/equipment-cleaning-records/new",
    category: "시설",
  },
  {
    id: "foreign-material-record",
    name: "이물 관리 기록",
    description: "이물 발견 및 조치 사항 기록",
    icon: <AlertTriangle className="w-8 h-8" />,
    path: "/quality/foreign-material-records/new",
    category: "품질",
  },
  {
    id: "refrigeration-check",
    name: "냉동·냉장 설비 점검",
    description: "냉동·냉장 설비의 온도 및 상태 점검",
    icon: <Snowflake className="w-8 h-8" />,
    path: "/quality/refrigeration-checks/new",
    category: "시설",
  },
  {
    id: "packaging-storage-record",
    name: "포장재 보관 관리",
    description: "포장재의 입고 및 보관 관리 기록",
    icon: <Package className="w-8 h-8" />,
    path: "/quality/packaging-storage-records/new",
    category: "품질",
  },
  {
    id: "quality-issue-record",
    name: "품질 이상 발생 기록",
    description: "품질 이상 발생 시 원인 및 조치 기록",
    icon: <AlertCircle className="w-8 h-8" />,
    path: "/quality/quality-issue-records/new",
    category: "품질",
  },
  {
    id: "capa-record",
    name: "개선조치(CAPA) 기록",
    description: "시정 및 예방 조치 사항 기록",
    icon: <FileEdit className="w-8 h-8" />,
    path: "/quality/capa-records/new",
    category: "품질",
  },
  {
    id: "health-certificate",
    name: "보건증 관리",
    description: "작업자 보건증 등록 및 관리",
    icon: <Stethoscope className="w-8 h-8" />,
    path: "/health-certificates/new",
    category: "위생",
  },
  {
    id: "hygiene-checklist",
    name: "위생 점검",
    description: "시설 및 작업장 위생 상태 점검",
    icon: <Sparkles className="w-8 h-8" />,
    path: "/quality/hygiene-checklists/new",
    category: "위생",
  },
  {
    id: "pest-control-checklist",
    name: "방충·방서 관리",
    description: "해충 및 쥐 방제 활동 기록",
    icon: <Bug className="w-8 h-8" />,
    path: "/quality/pest-control-checklists/new",
    category: "위생",
  },
  {
    id: "calibration",
    name: "계측기 교정",
    description: "계측기 교정 및 검증 기록",
    icon: <Gauge className="w-8 h-8" />,
    path: "/quality/calibrations/new",
    category: "시설",
  },
];

export default function ChecklistTypeSelector() {
  const categories = ["전체", "품질", "위생", "시설"];
  const [selectedCategory, setSelectedCategory] = useState("전체");

  const filteredTypes =
    selectedCategory === "전체"
      ? checklistTypes
      : checklistTypes.filter((type) => type.category === selectedCategory);

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="space-y-6">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-purple-600 via-blue-600 to-purple-600 bg-clip-text text-transparent">
              체크리스트 유형 선택
            </h1>
            <p className="text-muted-foreground mt-2">
              작성할 체크리스트 유형을 선택해주세요
            </p>
          </div>

          {/* 카테고리 필터 */}
          <div className="flex gap-2">
            {categories.map((category) => (
              <Button
                key={category}
                variant={selectedCategory === category ? "default" : "outline"}
                onClick={() => setSelectedCategory(category)}
              >
                {category}
              </Button>
            ))}
          </div>

          {/* 체크리스트 유형 그리드 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTypes.map((type) => (
              <Link key={type.id} href={type.path}>
                <Card className="card-hover h-full cursor-pointer transition-all hover:shadow-lg hover:scale-105">
                  <CardHeader>
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-lg bg-primary/10 text-primary">
                        {type.icon}
                      </div>
                      <div>
                        <CardTitle className="text-lg">{type.name}</CardTitle>
                        <CardDescription className="text-xs">
                          {type.category}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      {type.description}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
