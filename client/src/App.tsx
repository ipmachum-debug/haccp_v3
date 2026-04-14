import { Toaster } from "@/components/ui/sonner";
import "./superadmin-theme.css";
import { lazy, Suspense } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { FEATURES } from "@/lib/featureFlags";

// Lazy load pages
const LandingPage = lazy(() => import("@/pages/landing/LandingPage"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const Dashboard = lazy(() => import("./pages/system/Dashboard"));
const SuperAdminDashboard = lazy(() => import("./pages/system/SuperAdminDashboard"));
const SupportManagePage = lazy(() => import("./pages/system/SupportManagePage"));
const BatchListPage = lazy(() => import("./pages/production/BatchListPage"));
const BatchCreate = lazy(() => import("./pages/production/BatchCreate"));
const BatchDetail = lazy(() => import("./pages/production/BatchDetail"));
const DailyBatchCreate = lazy(() => import("./pages/production/DailyBatchCreate"));
const CcpInspection = lazy(() => import("./pages/haccp/CcpInspection"));
const CcpRecords = lazy(() => import("./pages/haccp/CcpRecords"));
const Inventory = lazy(() => import("./pages/inventory/Inventory"));
const CcpCalendar = lazy(() => import("./pages/haccp/CcpCalendar"));
const DailyLogs = lazy(() => import("./pages/production/DailyLogs"));
const ProductionPerformance = lazy(() => import("./pages/production/ProductionPerformance"));
const InventoryForecastDashboard = lazy(() => import("./pages/inventory/InventoryForecastDashboard"));
const BatchCostAnalysisDashboard = lazy(() => import("./pages/production/BatchCostAnalysisDashboard"));
const UserManagement = lazy(() => import("./pages/system/UserManagement"));
const AccountingManagement = lazy(() => import("./pages/accounting/AccountingManagement"));
const AccountingMonthlyClose = lazy(() => import("./pages/accounting/AccountingMonthlyClose"));
const AccountingCloseManagement = lazy(() => import("./pages/accounting/AccountingCloseManagement"));
const ChecklistTemplates = lazy(() => import("./pages/checklist/ChecklistTemplates"));
const ChecklistTemplateForm = lazy(() => import("./pages/checklist/ChecklistTemplateForm"));
const ChecklistInstance = lazy(() => import("./pages/checklist/ChecklistInstance"));
const ChecklistScheduleManagement = lazy(() => import("./pages/checklist/ChecklistScheduleManagement"));
const ChecklistInstanceForm = lazy(() => import("./pages/checklist/ChecklistInstanceForm"));
const ChecklistApprovalManagement = lazy(() => import("./pages/checklist/ChecklistApprovalManagement"));
const EmployeeHealthChecklist = lazy(() => import("./pages/checklist/EmployeeHealthChecklist"));
const MaterialInspections = lazy(() => import("./pages/quality/MaterialInspections"));
const MaterialInspectionForm = lazy(() => import("./pages/quality/MaterialInspectionForm"));
const MaterialInspectionDetail = lazy(() => import("./pages/quality/MaterialInspectionDetail"));
const StockAlerts = lazy(() => import("./pages/inventory/StockAlerts"));
const InventoryLots = lazy(() => import("./pages/inventory/InventoryLots"));
const ShippingInspectionDetail = lazy(() => import("./pages/quality/ShippingInspectionDetail"));
const HygieneInspectionDetail = lazy(() => import("./pages/quality/HygieneInspectionDetail"));
const ShippingInspections = lazy(() => import("./pages/quality/ShippingInspections"));
const ShippingInspectionForm = lazy(() => import("./pages/quality/ShippingInspectionForm"));
const HygieneInspections = lazy(() => import("./pages/quality/HygieneInspections"));
const HygieneInspectionForm = lazy(() => import("./pages/quality/HygieneInspectionForm"));
const SelfQualityInspectionList = lazy(() => import("./pages/quality/SelfQualityInspectionList"));
const SelfQualityInspectionForm = lazy(() => import("./pages/quality/SelfQualityInspectionForm"));
const ProductCcpMapping = lazy(() => import("./pages/haccp/ProductCcpMapping"));
const DailyLogForm = lazy(() => import("./pages/production/DailyLogForm"));
const WeeklyLogForm = lazy(() => import("./pages/production/WeeklyLogForm"));
const MonthlyLogForm = lazy(() => import("./pages/production/MonthlyLogForm"));
const EquipmentManagement = lazy(() => import("./pages/system/EquipmentManagement"));
const DocumentApprovalManagement = lazy(() => import("./pages/system/DocumentApprovalManagement"));
const DocumentApprovalSettingsPage = lazy(() => import("./pages/system/DocumentApprovalSettingsPage"));
const DocumentPrintManagement = lazy(() => import("./pages/system/DocumentPrintManagement"));
const PrintPreviewPage = lazy(() => import("./pages/system/PrintPreviewPage"));
const CalibrationManagement = lazy(() => import("./pages/checklist/CalibrationManagement"));
const ProductManagement = lazy(() => import("./pages/master/ProductManagement"));
const MaterialManagement = lazy(() => import("./pages/master/MaterialManagement"));
const CcpStats = lazy(() => import("./pages/haccp/CcpStats"));
const CCPMonitoring = lazy(() => import("./pages/haccp/CCPMonitoring"));
const RecipeManagement = lazy(() => import("./pages/production/RecipeManagement"));
const CCPLimitsManagement = lazy(() => import("./pages/haccp/CCPLimitsManagement"));
const ProductSpecificationManagement = lazy(() => import("./pages/haccp/ProductSpecificationManagement"));
const HazardAnalysisManagement = lazy(() => import("./pages/haccp/HazardAnalysisManagement"));
const CcpDeviationDashboard = lazy(() => import("./pages/haccp/CcpDeviationDashboard"));
const InventoryTurnoverDashboard = lazy(() => import("./pages/inventory/InventoryTurnoverDashboard"));
const BatchProfitabilityDashboard = lazy(() => import("./pages/production/BatchProfitabilityDashboard"));
const SupplierManagement = lazy(() => import("./pages/master/SupplierManagement"));
const SupplierEvaluation = lazy(() => import("./pages/master/SupplierEvaluation"));
const IntermediateManagement = lazy(() => import("./pages/production/IntermediateManagement"));
const InventoryAnalytics = lazy(() => import("./pages/inventory/InventoryAnalytics"));
const CostSavingAI = lazy(() => import("./pages/production/CostSavingAI"));
const MfReportCreate = lazy(() => import("./pages/production/MfReportCreate"));
const MfReportList = lazy(() => import("./pages/production/MfReportList"));
const MfReportEdit = lazy(() => import("./pages/production/MfReportEdit"));
const MfReportModify = lazy(() => import("./pages/production/MfReportModify"));
const ManufacturingStandards = lazy(() => import("./pages/production/ManufacturingStandards"));
const AuditManagement = lazy(() => import("./pages/haccp/AuditManagement"));
const NonconformingManagement = lazy(() => import("./pages/haccp/NonconformingManagement"));
const HaccpVerification = lazy(() => import("./pages/haccp/HaccpVerification"));
const ProductionOperations = lazy(() => import("./pages/production/ProductionOperations"));
const ProductionManagement = lazy(() => import("./pages/production/ProductionManagement"));
const SupplierPerformance = lazy(() => import("./pages/master/SupplierPerformance"));
const NotificationHistory = lazy(() => import("./pages/system/NotificationHistory"));
const ApprovalManagement = lazy(() => import("./pages/system/ApprovalManagement"));
const SystemManagement = lazy(() => import("./pages/system/SystemManagement"));
const NotificationSettings = lazy(() => import("./pages/system/NotificationSettings"));
const NotificationCenter = lazy(() => import("./pages/system/NotificationCenter"));
const NotificationStatistics = lazy(() => import("./pages/system/NotificationStatistics"));
const ProductionMonitor = lazy(() => import("./pages/production/ProductionMonitor"));
const InventoryPredictionDashboard = lazy(() => import("./pages/inventory/InventoryPredictionDashboard"));
const MobileQuickCheck = lazy(() => import("./pages/system/MobileQuickCheck"));
const BatchScheduleCalendar = lazy(() => import("./pages/production/BatchScheduleCalendar"));
const BatchSchedule = lazy(() => import("./pages/batch/BatchSchedule"));
const CorrectiveActionList = lazy(() => import("./pages/haccp/CorrectiveActionList"));
const SystemSettings = lazy(() => import("./pages/system/SystemSettings"));
const OpscoreSync = lazy(() => import("./pages/system/OpscoreSync"));
const CompanySettings = lazy(() => import("./pages/system/CompanySettings"));
const AccountCategoryManagement = lazy(() => import("./pages/accounting/AccountCategoryManagement"));
const CategoryManagement = lazy(() => import("./pages/accounting/CategoryManagement"));
const Traceability = lazy(() => import("./pages/haccp/Traceability"));
const HazardAnalysis = lazy(() => import("./pages/haccp/HazardAnalysis"));
const HaccpPlanVerification = lazy(() => import("./pages/haccp/HaccpPlanVerification"));
const InternalAuditPlan = lazy(() => import("./pages/haccp/InternalAuditPlan"));
const NonconformingProduct = lazy(() => import("./pages/haccp/NonconformingProduct"));
const RecallSimulation = lazy(() => import("./pages/haccp/RecallSimulation"));
const SupplierAudit = lazy(() => import("./pages/haccp/SupplierAudit"));
const InternalAudit = lazy(() => import("./pages/haccp/InternalAudit"));
const CorrectiveAction = lazy(() => import("./pages/haccp/CorrectiveAction"));
const TrainingManagement = lazy(() => import("./pages/system/TrainingManagement"));
const TrainingLogList = lazy(() => import("./pages/system/TrainingLogList"));
const TrainingLogForm = lazy(() => import("./pages/system/TrainingLogForm"));
const Login = lazy(() => import("./pages/system/Login"));
const Register = lazy(() => import("./pages/system/Register"));
const PendingApproval = lazy(() => import("./pages/system/PendingApproval"));
// const UserApproval = lazy(() => import("./pages/system/UserApproval"));
const SuperAdminUserApproval = lazy(() => import("./pages/admin/UserApproval"));
const EmployeeApproval = lazy(() => import("./pages/system/EmployeeApproval"));
const TenantManagement = lazy(() => import("./pages/system/TenantManagement"));
const BannerManagement = lazy(() => import("./pages/system/BannerManagement"));
const SystemMonitoring = lazy(() => import("./pages/system/SystemMonitoring"));
const BillingManagement = lazy(() => import("./pages/system/BillingManagement"));
const AuditLogs = lazy(() => import("./pages/system/AuditLogs"));
const ForgotPassword = lazy(() => import("./pages/system/ForgotPassword"));
const ResetPassword = lazy(() => import("./pages/system/ResetPassword"));
const FailedTasks = lazy(() => import("./pages/admin/FailedTasks"));
const BackupManagement = lazy(() => import("./pages/system/BackupManagement"));
const AdminSettings = lazy(() => import("./pages/system/AdminSettings"));
const CcpManagement = lazy(() => import("./pages/haccp/CcpManagement"));
const NotificationManagement = lazy(() => import("./pages/system/NotificationManagement"));
const InspectionManagement = lazy(() => import("./pages/quality/InspectionManagement"));
const MaterialInspection = lazy(() => import("./pages/quality/MaterialInspection"));
const InspectionStatistics = lazy(() => import("./pages/quality/InspectionStatistics"));
const ProductionPrediction = lazy(() => import("./pages/production/ProductionPrediction"));
const ApprovalDashboard = lazy(() => import("./pages/system/ApprovalDashboard"));
const HygieneInspection = lazy(() => import("./pages/quality/HygieneInspection"));
const ShippingInspection = lazy(() => import("./pages/quality/ShippingInspection"));
const BatchManagement = lazy(() => import("./pages/production/BatchManagement"));
const Today = lazy(() => import("./pages/system/Today"));
const InventoryManagement = lazy(() => import("./pages/inventory/InventoryManagement"));
const ProductionSchedule = lazy(() => import("./pages/production/ProductionSchedule"));
const MasterDataManagement = lazy(() => import("./pages/master/MasterDataManagement"));
const UploadHistory = lazy(() => import("./pages/system/UploadHistory"));
const MaterialReceiptManagement = lazy(() => import("./pages/production/MaterialReceiptManagement"));
const ProductionEfficiency = lazy(() => import("./pages/production/ProductionEfficiency"));
const InventoryTrend = lazy(() => import("./pages/inventory/InventoryTrend"));
const InventoryForecast = lazy(() => import("./pages/inventory/InventoryForecast"));
const PurchaseProposalHistory = lazy(() => import("./pages/inventory/PurchaseProposalHistory"));
const IntegratedDashboard = lazy(() => import("./pages/system/IntegratedDashboard"));
const QualityChecklistMap = lazy(() => import("@/pages/checklist/QualityChecklistMap"));
const TemplateManagement = lazy(() => import("./pages/system/TemplateManagement"));
const ApprovalQueue = lazy(() => import("./pages/system/ApprovalQueue"));
const HygieneChecklistList = lazy(() => import("./pages/checklist/HygieneChecklistList"));
const HygieneChecklistForm = lazy(() => import("./pages/checklist/HygieneChecklistForm"));
const PestControlChecklistList = lazy(() => import("./pages/checklist/PestControlChecklistList"));
const PestControlChecklistForm = lazy(() => import("./pages/checklist/PestControlChecklistForm"));
const TrainingCourseList = lazy(() => import("./pages/system/TrainingCourseList"));
const ChecklistList = lazy(() => import("./pages/checklist/ChecklistList"));
const ChecklistCreate = lazy(() => import("./pages/checklist/ChecklistCreate"));
const ChecklistDashboard = lazy(() => import("./pages/checklist/ChecklistDashboard"));
const ChecklistDetail = lazy(() => import("./pages/checklist/ChecklistDetail"));
const ChecklistHistory = lazy(() => import("./pages/checklist/ChecklistHistory"));
const ChecklistStatistics = lazy(() => import("./pages/checklist/ChecklistStatistics"));
const ChecklistNotificationSettings = lazy(() => import("./pages/checklist/ChecklistNotificationSettings"));
const RecipeList = lazy(() => import("./pages/production/RecipeList"));
const RecipeDetail = lazy(() => import("./pages/production/RecipeDetail"));
const InventoryReceipt = lazy(() => import("./pages/production/InventoryReceipt"));
const InventoryRelease = lazy(() => import("./pages/production/InventoryRelease"));
const ProductionDailyReport = lazy(() => import("./pages/production/ProductionDailyReport"));
const BatchProductionDashboard = lazy(() => import("./pages/production/BatchProductionDashboard"));
const InventoryManagementIntegrated = lazy(() => import("./pages/inventory/InventoryManagementIntegrated"));
const PipelineDashboard = lazy(() => import("./pages/production/PipelineDashboard"));
const FAQPage = lazy(() => import("./pages/FAQPage"));
const SupportPage = lazy(() => import("./pages/system/SupportPage"));
const LegalPage = lazy(() => import("./pages/LegalPage"));

// 11개 미구현 HACCP 체크리스트
const WaterQualityTestList = lazy(() => import("./pages/checklist/WaterQualityTestList"));
const WaterQualityTestForm = lazy(() => import("./pages/checklist/WaterQualityTestForm"));
const AirCompressorList = lazy(() => import("./pages/checklist/AirCompressorList"));
const AirCompressorForm = lazy(() => import("./pages/checklist/AirCompressorForm"));
const ValidityEvaluationList = lazy(() => import("./pages/checklist/ValidityEvaluationList"));
const ValidityEvaluationForm = lazy(() => import("./pages/checklist/ValidityEvaluationForm"));
const PersonalHygieneCheckList = lazy(() => import("./pages/checklist/PersonalHygieneCheckList"));
const PersonalHygieneCheckForm = lazy(() => import("./pages/checklist/PersonalHygieneCheckForm"));
const WaterUsageCheckList = lazy(() => import("./pages/checklist/WaterUsageCheckList"));
const WaterUsageCheckForm = lazy(() => import("./pages/checklist/WaterUsageCheckForm"));
const EquipmentCleaningRecordList = lazy(() => import("./pages/checklist/EquipmentCleaningRecordList"));
const EquipmentCleaningRecordForm = lazy(() => import("./pages/checklist/EquipmentCleaningRecordForm"));
const ForeignMaterialRecordList = lazy(() => import("./pages/checklist/ForeignMaterialRecordList"));
const ForeignMaterialRecordForm = lazy(() => import("./pages/checklist/ForeignMaterialRecordForm"));
const RefrigerationCheckList = lazy(() => import("./pages/checklist/RefrigerationCheckList"));
const RefrigerationCheckForm = lazy(() => import("./pages/checklist/RefrigerationCheckForm"));
const PackagingStorageRecordList = lazy(() => import("./pages/checklist/PackagingStorageRecordList"));
const PackagingStorageRecordForm = lazy(() => import("./pages/checklist/PackagingStorageRecordForm"));
const QualityIssueRecordList = lazy(() => import("./pages/checklist/QualityIssueRecordList"));
const QualityIssueRecordForm = lazy(() => import("./pages/checklist/QualityIssueRecordForm"));
const CapaRecordList = lazy(() => import("./pages/checklist/CapaRecordList"));
const CapaRecordForm = lazy(() => import("./pages/checklist/CapaRecordForm"));

// PDF 양식 기반 체크리스트
const EmployeeHealthCheckRecordList = lazy(() => import("./pages/checklist/EmployeeHealthCheckRecordList"));
const EmployeeHealthCheckForm = lazy(() => import("./pages/checklist/EmployeeHealthCheckForm"));
const TemperatureHumidityCheckList = lazy(() => import("./pages/checklist/TemperatureHumidityCheckList"));
const TemperatureHumidityCheckForm = lazy(() => import("./pages/checklist/TemperatureHumidityCheckForm"));
const SanitationRecordList = lazy(() => import("./pages/checklist/SanitationRecordList"));
const SanitationRecordForm = lazy(() => import("./pages/checklist/SanitationRecordForm"));

// 공지보드 & 알림 (역할별 UX)
const NoticeBoard = lazy(() => import("./pages/system/NoticeBoard"));
const BoardAlarms = lazy(() => import("./pages/system/BoardAlarms"));

// 조직도 관리
const DepartmentManagement = lazy(() => import("./pages/system/DepartmentManagement"));
const PositionManagement = lazy(() => import("./pages/system/PositionManagement"));
const EmployeeManagement = lazy(() => import("./pages/system/EmployeeManagement"));

// 신규 체크리스트 양식 (PDF 기반)
const SurfaceContaminationTestForm = lazy(() => import("./pages/checklist/SurfaceContaminationTestForm"));
const SurfaceContaminationTestList = lazy(() => import("./pages/checklist/SurfaceContaminationTestList"));
const HygieneFacilityCheckForm = lazy(() => import("./pages/checklist/HygieneFacilityCheckForm"));
const HygieneFacilityCheckList = lazy(() => import("./pages/checklist/HygieneFacilityCheckList"));
const WorkplaceHygieneCheckList = lazy(() => import("./pages/checklist/WorkplaceHygieneCheckList"));
const WorkplaceHygieneCheckForm = lazy(() => import("./pages/checklist/WorkplaceHygieneCheckForm"));
const IlluminationCheckForm = lazy(() => import("./pages/checklist/IlluminationCheckForm"));
const IlluminationCheckList = lazy(() => import("./pages/checklist/IlluminationCheckList"));
const VehicleTemperatureCheckForm = lazy(() => import("./pages/checklist/VehicleTemperatureCheckForm"));
const VehicleTemperatureCheckList = lazy(() => import("./pages/checklist/VehicleTemperatureCheckList"));
const EquipmentHistoryForm = lazy(() => import("./pages/checklist/EquipmentHistoryForm"));
const EquipmentHistoryList = lazy(() => import("./pages/checklist/EquipmentHistoryList"));
const EquipmentInspectionForm = lazy(() => import("./pages/checklist/EquipmentInspectionForm"));
const EquipmentInspectionList = lazy(() => import("./pages/checklist/EquipmentInspectionList"));
const ConsumerComplaintForm = lazy(() => import("./pages/checklist/ConsumerComplaintForm"));
const ConsumerComplaintList = lazy(() => import("./pages/checklist/ConsumerComplaintList"));
const WeightQualityCheckForm = lazy(() => import("./pages/checklist/WeightQualityCheckForm"));
const WeightQualityCheckList = lazy(() => import("./pages/checklist/WeightQualityCheckList"));
const ProductTestReportForm = lazy(() => import("./pages/checklist/ProductTestReportForm"));
const ProductTestReportList = lazy(() => import("./pages/checklist/ProductTestReportList"));
const ProductTestLogForm = lazy(() => import("./pages/checklist/ProductTestLogForm"));
const ProductTestLogList = lazy(() => import("./pages/checklist/ProductTestLogList"));
const FinishedProductCheckForm = lazy(() => import("./pages/checklist/FinishedProductCheckForm"));
const FinishedProductCheckList = lazy(() => import("./pages/checklist/FinishedProductCheckList"));
const SupplierInspectionForm = lazy(() => import("./pages/checklist/SupplierInspectionForm"));
const SupplierInspectionList = lazy(() => import("./pages/checklist/SupplierInspectionList"));
const AirborneBacteriaTestForm = lazy(() => import("./pages/checklist/AirborneBacteriaTestForm"));
const AirborneBacteriaTestList = lazy(() => import("./pages/checklist/AirborneBacteriaTestList"));
const FoodRecallNoticeForm = lazy(() => import("./pages/checklist/FoodRecallNoticeForm"));
const FoodRecallNoticeList = lazy(() => import("./pages/checklist/FoodRecallNoticeList"));
const WaterManagementCheckForm = lazy(() => import("./pages/checklist/WaterManagementCheckForm"));
const WaterManagementCheckList = lazy(() => import("./pages/checklist/WaterManagementCheckList"));
const HandoverDocumentForm = lazy(() => import("./pages/checklist/HandoverDocumentForm"));
const HandoverDocumentList = lazy(() => import("./pages/checklist/HandoverDocumentList"));

// 신규 추가 페이지
const AirCompressorMaintenanceForm = lazy(() => import("./pages/checklist/AirCompressorMaintenanceForm"));
const AirCompressorMaintenanceList = lazy(() => import("./pages/checklist/AirCompressorMaintenanceList"));
const DailyDisposalRecordForm = lazy(() => import("./pages/checklist/DailyDisposalRecordForm"));
const DailyDisposalRecordList = lazy(() => import("./pages/checklist/DailyDisposalRecordList"));
const WasteManagementForm = lazy(() => import("./pages/checklist/WasteManagementForm"));
const WasteManagementList = lazy(() => import("./pages/checklist/WasteManagementList"));



function Router() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    }>
      <Switch>
      <Route path="/" component={LandingPage} />
      <Route path="/faq" component={FAQPage} />
      <Route path="/support" component={SupportPage} />
      <Route path="/legal/:section" component={LegalPage} />
      <Route path="/legal" component={LegalPage} />
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/dashboard/super-admin" component={SuperAdminDashboard} />
        <Route path="/dashboard/support-manage" component={SupportManagePage} />
      <Route path="/dashboard/user-approval" component={SuperAdminUserApproval} />
      <Route path="/dashboard/tenant-management" component={TenantManagement} />
      <Route path="/dashboard/system-monitoring" component={SystemMonitoring} />
      <Route path="/dashboard/billing-management" component={BillingManagement} />


      
      {/* 통합 페이지 라우트 */}
      <Route path="/dashboard/today" component={Today} />
      <Route path="/dashboard/ccp" component={CcpManagement} />
      <Route path="/dashboard/notifications" component={NotificationManagement} />
      <Route path="/dashboard/inspections" component={InspectionManagement} />
      <Route path="/dashboard/batch-management" component={BatchManagement} />
      <Route path="/dashboard/inventory-management" component={InventoryManagement} />
      <Route path="/dashboard/inventory-forecast" component={InventoryForecastDashboard} />
      <Route path="/dashboard/inventory-analytics" component={InventoryAnalytics} />
          <Route path="/dashboard/inventory-forecast-new" component={InventoryForecast} />
          <Route path="/dashboard/manufacturing-standards" component={ManufacturingStandards} />
          <Route path="/dashboard/mf-reports" component={MfReportList} />
          <Route path="/dashboard/mf-report/create" component={MfReportCreate} />
          <Route path="/dashboard/mf-report/edit/:id" component={MfReportEdit} />
          <Route path="/dashboard/mf-report/modify/:id" component={MfReportModify} />
          <Route path="/dashboard/production-operations" component={ProductionOperations} />
          <Route path="/dashboard/haccp" component={ProductionOperations} />
          <Route path="/dashboard/production-management" component={ProductionManagement} />
      <Route path="/dashboard/cost-saving-ai" component={CostSavingAI} />
      <Route path="/dashboard/batch-cost-analysis" component={BatchCostAnalysisDashboard} />
      <Route path="/dashboard/material-receipt" component={MaterialReceiptManagement} />
      <Route path="/dashboard/production-schedule" component={ProductionSchedule} />
      <Route path="/dashboard/production-efficiency" component={ProductionEfficiency} />
      <Route path="/dashboard/inventory-trend" component={InventoryTrend} />
      <Route path="/dashboard/purchase-proposal-history" component={PurchaseProposalHistory} />
      <Route path="/dashboard/integrated" component={IntegratedDashboard} />
      <Route path="/dashboard/pipeline" component={PipelineDashboard} />
      <Route path="/dashboard/master-data" component={MasterDataManagement} />
      <Route path="/dashboard/item-master" component={lazy(() => import("@/pages/master/ItemMasterManagement"))} />
      <Route path="/dashboard/upload-history" component={UploadHistory} />
      <Route path="/quality/checklists" component={ChecklistDashboard} />
      <Route path="/calibration" component={CalibrationManagement} />
      <Route path="/training-log" component={TrainingLogList} />
      <Route path="/training-log/new" component={TrainingLogForm} />
      <Route path="/training-log/:id" component={TrainingLogForm} />
      <Route path="/quality/checklists/list" component={ChecklistList} />
      <Route path="/quality/self-inspection" component={SelfQualityInspectionList} />
      <Route path="/quality/self-inspection/new" component={SelfQualityInspectionForm} />
      <Route path="/quality/self-inspection/:id" component={SelfQualityInspectionForm} />
      <Route path="/quality/templates" component={TemplateManagement} />
      <Route path="/quality/ccp-monitoring" component={CCPMonitoring} />
      <Route path="/master/recipe" component={RecipeManagement} />
      <Route path="/quality/ccp-limits" component={CCPLimitsManagement} />
      <Route path="/quality/product-specification" component={ProductSpecificationManagement} />
      <Route path="/quality/hazard-analysis" component={HazardAnalysisManagement} />
      <Route path="/quality/approvals" component={ApprovalQueue} />
      <Route path="/hygiene/checklists" component={HygieneChecklistList} />
      <Route path="/hygiene/checklists/new" component={HygieneChecklistForm} />
      <Route path="/hygiene/checklists/:id" component={HygieneChecklistForm} />
      <Route path="/pest-control/checklists" component={PestControlChecklistList} />
      <Route path="/pest-control/checklists/new" component={PestControlChecklistForm} />
      <Route path="/pest-control/checklists/:id" component={PestControlChecklistForm} />
            <Route path="/training/courses" component={TrainingCourseList} />
      <Route path="/quality/checklists/create" component={ChecklistCreate} />
      <Route path="/quality/checklists/:id" component={ChecklistDetail} />
      <Route path="/quality/checklists/:id/history" component={ChecklistHistory} />
      <Route path="/quality/statistics" component={ChecklistStatistics} />
      <Route path="/quality/notification-settings" component={ChecklistNotificationSettings} />
      <Route path="/dashboard/batch" component={BatchListPage} />
      <Route path="/dashboard/batch/new" component={BatchCreate} />
      <Route path="/dashboard/batch/bulk" component={DailyBatchCreate} />
      <Route path="/dashboard/batch/:id" component={BatchDetail} />
      <Route path="/inventory/receipt" component={InventoryReceipt} />
      <Route path="/inventory/release" component={InventoryRelease} />
      <Route path="/daily-report" component={ProductionDailyReport} />
        <Route path="/production-dashboard" component={BatchProductionDashboard} />
        <Route path="/inventory-management" component={InventoryManagementIntegrated} />
      <Route path="/document-approval" component={DocumentApprovalManagement} />
      <Route path="/document-approval-settings" component={DocumentApprovalSettingsPage} />
      <Route path="/print-preview" component={PrintPreviewPage} />
      <Route path="/dashboard/document-output" component={DocumentPrintManagement} />
      <Route path="/dashboard/document-output/approved" component={DocumentPrintManagement} />
      {/* /batch/new 리다이렉트 */}
      <Route path="/batch/new">
        {() => {
          window.location.href = "/dashboard/batch-management?tab=create";
          return null;
        }}
      </Route>
      <Route path="/dashboard/ccp/:id" component={CcpInspection} />
      <Route path="/dashboard/ccp-records" component={CcpRecords} />
      <Route path="/dashboard/ccp-calendar" component={CcpCalendar} />
      <Route path="/dashboard/product-ccp-mapping" component={ProductCcpMapping} />
      <Route path="/dashboard/products" component={ProductManagement} />
      <Route path="/dashboard/recipes" component={RecipeList} />
      <Route path="/dashboard/recipes/:id" component={RecipeDetail} />
      <Route path="/dashboard/materials" component={MaterialManagement} />
      <Route path="/dashboard/intermediates" component={IntermediateManagement} />
      <Route path="/dashboard/ccp-stats" component={CcpStats} />
      <Route path="/ccp-deviation-dashboard" component={CcpDeviationDashboard} />
      <Route path="/inventory-turnover-dashboard" component={InventoryTurnoverDashboard} />
      <Route path="/batch-profitability-dashboard" component={BatchProfitabilityDashboard} />
      <Route path="/dashboard/suppliers" component={SupplierManagement} />
          <Route path="/dashboard/suppliers/:id/evaluations" component={SupplierEvaluation} />
          <Route path="/dashboard/supplier-performance" component={SupplierPerformance} />
      <Route path="/dashboard/notifications" component={NotificationHistory} />
      <Route path="/dashboard/notification-settings" component={NotificationSettings} />
      <Route path="/dashboard/daily-logs" component={DailyLogs} />
      <Route path="/daily-log/daily" component={DailyLogForm} />
      <Route path="/weekly-log/form" component={WeeklyLogForm} />
      <Route path="/monthly-log/form" component={MonthlyLogForm} />
      <Route path="/dashboard/production-performance" component={ProductionPerformance} />
      <Route path="/dashboard/inventory" component={Inventory} />
      <Route path="/dashboard/users" component={UserManagement} />
          <Route path="/dashboard/user-approval" component={SuperAdminUserApproval} />
          <Route path="/dashboard/tenants" component={TenantManagement} />
          <Route path="/dashboard/banners" component={BannerManagement} />
          <Route path="/dashboard/accounting" component={AccountingManagement} />
      <Route path="/dashboard/accounting/bank-management" component={lazy(() => import("@/pages/accounting/BankManagement"))} />
      <Route path="/dashboard/accounting/bank-accounts" component={lazy(() => import("@/pages/accounting/BankAccountManagement"))} />
      <Route path="/dashboard/accounting/bank-transactions" component={lazy(() => import("@/pages/accounting/BankTransactionManagement"))} />
      <Route path="/dashboard/accounting/matching-rules" component={lazy(() => import("@/pages/accounting/BankMatchingRuleManagement"))} />
      <Route path="/dashboard/accounting/partners" component={lazy(() => import("@/pages/accounting/PartnersQuery"))} />
      <Route path="/dashboard/accounting/purchases/create" component={lazy(() => import("@/pages/accounting/PurchasesManagement"))} />
      <Route path="/dashboard/accounting/purchases/list" component={lazy(() => import("@/pages/accounting/PurchasesList"))} />
      <Route path="/dashboard/accounting/purchases/:id" component={lazy(() => import("@/pages/accounting/PurchaseDetail"))} />
      {/* Phase A (2026-04-14): 발주·구매 관리 */}
      <Route path="/dashboard/accounting/purchase-orders" component={lazy(() => import("@/pages/accounting/PurchaseOrderList"))} />
      <Route path="/dashboard/accounting/purchase-orders/create" component={lazy(() => import("@/pages/accounting/PurchaseOrderCreate"))} />
      {/* Phase B (2026-04-14): 거래처별 단가표 */}
      <Route path="/dashboard/accounting/partner-prices" component={lazy(() => import("@/pages/accounting/PartnerPricesManagement"))} />
      <Route path="/dashboard/accounting/sales/create" component={lazy(() => import("@/pages/accounting/SalesManagement"))} />
      <Route path="/dashboard/accounting/sales/list" component={lazy(() => import("@/pages/accounting/SalesList"))} />
      <Route path="/dashboard/accounting/sales/:id" component={lazy(() => import("@/pages/accounting/SaleDetail"))} />
      <Route path="/dashboard/accounting/bank-accounts" component={lazy(() => import("@/pages/accounting/BankAccountManagement"))} />
      <Route path="/dashboard/accounting/bank-matching" component={lazy(() => import("@/pages/accounting/BankTransactionMatching"))} />
      <Route path="/dashboard/accounting/matching-rules" component={lazy(() => import("@/pages/accounting/MatchingRulesManagement"))} />
      <Route path="/dashboard/accounting/accounts" component={lazy(() => import("@/pages/accounting/AccountingAccounts"))} />
      <Route path="/dashboard/accounting/daily-close" component={lazy(() => import("@/pages/accounting/AccountingDailyClose"))} />
      <Route path="/dashboard/accounting/closing-management" component={lazy(() => import("@/pages/accounting/ClosingManagement"))} />
      <Route path="/dashboard/accounting/material-ledger" component={lazy(() => import("@/pages/accounting/MaterialLedger"))} />
      <Route path="/dashboard/accounting/material-usage-reports" component={lazy(() => import("@/pages/accounting/MaterialUsageReportList"))} />
      <Route path="/material-usage-report-print" component={lazy(() => import("@/pages/accounting/MaterialUsageReportPrint"))} />
      <Route path="/dashboard/accounting/financial-reports" component={lazy(() => import("@/pages/accounting/FinancialReports"))} />
      <Route path="/dashboard/accounting/monthly-close" component={AccountingMonthlyClose} />
      <Route path="/accounting-close" component={AccountingCloseManagement} />
      <Route path="/accounting/monthly-summary" component={lazy(() => import("@/pages/accounting/AccountingMonthlySummary"))} />
      <Route path="/accounting/monthly-summary/new" component={lazy(() => import("@/pages/accounting/AccountingMonthlySummaryNew"))} />
      <Route path="/accounting/monthly-summary/:year/:month" component={lazy(() => import("@/pages/accounting/AccountingMonthlySummaryDetail"))} />
      <Route path="/accounting/documents" component={lazy(() => import("@/pages/accounting/AccountingDocuments"))} />
      <Route path="/accounting/documents/:id" component={lazy(() => import("@/pages/accounting/AccountingDocumentDetail"))} />
      <Route path="/dashboard/accounting/communication-log" component={lazy(() => import("@/pages/accounting/CommunicationLog"))} />
      <Route path="/dashboard/accounting/notice-board" component={lazy(() => import("@/pages/accounting/AccountingNoticeBoard"))} />
      <Route path="/dashboard/accounting/expense" component={lazy(() => import("@/pages/accounting/ExpenseManagement"))} />
      <Route path="/dashboard/inspection/material" component={MaterialInspection} />
      <Route path="/dashboard/inspection/hygiene" component={HygieneInspection} />
      <Route path="/dashboard/inspection/shipping" component={ShippingInspection} />
              <Route path="/dashboard/inspection/statistics" component={InspectionStatistics} />
              <Route path="/dashboard/production/prediction" component={ProductionPrediction} />
      <Route path="/dashboard/approval/dashboard" component={ApprovalDashboard} />
      <Route path="/dashboard/checklist/templates" component={ChecklistTemplates} />
      <Route path="/dashboard/checklist/templates/new" component={ChecklistTemplateForm} />
      <Route path="/dashboard/checklist/templates/:id" component={ChecklistTemplateForm} />
      <Route path="/checklist-instance" component={ChecklistInstance} />
      <Route path="/checklist-schedule" component={ChecklistScheduleManagement} />
      <Route path="/checklist-instance/form" component={ChecklistInstanceForm} />
      <Route path="/checklist-instance/form/:id" component={ChecklistInstanceForm} />
      <Route path="/checklist-approval" component={ChecklistApprovalManagement} />
      <Route path="/dashboard/checklist/instances/:id" component={ChecklistInstance} />
      <Route path="/dashboard/checklist/employee-health" component={EmployeeHealthChecklist} />
      <Route path="/stock-alerts" component={StockAlerts} />
      <Route path="/inventory-lots" component={InventoryLots} />
      <Route path="/notifications" component={NotificationCenter} />
      <Route path="/notification-statistics" component={NotificationStatistics} />
      <Route path="/production-monitor" component={ProductionMonitor} />
      <Route path="/dashboard/checklist" component={ChecklistDashboard} />
      <Route path="/inventory-prediction" component={InventoryPredictionDashboard} />
      <Route path="/mobile-quick-check" component={MobileQuickCheck} />
      <Route path="/batch-schedule-calendar" component={BatchScheduleCalendar} />
      <Route path="/batch-schedule" component={BatchSchedule} />
      <Route path="/corrective-actions" component={CorrectiveActionList} />
      <Route path="/system-settings" component={SystemSettings} />
      <Route path="/company-settings" component={CompanySettings} />
      <Route path="/account-categories" component={AccountCategoryManagement} />
      <Route path="/category-management" component={CategoryManagement} />
      <Route path="/admin/failed-tasks" component={FailedTasks} />
      <Route path="/admin/settings" component={SystemManagement} />
      {/* ★ GOGOGOPICK 연동 라우트는 feature flag 로 제어 (기본 비활성) */}
      {FEATURES.GOGOGOPICK_INTEGRATION && (
        <Route path="/admin/opscore-sync" component={OpscoreSync} />
      )}
      <Route path="/traceability" component={Traceability} />
      <Route path="/dashboard/haccp/hazard-analysis" component={HazardAnalysis} />
      <Route path="/dashboard/haccp/plan-verification" component={HaccpPlanVerification} />
      <Route path="/dashboard/haccp/audit-plan" component={InternalAuditPlan} />
      <Route path="/dashboard/haccp/internal-audit" component={InternalAudit} />
      <Route path="/nonconforming-products" component={NonconformingProduct} />
      <Route path="/recall-simulation" component={RecallSimulation} />
      <Route path="/supplier-audit" component={SupplierAudit} />
      <Route path="/dashboard/audit-management" component={AuditManagement} />
      <Route path="/dashboard/nonconforming-management" component={NonconformingManagement} />
      <Route path="/dashboard/haccp-verification" component={HaccpVerification} />
      <Route path="/haccp-plan-verification" component={HaccpPlanVerification} />
      <Route path="/internal-audit" component={InternalAudit} />
      <Route path="/internal-audit-plan" component={InternalAuditPlan} />
      <Route path="/dashboard/haccp/corrective-action" component={CorrectiveAction} />
      <Route path="/dashboard/haccp/training" component={TrainingManagement} />
      <Route path="/dashboard/training-admin" component={lazy(() => import("@/pages/system/TrainingAdmin"))} />
      <Route path="/dashboard/server-monitor" component={lazy(() => import("@/pages/system/ServerMonitorDashboard"))} />
      <Route path="/dashboard/scan-checklist" component={lazy(() => import("@/pages/checklist/ScanChecklistUpload"))} />
      <Route path="/dashboard/audit-report" component={lazy(() => import("@/pages/system/AuditReportDashboard"))} />
      <Route path="/dashboard/approval" component={ApprovalManagement} />
      <Route path="/dashboard/audit-logs" component={AuditLogs} />

      {/* AI HACCP Assistant */}
      <Route path="/dashboard/ai-assistant" component={lazy(() => import("@/pages/ai/AIDashboard"))} />

      {/* 통합 데이터 임포트 (기존 엑셀 + 단순 + AI 검증) */}
      <Route path="/dashboard/data-import" component={lazy(() => import("@/pages/system/DataImport"))} />
      {/* 하위 호환: 기존 경로 리다이렉트 */}
      <Route path="/dashboard/excel-import">{() => { window.location.replace("/dashboard/data-import"); return null; }}</Route>
      <Route path="/dashboard/simplified-import">{() => { window.location.replace("/dashboard/data-import"); return null; }}</Route>

      {/* 11개 미구현 HACCP 체크리스트 */}
      <Route path="/water-quality-test" component={WaterQualityTestList} />
      <Route path="/water-quality-test/new" component={WaterQualityTestForm} />
      <Route path="/water-quality-test/:id" component={WaterQualityTestForm} />
      <Route path="/air-compressor" component={AirCompressorList} />
      <Route path="/air-compressor/new" component={AirCompressorForm} />
      <Route path="/air-compressor/:id" component={AirCompressorForm} />
      <Route path="/validity-evaluation" component={ValidityEvaluationList} />
      <Route path="/validity-evaluation/new" component={ValidityEvaluationForm} />
      <Route path="/validity-evaluation/:id" component={ValidityEvaluationForm} />
      <Route path="/personal-hygiene-check" component={PersonalHygieneCheckList} />
      <Route path="/personal-hygiene-check/new" component={PersonalHygieneCheckForm} />
      <Route path="/personal-hygiene-check/:id" component={PersonalHygieneCheckForm} />
      <Route path="/water-usage-check" component={WaterUsageCheckList} />
      <Route path="/water-usage-check/new" component={WaterUsageCheckForm} />
      <Route path="/water-usage-check/:id" component={WaterUsageCheckForm} />
      <Route path="/equipment-cleaning-record" component={EquipmentCleaningRecordList} />
      <Route path="/equipment-cleaning-record/new" component={EquipmentCleaningRecordForm} />
      <Route path="/equipment-cleaning-record/:id" component={EquipmentCleaningRecordForm} />
      <Route path="/foreign-material-record" component={ForeignMaterialRecordList} />
      <Route path="/foreign-material-record/new" component={ForeignMaterialRecordForm} />
      <Route path="/foreign-material-record/:id" component={ForeignMaterialRecordForm} />
      <Route path="/refrigeration-check" component={RefrigerationCheckList} />
      <Route path="/refrigeration-check/new" component={RefrigerationCheckForm} />
      <Route path="/refrigeration-check/:id" component={RefrigerationCheckForm} />
      <Route path="/packaging-storage-record" component={PackagingStorageRecordList} />
      <Route path="/packaging-storage-record/new" component={PackagingStorageRecordForm} />
      <Route path="/packaging-storage-record/:id" component={PackagingStorageRecordForm} />
      <Route path="/quality-issue-record" component={QualityIssueRecordList} />
      <Route path="/quality-issue-record/new" component={QualityIssueRecordForm} />
      <Route path="/quality-issue-record/:id" component={QualityIssueRecordForm} />
      <Route path="/capa-record" component={CapaRecordList} />
      <Route path="/capa-record/new" component={CapaRecordForm} />
      <Route path="/capa-record/:id" component={CapaRecordForm} />

      {/* PDF 양식 기반 체크리스트 */}
      <Route path="/employee-health-check" component={EmployeeHealthCheckRecordList} />
      <Route path="/employee-health-check/new" component={EmployeeHealthCheckForm} />
      <Route path="/employee-health-check/:id" component={EmployeeHealthCheckForm} />
      <Route path="/temperature-humidity-check" component={TemperatureHumidityCheckList} />
      <Route path="/temperature-humidity-check/new" component={TemperatureHumidityCheckForm} />
      <Route path="/temperature-humidity-check/:id" component={TemperatureHumidityCheckForm} />
      <Route path="/sanitation-record" component={SanitationRecordList} />
      <Route path="/sanitation-record/new" component={SanitationRecordForm} />
      <Route path="/sanitation-record/:id" component={SanitationRecordForm} />

      {/* 신규 체크리스트 양식 (PDF 기반) */}
      <Route path="/surface-contamination-test" component={SurfaceContaminationTestList} />
      <Route path="/surface-contamination-test/new" component={SurfaceContaminationTestForm} />
      <Route path="/surface-contamination-test/:id" component={SurfaceContaminationTestForm} />
      <Route path="/hygiene-facility-check" component={HygieneFacilityCheckList} />
      <Route path="/hygiene-facility-check/new" component={HygieneFacilityCheckForm} />
      <Route path="/hygiene-facility-check/:id" component={HygieneFacilityCheckForm} />
      <Route path="/workplace-hygiene-check" component={WorkplaceHygieneCheckList} />
      <Route path="/workplace-hygiene-check/new" component={WorkplaceHygieneCheckForm} />
      <Route path="/workplace-hygiene-check/:id" component={WorkplaceHygieneCheckForm} />
      <Route path="/illumination-check" component={IlluminationCheckList} />
      <Route path="/illumination-check/new" component={IlluminationCheckForm} />
      <Route path="/illumination-check/:id" component={IlluminationCheckForm} />
      <Route path="/vehicle-temperature-check" component={VehicleTemperatureCheckList} />
      <Route path="/vehicle-temperature-check/new" component={VehicleTemperatureCheckForm} />
      <Route path="/vehicle-temperature-check/:id" component={VehicleTemperatureCheckForm} />
      <Route path="/equipment-history" component={EquipmentHistoryList} />
      <Route path="/equipment-history/new" component={EquipmentHistoryForm} />
      <Route path="/equipment-history/:id" component={EquipmentHistoryForm} />
      <Route path="/equipment-inspection" component={EquipmentInspectionList} />
      <Route path="/equipment-inspection/new" component={EquipmentInspectionForm} />
      <Route path="/equipment-inspection/:id" component={EquipmentInspectionForm} />
      <Route path="/consumer-complaint" component={ConsumerComplaintList} />
      <Route path="/consumer-complaint/new" component={ConsumerComplaintForm} />
      <Route path="/consumer-complaint/:id" component={ConsumerComplaintForm} />
      <Route path="/weight-quality-check" component={WeightQualityCheckList} />
      <Route path="/weight-quality-check/new" component={WeightQualityCheckForm} />
      <Route path="/weight-quality-check/:id" component={WeightQualityCheckForm} />
      <Route path="/product-test-report" component={ProductTestReportList} />
      <Route path="/product-test-report/new" component={ProductTestReportForm} />
      <Route path="/product-test-report/:id" component={ProductTestReportForm} />
      <Route path="/product-test-log" component={ProductTestLogList} />
      <Route path="/product-test-log/new" component={ProductTestLogForm} />
      <Route path="/product-test-log/:id" component={ProductTestLogForm} />
      <Route path="/finished-product-check" component={FinishedProductCheckList} />
      <Route path="/finished-product-check/new" component={FinishedProductCheckForm} />
      <Route path="/finished-product-check/:id" component={FinishedProductCheckForm} />
      <Route path="/supplier-inspection" component={SupplierInspectionList} />
      <Route path="/supplier-inspection/new" component={SupplierInspectionForm} />
      <Route path="/supplier-inspection/:id" component={SupplierInspectionForm} />
      <Route path="/pest-control-checklist" component={PestControlChecklistList} />
      <Route path="/pest-control-checklist/new" component={PestControlChecklistForm} />
      <Route path="/pest-control-checklist/:id" component={PestControlChecklistForm} />
      <Route path="/airborne-bacteria-test" component={AirborneBacteriaTestList} />
      <Route path="/airborne-bacteria-test/new" component={AirborneBacteriaTestForm} />
      <Route path="/airborne-bacteria-test/:id" component={AirborneBacteriaTestForm} />
      <Route path="/food-recall-notice" component={FoodRecallNoticeList} />
      <Route path="/food-recall-notice/new" component={FoodRecallNoticeForm} />
      <Route path="/food-recall-notice/:id" component={FoodRecallNoticeForm} />
      <Route path="/water-management-check" component={WaterManagementCheckList} />
      <Route path="/water-management-check/new" component={WaterManagementCheckForm} />
      <Route path="/water-management-check/:id" component={WaterManagementCheckForm} />
      <Route path="/handover-document" component={HandoverDocumentList} />
      <Route path="/handover-document/new" component={HandoverDocumentForm} />
      <Route path="/handover-document/:id" component={HandoverDocumentForm} />

      {/* 신규 추가 라우트 */}
      <Route path="/air-compressor-maintenance" component={AirCompressorMaintenanceList} />
      <Route path="/air-compressor-maintenance/new" component={AirCompressorMaintenanceForm} />
      <Route path="/air-compressor-maintenance/:id" component={AirCompressorMaintenanceForm} />
      <Route path="/daily-disposal-record" component={DailyDisposalRecordList} />
      <Route path="/daily-disposal-record/new" component={DailyDisposalRecordForm} />
      <Route path="/daily-disposal-record/:id" component={DailyDisposalRecordForm} />
      <Route path="/waste-management" component={WasteManagementList} />
      <Route path="/waste-management/new" component={WasteManagementForm} />
      <Route path="/waste-management/:id" component={WasteManagementForm} />

      {/* 공지보드 & 알림 (역할별 UX) */}
      <Route path="/board" component={NoticeBoard} />
      <Route path="/board/alerts" component={BoardAlarms} />

      {/* 조직도 관리 */}
      <Route path="/organization/departments" component={DepartmentManagement} />
      <Route path="/organization/positions" component={PositionManagement} />
      <Route path="/organization/employees" component={EmployeeManagement} />
        <Route path="/login" component={Login} />
        <Route path="/register" component={Register} />
        <Route path="/pending-approval" component={PendingApproval} />
        {/* <Route path="/verify-email" component={VerifyEmail} /> */}
        <Route path="/forgot-password" component={ForgotPassword} />
        <Route path="/reset-password" component={ResetPassword} />
        <Route path="/admin/user-approval" component={SuperAdminUserApproval} />
        <Route path="/admin/employee-approval" component={EmployeeApproval} />
      <Route path="/404" component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        switchable
      >
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;

