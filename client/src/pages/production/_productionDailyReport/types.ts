/**
 * ProductionDailyReport 분해 — 도메인 타입.
 * 서버는 summary JSON 을 any 로 반환하므로 프론트에서 실사용 shape 정의.
 */
import type { RouterOutput } from "@/lib/trpcTypes";

export type ReportListRow = RouterOutput["dailyReport"]["listReports"][number];

export type ReportCcpDetail = {
  ccpType?: string;
  ccpName?: string;
  status?: string;
  passCount?: number;
  failCount?: number;
  rowCount?: number;
  deviationCount?: number;
  recordCount?: number;
};

export type ReportBatch = {
  id: number;
  batchCode?: string;
  productName?: string;
  status?: string;
  plannedQuantity?: number | string;
  actualQuantity?: number | string;
  startTime?: string | Date | null;
  endTime?: string | Date | null;
  approvedAt?: string | Date | null;
  ccpDetails?: ReportCcpDetail[];
  [key: string]: unknown;
};

export type ReportIssue = {
  type?: string;
  severity?: string;
  title?: string;
  description?: string;
  batchCode?: string;
  productName?: string;
  ccpType?: string;
  measuredAt?: string | Date;
  note?: string;
  detectedAt?: string | Date;
  [key: string]: unknown;
};

export type ReportCcpSummary = {
  totalRecords?: number;
  normalCount?: number;
  deviationCount?: number;
  complianceRate?: number;
  [key: string]: unknown;
};

export type ReportSummary = {
  totalBatches?: number;
  completedBatches?: number;
  totalPlanned?: number;
  totalActual?: number;
  completionRate?: number;
  batches?: ReportBatch[];
  issues?: ReportIssue[];
  ccp?: ReportCcpSummary;
  [key: string]: unknown;
};

export type ReportApprovalInfo = {
  authorName?: string;
  approverName?: string;
  reviewerName?: string;
  requesterName?: string;
  requestedAt?: string | Date;
  reviewedAt?: string | Date;
  approvedAt?: string | Date;
  authorSealDate?: string | Date;
  approverSealDate?: string | Date;
  reviewerSealDate?: string | Date;
  [key: string]: unknown;
};
