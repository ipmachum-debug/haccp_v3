import { mergeRouters } from "../../_core/trpc";
import {
  ccpLimitsRouter,
  ccpRecordsRouter,
  metalDetectionRouter,
  verificationRouter,
  hazardAnalysisCcpRouter,
  productSpecsRouter,
  ccpStatsRouter,
  processGroupsRouter,
} from "../ccpMonitoring/index";

// Merge all CCP monitoring sub-routers into a single router
// preserving the original flat endpoint namespace (e.g. ccpMonitoring.createCcpLimit)
export const ccpMonitoringRouter = mergeRouters(
  ccpLimitsRouter,
  ccpRecordsRouter,
  metalDetectionRouter,
  verificationRouter,
  hazardAnalysisCcpRouter,
  productSpecsRouter,
  ccpStatsRouter,
  processGroupsRouter,
);
