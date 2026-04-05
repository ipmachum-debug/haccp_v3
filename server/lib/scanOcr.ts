/**
 * 스캔 OCR + AI 구조화 파이프라인
 * 
 * 1. 이미지/PDF → OpenAI Vision API (GPT-4o) → 텍스트 추출
 * 2. 추출된 텍스트 + 체크리스트 양식 → JSON 구조화
 * 3. 미리보기용 데이터 반환
 */
import OpenAI from "openai";
import fs from "fs";
import { execSync } from "child_process";
import path from "path";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * PDF → PNG 이미지 변환 (pdftoppm 사용)
 * 첫 페이지만 변환 (체크리스트는 보통 1페이지)
 */
function pdfToImage(pdfPath: string): string {
  const outputBase = pdfPath.replace(/\.pdf$/i, "_page");
  execSync(`pdftoppm -png -r 200 -f 1 -l 1 "${pdfPath}" "${outputBase}"`, { timeout: 30000 });

  // pdftoppm은 파일명에 -1 등 페이지 번호를 붙임
  const possibleNames = [
    `${outputBase}-1.png`,
    `${outputBase}-01.png`,
    `${outputBase}-001.png`,
  ];
  for (const name of possibleNames) {
    if (fs.existsSync(name)) return name;
  }

  // glob 방식 폴백
  const dir = path.dirname(outputBase);
  const base = path.basename(outputBase);
  const files = fs.readdirSync(dir).filter(f => f.startsWith(base) && f.endsWith(".png"));
  if (files.length > 0) return path.join(dir, files[0]);

  throw new Error("PDF → 이미지 변환 실패");
}

/**
 * 이미지 파일 → Base64 변환 (PDF면 먼저 이미지로 변환)
 */
function fileToBase64(filePath: string): { base64: string; mimeType: string; tempFile?: string } {
  const ext = filePath.split(".").pop()?.toLowerCase();

  if (ext === "pdf") {
    const imagePath = pdfToImage(filePath);
    const buffer = fs.readFileSync(imagePath);
    return { base64: buffer.toString("base64"), mimeType: "image/png", tempFile: imagePath };
  }

  const buffer = fs.readFileSync(filePath);
  const mimeType = getMimeType(filePath);
  return { base64: buffer.toString("base64"), mimeType };
}

/**
 * MIME 타입 추정
 */
function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "jpg": case "jpeg": return "image/jpeg";
    case "png": return "image/png";
    case "gif": return "image/gif";
    case "webp": return "image/webp";
    case "pdf": return "application/pdf";
    default: return "image/jpeg";
  }
}

/**
 * 스캔 이미지 → OCR + JSON 구조화
 * 
 * @param filePath 스캔 파일 경로
 * @param checklistType 체크리스트 종류 (예: "personal_hygiene", "temperature_humidity")
 * @param templateFields 양식 필드 정의 (있으면 정확도 향상)
 */
export async function ocrAndStructure(
  filePath: string,
  checklistType: string,
  templateFields?: { fieldName: string; fieldLabel: string; type: string }[]
): Promise<{
  success: boolean;
  rawText: string;
  structuredData: Record<string, any>;
  confidence: number;
  error?: string;
}> {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return { success: false, rawText: "", structuredData: {}, confidence: 0, error: "OPENAI_API_KEY 환경변수가 설정되지 않았습니다." };
    }

    const { base64, mimeType, tempFile } = fileToBase64(filePath);

    // 양식 필드 설명 생성
    let fieldsDesc = "";
    if (templateFields && templateFields.length > 0) {
      fieldsDesc = "\n\n이 체크리스트의 필드 구성:\n" +
        templateFields.map(f => `- ${f.fieldName} (${f.fieldLabel}): ${f.type}`).join("\n");
    }

    const checklistLabels: Record<string, string> = {
      personal_hygiene: "개인위생점검",
      temperature_humidity: "온습도점검",
      equipment_cleaning: "설비세정기록",
      water_quality: "수질검사",
      refrigeration: "냉동점검",
      packaging_storage: "포장보관기록",
      foreign_material: "이물질기록",
      surface_contamination: "표면오염검사",
      training_log: "교육훈련기록",
      general: "일반 체크리스트",
    };

    const typeName = checklistLabels[checklistType] || checklistType;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      max_tokens: 4096,
      messages: [
        {
          role: "system",
          content: `당신은 HACCP 식품안전 체크리스트 OCR 전문가입니다.
스캔된 수기 체크리스트 이미지를 분석하여 정확한 JSON 데이터로 변환하세요.

체크리스트 종류: ${typeName}
${fieldsDesc}

반드시 아래 JSON 형식으로 응답하세요:
{
  "formDate": "YYYY-MM-DD",
  "formType": "${checklistType}",
  "title": "문서 제목",
  "inspector": "작성자/점검자 이름",
  "items": [
    {
      "itemText": "점검 항목",
      "checkResult": "적합" | "부적합" | "해당없음" | null,
      "value": "측정값 (있으면)",
      "note": "비고/특이사항"
    }
  ],
  "remarks": "전체 비고사항",
  "signature": "서명자 (읽을 수 있으면)"
}

주의사항:
- 수기 한글을 최대한 정확히 인식하세요
- 체크(V, O, ✓) 표시는 "적합", X 표시는 "부적합"으로 변환
- 읽기 어려운 부분은 "[판독불가]"로 표시
- 날짜가 없으면 null로 설정`
        },
        {
          role: "user",
          content: [
            { type: "text", text: "이 수기 체크리스트를 분석하여 JSON으로 변환해주세요." },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" } }
          ]
        }
      ]
    });

    const content = response.choices[0]?.message?.content || "";

    // JSON 추출
    let structuredData: Record<string, any> = {};
    let confidence = 0.5;

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        structuredData = JSON.parse(jsonMatch[0]);
        // 항목 수 기반 신뢰도 추정
        const items = structuredData.items || [];
        const filledItems = items.filter((i: any) => i.checkResult !== null);
        confidence = items.length > 0 ? Math.min(0.95, 0.5 + (filledItems.length / items.length) * 0.45) : 0.3;
      } catch {
        confidence = 0.2;
      }
    }

    // PDF 변환 임시 파일 정리
    if (tempFile && fs.existsSync(tempFile)) {
      try { fs.unlinkSync(tempFile); } catch {}
    }

    return {
      success: true,
      rawText: content,
      structuredData,
      confidence,
    };
  } catch (error: any) {
    return {
      success: false,
      rawText: "",
      structuredData: {},
      confidence: 0,
      error: error.message || "OCR 처리 중 오류가 발생했습니다.",
    };
  }
}
