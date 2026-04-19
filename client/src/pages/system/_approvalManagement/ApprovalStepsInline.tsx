/**
 * 3단계 승인 진행 표시 (작성 > 검토 > 승인) — ApprovalManagement.tsx 에서 분리 (2026-04-19)
 */

export function ApprovalStepsInline({ status }: { status: string }) {
  const steps = [
    { key: "작성", done: true },
    { key: "검토", done: status === "pending_approval" || status === "approved" },
    { key: "승인", done: status === "approved" },
  ];
  return (
    <span className="inline-flex items-center gap-0.5 text-[10px]">
      {steps.map((step, i) => (
        <span key={step.key} className="flex items-center gap-0.5">
          {i > 0 && <span className="text-gray-300 mx-0.5">{">"}</span>}
          <span className={step.done ? "text-green-600 font-semibold" : "text-gray-400"}>
            {step.done ? "\u2713" : "\u25CB"}{step.key}
          </span>
        </span>
      ))}
    </span>
  );
}
