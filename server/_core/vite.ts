import express, { type Express } from "express";
import fs from "fs";
import { type Server } from "http";
import { nanoid } from "nanoid";
import path from "path";
import { createServer as createViteServer } from "vite";
import viteConfig from "../../vite.config";

// ─── Route-specific OG meta tags for SNS crawlers (Kakao, Facebook, etc.) ───
const BASE_URL = "https://millioai.com";
const OG_IMAGE = `${BASE_URL}/og-image.jpg`;

interface PageMeta {
  title: string;
  description: string;
  url?: string;
  image?: string;
}

function getPageMeta(pathname: string): PageMeta {
  // Landing page
  if (pathname === "/" || pathname === "") {
    return {
      title: "Millio AI | 식품 제조 관리 통합 플랫폼",
      description: "엑셀·수기 관리에서 벗어나세요. 생산관리, HACCP 기록, 재고관리, LOT 추적, 회계까지 하나의 클라우드 플랫폼으로 통합합니다. 30일 무료 체험.",
    };
  }
  // FAQ
  if (pathname === "/faq") {
    return {
      title: "자주 묻는 질문 (FAQ) | Millio AI",
      description: "Millio AI 서비스 이용에 대한 자주 묻는 질문과 답변을 확인하세요. 요금, 기능, 시작 방법, 기술 지원 등에 대한 정보를 제공합니다.",
      url: `${BASE_URL}/faq`,
    };
  }
  // Support
  if (pathname === "/support") {
    return {
      title: "고객 지원 / 문의 게시판 | Millio AI",
      description: "Millio AI 고객 지원 센터입니다. 서비스 이용 중 궁금한 점이나 문제가 있으시면 문의해 주세요. 평일 09:00~18:00 운영.",
      url: `${BASE_URL}/support`,
    };
  }
  // Legal pages
  if (pathname.startsWith("/legal/")) {
    const legalMap: Record<string, PageMeta> = {
      "/legal/terms": { title: "이용약관 | Millio AI", description: "Millio AI 서비스 이용약관입니다. 서비스 이용 조건, 사용자 권리 및 의무 등을 안내합니다." },
      "/legal/privacy": { title: "개인정보처리방침 | Millio AI", description: "Millio AI 개인정보처리방침입니다. 수집하는 개인정보, 이용 목적, 보관 기간 등을 안내합니다." },
      "/legal/refund": { title: "환불정책 | Millio AI", description: "Millio AI 환불정책입니다. 환불 조건, 절차, 처리 기간 등을 안내합니다." },
      "/legal/sla": { title: "SLA 정책 | Millio AI", description: "Millio AI 서비스 수준 협약(SLA)입니다. 서비스 가용성 99.5% 보장 등을 안내합니다." },
      "/legal/security": { title: "데이터 보안 정책 | Millio AI", description: "Millio AI 데이터 보안 정책입니다. 암호화, 접근 제어, 보안 감사 등을 안내합니다." },
      "/legal/aup": { title: "서비스 이용 정책 (AUP) | Millio AI", description: "Millio AI 서비스 이용 정책(Acceptable Use Policy)입니다." },
      "/legal/dpa": { title: "데이터 처리 계약 (DPA) | Millio AI", description: "Millio AI 데이터 처리 계약(DPA)입니다. GDPR 및 개인정보보호법 준수를 안내합니다." },
      "/legal/security-whitepaper": { title: "보안 백서 | Millio AI", description: "Millio AI 보안 백서입니다. 보안 아키텍처, 인증, 암호화 등 기술적 보안 조치를 안내합니다." },
      "/legal/data-ownership": { title: "데이터 소유권 정책 | Millio AI", description: "Millio AI 데이터 소유권 정책입니다. 고객 데이터에 대한 소유권과 권리를 안내합니다." },
    };
    if (legalMap[pathname]) {
      return { ...legalMap[pathname], url: `${BASE_URL}${pathname}` };
    }
  }
  // Login
  if (pathname === "/login") {
    return {
      title: "로그인 | Millio AI",
      description: "Millio AI 로그인 페이지입니다. 식품 제조 관리 통합 플랫폼에 접속하세요.",
      url: `${BASE_URL}/login`,
    };
  }
  // Register
  if (pathname === "/register") {
    return {
      title: "회원가입 | Millio AI",
      description: "Millio AI에 가입하세요. 30일 무료 체험으로 식품 제조 관리의 새로운 기준을 경험하세요.",
      url: `${BASE_URL}/register`,
    };
  }
  // Default
  return {
    title: "Millio AI | 식품 제조 관리 통합 플랫폼",
    description: "엑셀·수기 관리에서 벗어나세요. 생산관리, HACCP 기록, 재고관리, LOT 추적, 회계까지 하나의 클라우드 플랫폼으로 통합합니다.",
  };
}

function injectMetaTags(html: string, pathname: string): string {
  const meta = getPageMeta(pathname);
  const url = meta.url || BASE_URL;
  const image = meta.image || OG_IMAGE;

  // Replace existing meta tags in <head>
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${meta.title}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*" \/>/,
    `<meta name="description" content="${meta.description}" />`
  );
  html = html.replace(
    /<meta property="og:title" content="[^"]*" \/>/,
    `<meta property="og:title" content="${meta.title}" />`
  );
  html = html.replace(
    /<meta property="og:description" content="[^"]*" \/>/,
    `<meta property="og:description" content="${meta.description}" />`
  );
  html = html.replace(
    /<meta property="og:url" content="[^"]*" \/>/,
    `<meta property="og:url" content="${url}" />`
  );
  html = html.replace(
    /<meta property="og:image" content="[^"]*" \/>/,
    `<meta property="og:image" content="${image}" />`
  );
  html = html.replace(
    /<meta name="twitter:title" content="[^"]*" \/>/,
    `<meta name="twitter:title" content="${meta.title}" />`
  );
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*" \/>/,
    `<meta name="twitter:description" content="${meta.description}" />`
  );
  html = html.replace(
    /<meta name="twitter:image" content="[^"]*" \/>/,
    `<meta name="twitter:image" content="${image}" />`
  );

  return html;
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`
      );
      // Inject route-specific meta tags for SNS crawlers
      template = injectMetaTags(template, new URL(url, "http://localhost").pathname);
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  // Inject route-specific meta tags for SNS crawlers (Kakao, Facebook, etc.)
  app.use("*", (req, res) => {
    const indexPath = path.resolve(distPath, "index.html");
    let html = fs.readFileSync(indexPath, "utf-8");
    html = injectMetaTags(html, req.originalUrl);
    res.status(200).set({ "Content-Type": "text/html" }).end(html);
  });
}
