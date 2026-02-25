import React, { useRef, useEffect, useState, useCallback } from "react";

interface SealGeneratorProps {
  name: string;
  date?: string;
  type?: "round" | "square" | "oval";
  size?: number;
  color?: string;
  title?: string; // 직책 (예: 대표이사, 품질관리팀장)
  companyName?: string; // 회사명
  showBorder?: boolean;
  opacity?: number;
  rotation?: number; // 회전 각도 (자연스러운 날인 효과)
  variant?: "official" | "personal" | "department" | "approval"; // 직인 유형
  className?: string;
  onClick?: () => void;
}

/**
 * 직인/날인 자동생성 컴포넌트 (개선판)
 * Canvas를 이용하여 한국식 직인을 고품질로 생성합니다.
 * - 공식 직인 (회사명 + 대표자명)
 * - 개인 날인 (이름만)
 * - 부서 직인 (부서명 + 직책)
 * - 승인 직인 (승인/검토/확인 + 날짜)
 */
export const SealGenerator: React.FC<SealGeneratorProps> = ({
  name,
  date,
  type = "round",
  size = 80,
  color = "#D42020",
  title,
  companyName,
  showBorder = true,
  opacity = 0.85,
  rotation = 0,
  variant = "personal",
  className = "",
  onClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? (window.devicePixelRatio || 1) : 1;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // 고해상도 렌더링
    const renderSize = size * dpr;
    canvas.width = renderSize;
    canvas.height = renderSize;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    ctx.scale(dpr, dpr);

    // 캔버스 초기화
    ctx.clearRect(0, 0, size, size);
    ctx.globalAlpha = opacity;

    // 회전 적용 (자연스러운 날인 효과)
    if (rotation !== 0) {
      ctx.translate(size / 2, size / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-size / 2, -size / 2);
    }

    const centerX = size / 2;
    const centerY = size / 2;
    const radius = size / 2 - 4;

    // 약간의 잉크 번짐 효과 (그림자)
    ctx.shadowColor = color;
    ctx.shadowBlur = 0.5;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    switch (variant) {
      case "official":
        drawOfficialSeal(ctx, centerX, centerY, radius, size);
        break;
      case "department":
        drawDepartmentSeal(ctx, centerX, centerY, radius, size);
        break;
      case "approval":
        drawApprovalSeal(ctx, centerX, centerY, radius, size);
        break;
      case "personal":
      default:
        drawPersonalSeal(ctx, centerX, centerY, radius, size);
        break;
    }

    // 그림자 초기화
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
  }, [name, date, type, size, color, title, companyName, opacity, rotation, variant, dpr]);

  // 개인 날인 (이름만)
  function drawPersonalSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, s / 35);

    if (type === "round") {
      // 외곽 원
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, 2 * Math.PI);
      ctx.stroke();
      // 내부 원 (이중선)
      ctx.beginPath();
      ctx.arc(cx, cy, r - Math.max(3, s / 25), 0, 2 * Math.PI);
      ctx.stroke();
    } else if (type === "square") {
      const pad = 4;
      ctx.strokeRect(pad, pad, s - pad * 2, s - pad * 2);
      const inner = pad + Math.max(3, s / 25);
      ctx.strokeRect(inner, inner, s - inner * 2, s - inner * 2);
    } else {
      // oval
      ctx.beginPath();
      ctx.ellipse(cx, cy, r, r * 0.75, 0, 0, 2 * Math.PI);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(cx, cy, r - 3, r * 0.75 - 3, 0, 0, 2 * Math.PI);
      ctx.stroke();
    }

    // 이름 (세로 배치 - 한국 전통 직인 스타일)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const chars = name.split("");
    if (chars.length <= 2) {
      // 2글자 이하: 좌우 배치
      ctx.font = `bold ${s / 2.8}px "Noto Serif KR", "Batang", serif`;
      if (chars.length === 2) {
        ctx.fillText(chars[0], cx - s / 7, cy);
        ctx.fillText(chars[1], cx + s / 7, cy);
      } else {
        ctx.fillText(chars[0], cx, cy);
      }
    } else if (chars.length === 3) {
      // 3글자: 상단 1글자 + 하단 2글자 (전통 배치)
      ctx.font = `bold ${s / 3.2}px "Noto Serif KR", "Batang", serif`;
      ctx.fillText(chars[0], cx, cy - s / 6);
      ctx.fillText(chars[1], cx - s / 7, cy + s / 6);
      ctx.fillText(chars[2], cx + s / 7, cy + s / 6);
    } else {
      // 4글자 이상: 2x2 격자
      ctx.font = `bold ${s / 3.5}px "Noto Serif KR", "Batang", serif`;
      const cols = 2;
      const rows = Math.ceil(chars.length / cols);
      const gapX = s / 5;
      const gapY = s / 5;
      chars.forEach((ch, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = cx + (col - (cols - 1) / 2) * gapX;
        const y = cy + (row - (rows - 1) / 2) * gapY;
        ctx.fillText(ch, x, y);
      });
    }

    // 날짜 (하단 작은 글씨)
    if (date) {
      ctx.font = `${s / 8}px "Noto Sans KR", sans-serif`;
      ctx.globalAlpha = opacity * 0.7;
      ctx.fillText(date, cx, cy + r - s / 8);
      ctx.globalAlpha = opacity;
    }
  }

  // 공식 직인 (회사명 + 대표자명)
  function drawOfficialSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2.5, s / 30);

    // 외곽 원
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.stroke();
    // 내부 원
    ctx.beginPath();
    ctx.arc(cx, cy, r - Math.max(3, s / 22), 0, 2 * Math.PI);
    ctx.stroke();

    // 상단: 회사명 (곡선 텍스트)
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (companyName) {
      ctx.font = `bold ${s / 6}px "Noto Serif KR", "Batang", serif`;
      const compChars = companyName.split("");
      const arcRadius = r * 0.65;
      const startAngle = -Math.PI / 2 - (compChars.length - 1) * 0.15;
      compChars.forEach((ch, i) => {
        const angle = startAngle + i * 0.3;
        const x = cx + arcRadius * Math.cos(angle);
        const y = cy + arcRadius * Math.sin(angle);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle + Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      });
    }

    // 중앙 구분선
    ctx.lineWidth = Math.max(1, s / 50);
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy - s / 12);
    ctx.lineTo(cx + r * 0.55, cy - s / 12);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.55, cy + s / 12);
    ctx.lineTo(cx + r * 0.55, cy + s / 12);
    ctx.stroke();

    // 중앙: 대표자명
    ctx.font = `bold ${s / 3.5}px "Noto Serif KR", "Batang", serif`;
    ctx.fillText(name, cx, cy);

    // 하단: 직책
    if (title) {
      ctx.font = `${s / 7}px "Noto Serif KR", "Batang", serif`;
      const titleChars = title.split("");
      const arcRadius2 = r * 0.65;
      const startAngle2 = Math.PI / 2 + (titleChars.length - 1) * 0.15;
      titleChars.forEach((ch, i) => {
        const angle = startAngle2 - i * 0.3;
        const x = cx + arcRadius2 * Math.cos(angle);
        const y = cy + arcRadius2 * Math.sin(angle);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle - Math.PI / 2);
        ctx.fillText(ch, 0, 0);
        ctx.restore();
      });
    }
  }

  // 부서 직인
  function drawDepartmentSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, s / 35);

    // 사각형 외곽
    const pad = 4;
    ctx.strokeRect(pad, pad, s - pad * 2, s - pad * 2);
    const inner = pad + Math.max(2, s / 30);
    ctx.strokeRect(inner, inner, s - inner * 2, s - inner * 2);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 상단: 부서명/회사명
    if (companyName) {
      ctx.font = `bold ${s / 5.5}px "Noto Serif KR", "Batang", serif`;
      ctx.fillText(companyName, cx, cy - s / 5);
    }

    // 중앙: 이름
    ctx.font = `bold ${s / 3}px "Noto Serif KR", "Batang", serif`;
    ctx.fillText(name, cx, cy + (companyName ? 0 : -s / 10));

    // 하단: 직책
    if (title) {
      ctx.font = `${s / 6}px "Noto Serif KR", "Batang", serif`;
      ctx.fillText(title, cx, cy + s / 5);
    }

    // 날짜
    if (date) {
      ctx.font = `${s / 8}px "Noto Sans KR", sans-serif`;
      ctx.globalAlpha = opacity * 0.7;
      ctx.fillText(date, cx, s - inner - s / 10);
      ctx.globalAlpha = opacity;
    }
  }

  // 승인 직인 (승인/검토/확인 + 날짜)
  function drawApprovalSeal(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, s / 35);

    // 사각형 외곽 (승인 도장 스타일)
    const pad = 3;
    ctx.strokeRect(pad, pad, s - pad * 2, s - pad * 2);

    // 내부 구분선 (3단 분할)
    const section = (s - pad * 2) / 3;
    ctx.lineWidth = Math.max(1, s / 50);
    ctx.beginPath();
    ctx.moveTo(pad, pad + section);
    ctx.lineTo(s - pad, pad + section);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pad, pad + section * 2);
    ctx.lineTo(s - pad, pad + section * 2);
    ctx.stroke();

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // 상단: 승인/검토/확인 라벨
    const label = title || "승인";
    ctx.font = `bold ${s / 4.5}px "Noto Serif KR", "Batang", serif`;
    ctx.fillText(label, cx, pad + section / 2);

    // 중앙: 이름
    ctx.font = `bold ${s / 4}px "Noto Serif KR", "Batang", serif`;
    ctx.fillText(name, cx, pad + section + section / 2);

    // 하단: 날짜
    if (date) {
      ctx.font = `${s / 6.5}px "Noto Sans KR", sans-serif`;
      ctx.fillText(date, cx, pad + section * 2 + section / 2);
    }
  }

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      className={`inline-block ${className}`}
      style={{ 
        display: "inline-block",
        cursor: onClick ? "pointer" : "default",
      }}
      onClick={onClick}
      title={`${variant === "approval" ? (title || "승인") : ""} ${name} ${date || ""}`}
    />
  );
};

/**
 * PDF에 직인 이미지를 추가하기 위한 헬퍼 함수 (개선판)
 */
export const generateSealImage = (
  name: string,
  options?: {
    date?: string;
    type?: "round" | "square" | "oval";
    size?: number;
    color?: string;
    title?: string;
    companyName?: string;
    opacity?: number;
    rotation?: number;
    variant?: "official" | "personal" | "department" | "approval";
  }
): string => {
  const {
    date,
    type = "round",
    size = 120,
    color = "#D42020",
    title,
    companyName,
    opacity = 0.85,
    rotation = 0,
    variant = "personal",
  } = options || {};

  const canvas = document.createElement("canvas");
  canvas.width = size * 2; // 고해상도
  canvas.height = size * 2;

  const ctx = canvas.getContext("2d");
  if (!ctx) return "";

  ctx.scale(2, 2);
  ctx.globalAlpha = opacity;

  if (rotation !== 0) {
    ctx.translate(size / 2, size / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.translate(-size / 2, -size / 2);
  }

  const centerX = size / 2;
  const centerY = size / 2;
  const radius = size / 2 - 4;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 0.5;

  // variant에 따라 그리기 (SealGenerator 컴포넌트와 동일 로직)
  switch (variant) {
    case "approval":
      drawApprovalSealStatic(ctx, centerX, centerY, radius, size, { name, date, title, color, opacity });
      break;
    case "official":
      drawOfficialSealStatic(ctx, centerX, centerY, radius, size, { name, date, title, companyName, color, opacity });
      break;
    case "department":
      drawDepartmentSealStatic(ctx, centerX, centerY, radius, size, { name, date, title, companyName, color, opacity });
      break;
    case "personal":
    default:
      drawPersonalSealStatic(ctx, centerX, centerY, radius, size, { name, date, type, color, opacity });
      break;
  }

  return canvas.toDataURL("image/png");
};

// Static drawing functions for generateSealImage
function drawPersonalSealStatic(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number, opts: any) {
  ctx.lineWidth = Math.max(2, s / 35);
  if (opts.type === "round" || !opts.type) {
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r - Math.max(3, s / 25), 0, 2 * Math.PI); ctx.stroke();
  } else {
    const pad = 4;
    ctx.strokeRect(pad, pad, s - pad * 2, s - pad * 2);
    const inner = pad + Math.max(3, s / 25);
    ctx.strokeRect(inner, inner, s - inner * 2, s - inner * 2);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const chars = opts.name.split("");
  if (chars.length <= 2) {
    ctx.font = `bold ${s / 2.8}px "Noto Serif KR", "Batang", serif`;
    if (chars.length === 2) {
      ctx.fillText(chars[0], cx - s / 7, cy);
      ctx.fillText(chars[1], cx + s / 7, cy);
    } else {
      ctx.fillText(chars[0], cx, cy);
    }
  } else if (chars.length === 3) {
    ctx.font = `bold ${s / 3.2}px "Noto Serif KR", "Batang", serif`;
    ctx.fillText(chars[0], cx, cy - s / 6);
    ctx.fillText(chars[1], cx - s / 7, cy + s / 6);
    ctx.fillText(chars[2], cx + s / 7, cy + s / 6);
  } else {
    ctx.font = `bold ${s / 3.5}px "Noto Serif KR", "Batang", serif`;
    const cols = 2; const rows = Math.ceil(chars.length / cols);
    chars.forEach((ch: string, i: number) => {
      const col = i % cols; const row = Math.floor(i / cols);
      ctx.fillText(ch, cx + (col - (cols - 1) / 2) * (s / 5), cy + (row - (rows - 1) / 2) * (s / 5));
    });
  }
  if (opts.date) {
    ctx.font = `${s / 8}px "Noto Sans KR", sans-serif`;
    ctx.globalAlpha = opts.opacity * 0.7;
    ctx.fillText(opts.date, cx, cy + r - s / 8);
    ctx.globalAlpha = opts.opacity;
  }
}

function drawApprovalSealStatic(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number, opts: any) {
  ctx.lineWidth = Math.max(2, s / 35);
  const pad = 3;
  ctx.strokeRect(pad, pad, s - pad * 2, s - pad * 2);
  const section = (s - pad * 2) / 3;
  ctx.lineWidth = Math.max(1, s / 50);
  ctx.beginPath(); ctx.moveTo(pad, pad + section); ctx.lineTo(s - pad, pad + section); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(pad, pad + section * 2); ctx.lineTo(s - pad, pad + section * 2); ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.font = `bold ${s / 4.5}px "Noto Serif KR", "Batang", serif`;
  ctx.fillText(opts.title || "승인", cx, pad + section / 2);
  ctx.font = `bold ${s / 4}px "Noto Serif KR", "Batang", serif`;
  ctx.fillText(opts.name, cx, pad + section + section / 2);
  if (opts.date) {
    ctx.font = `${s / 6.5}px "Noto Sans KR", sans-serif`;
    ctx.fillText(opts.date, cx, pad + section * 2 + section / 2);
  }
}

function drawOfficialSealStatic(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number, opts: any) {
  ctx.lineWidth = Math.max(2.5, s / 30);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, 2 * Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r - Math.max(3, s / 22), 0, 2 * Math.PI); ctx.stroke();
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (opts.companyName) {
    ctx.font = `bold ${s / 6}px "Noto Serif KR", "Batang", serif`;
    const compChars = opts.companyName.split("");
    const arcRadius = r * 0.65;
    const startAngle = -Math.PI / 2 - (compChars.length - 1) * 0.15;
    compChars.forEach((ch: string, i: number) => {
      const angle = startAngle + i * 0.3;
      ctx.save();
      ctx.translate(cx + arcRadius * Math.cos(angle), cy + arcRadius * Math.sin(angle));
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  }
  ctx.lineWidth = Math.max(1, s / 50);
  ctx.beginPath(); ctx.moveTo(cx - r * 0.55, cy - s / 12); ctx.lineTo(cx + r * 0.55, cy - s / 12); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx - r * 0.55, cy + s / 12); ctx.lineTo(cx + r * 0.55, cy + s / 12); ctx.stroke();
  ctx.font = `bold ${s / 3.5}px "Noto Serif KR", "Batang", serif`;
  ctx.fillText(opts.name, cx, cy);
  if (opts.title) {
    ctx.font = `${s / 7}px "Noto Serif KR", "Batang", serif`;
    const titleChars = opts.title.split("");
    const arcRadius2 = r * 0.65;
    const startAngle2 = Math.PI / 2 + (titleChars.length - 1) * 0.15;
    titleChars.forEach((ch: string, i: number) => {
      const angle = startAngle2 - i * 0.3;
      ctx.save();
      ctx.translate(cx + arcRadius2 * Math.cos(angle), cy + arcRadius2 * Math.sin(angle));
      ctx.rotate(angle - Math.PI / 2);
      ctx.fillText(ch, 0, 0);
      ctx.restore();
    });
  }
}

function drawDepartmentSealStatic(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, s: number, opts: any) {
  ctx.lineWidth = Math.max(2, s / 35);
  const pad = 4;
  ctx.strokeRect(pad, pad, s - pad * 2, s - pad * 2);
  const inner = pad + Math.max(2, s / 30);
  ctx.strokeRect(inner, inner, s - inner * 2, s - inner * 2);
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  if (opts.companyName) {
    ctx.font = `bold ${s / 5.5}px "Noto Serif KR", "Batang", serif`;
    ctx.fillText(opts.companyName, cx, cy - s / 5);
  }
  ctx.font = `bold ${s / 3}px "Noto Serif KR", "Batang", serif`;
  ctx.fillText(opts.name, cx, cy + (opts.companyName ? 0 : -s / 10));
  if (opts.title) {
    ctx.font = `${s / 6}px "Noto Serif KR", "Batang", serif`;
    ctx.fillText(opts.title, cx, cy + s / 5);
  }
  if (opts.date) {
    ctx.font = `${s / 8}px "Noto Sans KR", sans-serif`;
    ctx.globalAlpha = opts.opacity * 0.7;
    ctx.fillText(opts.date, cx, s - inner - s / 10);
    ctx.globalAlpha = opts.opacity;
  }
}

/**
 * 승인 프로세스에서 사용할 직인 프리뷰 컴포넌트
 * 승인자 정보를 받아 자동으로 적절한 직인을 생성합니다.
 */
interface ApprovalSealProps {
  approverName: string;
  approverTitle?: string;
  approvalDate?: string;
  approvalType?: "검토" | "승인" | "확인" | "작성";
  size?: number;
  className?: string;
}

export const ApprovalSeal: React.FC<ApprovalSealProps> = ({
  approverName,
  approverTitle,
  approvalDate,
  approvalType = "승인",
  size = 60,
  className = "",
}) => {
  const formattedDate = approvalDate
    ? new Date(approvalDate).toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" })
    : new Date().toLocaleDateString("ko-KR", { year: "2-digit", month: "2-digit", day: "2-digit" });

  return (
    <div className={`inline-flex flex-col items-center gap-1 ${className}`}>
      <SealGenerator
        name={approverName}
        date={formattedDate}
        title={approvalType}
        variant="approval"
        type="square"
        size={size}
        color="#D42020"
        opacity={0.85}
        rotation={Math.random() * 4 - 2} // 약간의 랜덤 회전
      />
      {approverTitle && (
        <span className="text-[10px] text-gray-500">{approverTitle}</span>
      )}
    </div>
  );
};

/**
 * 3단계 승인 직인 행 (작성 → 검토 → 승인)
 */
interface ApprovalSealRowProps {
  writer?: { name: string; title?: string; date?: string };
  reviewer?: { name: string; title?: string; date?: string };
  approver?: { name: string; title?: string; date?: string };
  size?: number;
  className?: string;
}

export const ApprovalSealRow: React.FC<ApprovalSealRowProps> = ({
  writer,
  reviewer,
  approver,
  size = 55,
  className = "",
}) => {
  return (
    <div className={`flex items-end gap-4 ${className}`}>
      {/* 작성 */}
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-gray-400 mb-1">작성</span>
        {writer ? (
          <ApprovalSeal
            approverName={writer.name}
            approverTitle={writer.title}
            approvalDate={writer.date}
            approvalType="작성"
            size={size}
          />
        ) : (
          <div
            className="border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-gray-300 text-[10px]"
            style={{ width: size, height: size }}
          >
            미작성
          </div>
        )}
      </div>

      {/* 검토 */}
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-gray-400 mb-1">검토</span>
        {reviewer ? (
          <ApprovalSeal
            approverName={reviewer.name}
            approverTitle={reviewer.title}
            approvalDate={reviewer.date}
            approvalType="검토"
            size={size}
          />
        ) : (
          <div
            className="border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-gray-300 text-[10px]"
            style={{ width: size, height: size }}
          >
            미검토
          </div>
        )}
      </div>

      {/* 승인 */}
      <div className="flex flex-col items-center">
        <span className="text-[10px] text-gray-400 mb-1">승인</span>
        {approver ? (
          <ApprovalSeal
            approverName={approver.name}
            approverTitle={approver.title}
            approvalDate={approver.date}
            approvalType="승인"
            size={size}
          />
        ) : (
          <div
            className="border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-gray-300 text-[10px]"
            style={{ width: size, height: size }}
          >
            미승인
          </div>
        )}
      </div>
    </div>
  );
};

export default SealGenerator;
