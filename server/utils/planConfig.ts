/**
 * SaaS 플랜 설정 + 기능 게이팅
 *
 * 플랜별 제한/허용 기능을 중앙에서 관리.
 * 미들웨어, 라우터, 프론트에서 이 설정을 참조.
 */

export type PlanType = "starter" | "standard" | "enterprise";

export interface PlanLimits {
  /** 플랜 이름 */
  name: string;
  /** 월 요금 (부가세 별도, 원) */
  monthlyPrice: number;
  /** 연 요금 (부가세 별도, 원) */
  yearlyPrice: number;
  /** 최대 사용자 수 */
  maxUsers: number;
  /** 최대 제품 등록 수 */
  maxProducts: number;
  /** 월 최대 배치 수 */
  maxBatchesPerMonth: number;
  /** 최대 사이트(공장) 수 */
  maxSites: number;
  /** 데이터 보관 기간 (일) */
  dataRetentionDays: number;
  /** 허용 기능 */
  features: {
    accounting: boolean;
    aiAssistant: boolean;
    documentPdf: boolean;
    customPdf: boolean;
    apiIntegration: boolean;
    excelExport: boolean;
    financialReports: boolean;
    autoBackup: boolean;
  };
}

export const PLAN_CONFIG: Record<PlanType, PlanLimits> = {
  starter: {
    name: "Starter",
    monthlyPrice: 99000,
    yearlyPrice: 990000,
    maxUsers: 3,
    maxProducts: 20,
    maxBatchesPerMonth: 50,
    maxSites: 1,
    dataRetentionDays: 365,
    features: {
      accounting: false,
      aiAssistant: false,
      documentPdf: true,
      customPdf: false,
      apiIntegration: false,
      excelExport: true,
      financialReports: false,
      autoBackup: false,
    },
  },

  standard: {
    name: "Standard",
    monthlyPrice: 199000,
    yearlyPrice: 1990000,
    maxUsers: 10,
    maxProducts: 100,
    maxBatchesPerMonth: 300,
    maxSites: 1,
    dataRetentionDays: 1095, // 3년
    features: {
      accounting: true,
      aiAssistant: true,
      documentPdf: true,
      customPdf: false,
      apiIntegration: false,
      excelExport: true,
      financialReports: true,
      autoBackup: true,
    },
  },

  enterprise: {
    name: "Enterprise",
    monthlyPrice: 299000,
    yearlyPrice: 2990000,
    maxUsers: Infinity,
    maxProducts: Infinity,
    maxBatchesPerMonth: Infinity,
    maxSites: 5,
    dataRetentionDays: Infinity,
    features: {
      accounting: true,
      aiAssistant: true,
      documentPdf: true,
      customPdf: true,
      apiIntegration: true,
      excelExport: true,
      financialReports: true,
      autoBackup: true,
    },
  },
};

/**
 * 테넌트 플랜 제한 체크
 * @throws Error if limit exceeded
 */
export function checkPlanLimit(
  plan: string,
  limitType: "users" | "products" | "batches" | "sites",
  currentCount: number
): { allowed: boolean; limit: number; message: string } {
  const config = PLAN_CONFIG[plan as PlanType] || PLAN_CONFIG.starter;

  const limitMap = {
    users: { limit: config.maxUsers, label: "사용자" },
    products: { limit: config.maxProducts, label: "제품" },
    batches: { limit: config.maxBatchesPerMonth, label: "월 배치" },
    sites: { limit: config.maxSites, label: "사이트" },
  };

  const { limit, label } = limitMap[limitType];

  if (currentCount >= limit) {
    return {
      allowed: false,
      limit,
      message: `${label} 수 제한에 도달했습니다 (${config.name} 플랜: 최대 ${limit === Infinity ? "무제한" : limit}${label === "사용자" ? "명" : "개"}). 플랜을 업그레이드해주세요.`,
    };
  }

  return { allowed: true, limit, message: "" };
}

/**
 * 테넌트 플랜의 기능 허용 여부 체크
 */
export function checkPlanFeature(
  plan: string,
  feature: keyof PlanLimits["features"]
): { allowed: boolean; message: string } {
  const config = PLAN_CONFIG[plan as PlanType] || PLAN_CONFIG.starter;

  if (!config.features[feature]) {
    return {
      allowed: false,
      message: `${config.name} 플랜에서는 이 기능을 사용할 수 없습니다. Standard 이상 플랜으로 업그레이드해주세요.`,
    };
  }

  return { allowed: true, message: "" };
}

/**
 * 플랜 비교 정보 (프론트 가격표용)
 */
export function getPlanComparison() {
  return Object.entries(PLAN_CONFIG).map(([key, config]) => ({
    id: key,
    name: config.name,
    monthlyPrice: config.monthlyPrice,
    yearlyPrice: config.yearlyPrice,
    maxUsers: config.maxUsers === Infinity ? "무제한" : `${config.maxUsers}명`,
    maxProducts: config.maxProducts === Infinity ? "무제한" : `${config.maxProducts}개`,
    maxBatchesPerMonth: config.maxBatchesPerMonth === Infinity ? "무제한" : `${config.maxBatchesPerMonth}건`,
    maxSites: config.maxSites === Infinity ? "무제한" : `${config.maxSites}개`,
    features: config.features,
  }));
}
