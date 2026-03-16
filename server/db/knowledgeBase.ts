/**
 * Knowledge Base (RAG) 서비스
 *
 * 문서 업로드 → 청크 분할 → 임베딩 생성 → 벡터 검색
 * MySQL 기반 (JSON 배열로 임베딩 저장, 코사인 유사도 앱 레벨 계산)
 */

import { getRawConnection } from "./connection";
import { ENV } from "../_core/env";
import { invokeLLM } from "../_core/llm";

// ============================================================================
// 타입 정의
// ============================================================================

export interface KBDocument {
  id: number;
  tenantId: number;
  title: string;
  description?: string;
  docType: string;
  content: string;
  sourceUrl?: string;
  sourceFile?: string;
  chunkCount: number;
  totalTokens: number;
  status: string;
  isActive: number;
  isGlobal: number;
  createdAt: string;
}

export interface KBChunk {
  id: number;
  documentId: number;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[] | null;
  metadata: {
    section?: string;
    pageNumber?: number;
    keywords?: string[];
    category?: string;
  } | null;
}

export interface SearchResult {
  chunkId: number;
  documentId: number;
  documentTitle: string;
  docType: string;
  content: string;
  score: number;
  metadata: KBChunk["metadata"];
}

// ============================================================================
// 1. 임베딩 생성 (OpenAI text-embedding-3-small)
// ============================================================================

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIM = 1536;

/**
 * OpenAI 임베딩 API 호출 (배치 지원)
 */
async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  const apiUrl = ENV.forgeApiUrl && ENV.forgeApiUrl.trim().length > 0
    ? `${ENV.forgeApiUrl.replace(/\/$/, "")}/v1/embeddings`
    : "https://api.openai.com/v1/embeddings";

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${ENV.forgeApiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API failed: ${response.status} – ${errorText}`);
  }

  const result = await response.json() as {
    data: Array<{ embedding: number[]; index: number }>;
    usage?: { total_tokens: number };
  };

  // 인덱스 순서대로 정렬
  return result.data
    .sort((a, b) => a.index - b.index)
    .map(d => d.embedding);
}

/**
 * 단일 텍스트 임베딩
 */
async function generateEmbedding(text: string): Promise<number[]> {
  const [embedding] = await generateEmbeddings([text]);
  return embedding;
}

// ============================================================================
// 2. 텍스트 청크 분할
// ============================================================================

const CHUNK_SIZE = 500;       // 토큰 단위 (대략 한국어 500자 ≈ 250~350 토큰)
const CHUNK_OVERLAP = 50;     // 오버랩 문자 수

/**
 * 텍스트를 의미 단위로 청크 분할
 * - 문단/섹션 경계 우선
 * - 오버랩으로 문맥 연결 유지
 */
export function splitIntoChunks(text: string, maxChars: number = CHUNK_SIZE): Array<{
  content: string;
  section?: string;
}> {
  const chunks: Array<{ content: string; section?: string }> = [];

  // 섹션 헤더 패턴 (한국어 문서)
  const sectionPattern = /^(?:제\s*\d+[조항장절편]\s*|[0-9]+[.\)]\s*|[가-힣]+\s*[0-9]+[.\)]\s*|#{1,3}\s+|■\s*|●\s*|◆\s*|[IVXLCDM]+\.\s*|\d+\.\d+\s*)/m;

  // 먼저 줄바꿈 2개 이상으로 문단 분리
  const paragraphs = text.split(/\n{2,}/);
  let currentChunk = "";
  let currentSection = "";

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 섹션 헤더 감지
    const sectionMatch = trimmed.match(sectionPattern);
    if (sectionMatch) {
      // 기존 청크 저장
      if (currentChunk.trim()) {
        chunks.push({ content: currentChunk.trim(), section: currentSection || undefined });
      }
      currentSection = trimmed.split("\n")[0].slice(0, 100);
      currentChunk = trimmed;
      continue;
    }

    // 청크 크기 초과 시 분할
    if ((currentChunk + "\n\n" + trimmed).length > maxChars) {
      if (currentChunk.trim()) {
        chunks.push({ content: currentChunk.trim(), section: currentSection || undefined });
      }
      // 오버랩: 이전 청크의 마지막 부분을 가져옴
      const overlap = currentChunk.slice(-CHUNK_OVERLAP);
      currentChunk = overlap + "\n\n" + trimmed;
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmed;
    }
  }

  // 마지막 청크
  if (currentChunk.trim()) {
    chunks.push({ content: currentChunk.trim(), section: currentSection || undefined });
  }

  // 너무 긴 청크는 강제 분할
  const finalChunks: Array<{ content: string; section?: string }> = [];
  for (const chunk of chunks) {
    if (chunk.content.length > maxChars * 2) {
      // 문장 단위로 분할
      const sentences = chunk.content.split(/(?<=[.!?。])\s+/);
      let subChunk = "";
      for (const sentence of sentences) {
        if ((subChunk + " " + sentence).length > maxChars) {
          if (subChunk.trim()) {
            finalChunks.push({ content: subChunk.trim(), section: chunk.section });
          }
          subChunk = sentence;
        } else {
          subChunk += (subChunk ? " " : "") + sentence;
        }
      }
      if (subChunk.trim()) {
        finalChunks.push({ content: subChunk.trim(), section: chunk.section });
      }
    } else {
      finalChunks.push(chunk);
    }
  }

  return finalChunks;
}

/**
 * 대략적 토큰 수 추정 (한국어: 1글자 ≈ 0.5~1 토큰)
 */
function estimateTokens(text: string): number {
  // 한국어 문자 수 * 0.7 + 영문 단어 수 * 1.3
  const koreanChars = (text.match(/[\uAC00-\uD7AF]/g) || []).length;
  const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
  const numbers = (text.match(/\d+/g) || []).length;
  return Math.ceil(koreanChars * 0.7 + englishWords * 1.3 + numbers * 0.5);
}

// ============================================================================
// 3. 코사인 유사도 계산
// ============================================================================

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ============================================================================
// 4. 문서 관리 CRUD
// ============================================================================

/**
 * 문서 업로드 + 자동 청크 분할 + 임베딩 생성
 */
export async function uploadDocument(
  tenantId: number,
  params: {
    title: string;
    description?: string;
    docType: string;
    content: string;
    sourceUrl?: string;
    sourceFile?: string;
    isGlobal?: boolean;
    createdBy?: number;
  }
): Promise<{ documentId: number; chunkCount: number; status: string }> {
  const conn = await getRawConnection();

  // 1. 문서 저장
  const [insertResult] = await conn.execute(
    `INSERT INTO ai_knowledge_documents
       (tenant_id, title, description, doc_type, content, source_url, source_file,
        is_global, created_by, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'chunking', NOW(), NOW())`,
    [
      tenantId,
      params.title,
      params.description || null,
      params.docType,
      params.content,
      params.sourceUrl || null,
      params.sourceFile || null,
      params.isGlobal ? 1 : 0,
      params.createdBy || null,
    ]
  );
  const documentId = (insertResult as any).insertId;

  try {
    // 2. 청크 분할
    const chunks = splitIntoChunks(params.content);
    let totalTokens = 0;

    // 3. 키워드 추출 (LLM으로 각 청크의 핵심 키워드 추출)
    // 배치로 처리하되, 비용 절감을 위해 청크 5개씩 묶어서 키워드 추출
    const chunkTexts = chunks.map(c => c.content);
    const keywordsMap = await extractKeywordsBatch(chunkTexts);

    // 4. 임베딩 생성 (배치, 최대 20개씩)
    const BATCH_SIZE = 20;
    const allEmbeddings: number[][] = [];

    for (let i = 0; i < chunkTexts.length; i += BATCH_SIZE) {
      const batch = chunkTexts.slice(i, i + BATCH_SIZE);
      try {
        const embeddings = await generateEmbeddings(batch);
        allEmbeddings.push(...embeddings);
      } catch (error) {
        console.error(`[KB] Embedding batch ${i} failed:`, error);
        // 실패한 배치는 null 벡터로 채움
        allEmbeddings.push(...batch.map(() => []));
      }
    }

    // 5. 청크 + 임베딩 DB 저장
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const tokens = estimateTokens(chunk.content);
      totalTokens += tokens;

      const metadata = {
        section: chunk.section,
        keywords: keywordsMap[i] || [],
      };

      await conn.execute(
        `INSERT INTO ai_knowledge_chunks
           (tenant_id, document_id, chunk_index, content, token_count, embedding, metadata, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          tenantId,
          documentId,
          i,
          chunk.content,
          tokens,
          allEmbeddings[i]?.length > 0 ? JSON.stringify(allEmbeddings[i]) : null,
          JSON.stringify(metadata),
        ]
      );
    }

    // 6. 문서 상태 업데이트
    const hasAllEmbeddings = allEmbeddings.every(e => e.length > 0);
    await conn.execute(
      `UPDATE ai_knowledge_documents
       SET chunk_count = ?, total_tokens = ?, status = ?, updated_at = NOW()
       WHERE id = ?`,
      [chunks.length, totalTokens, hasAllEmbeddings ? "ready" : "error", documentId]
    );

    return {
      documentId,
      chunkCount: chunks.length,
      status: hasAllEmbeddings ? "ready" : "partial_embeddings",
    };
  } catch (error: any) {
    // 오류 시 문서 상태를 error로 변경
    await conn.execute(
      `UPDATE ai_knowledge_documents SET status = 'error', updated_at = NOW() WHERE id = ?`,
      [documentId]
    );
    throw error;
  }
}

/**
 * 배치 키워드 추출 (LLM으로 여러 청크의 핵심 키워드를 한번에 추출)
 */
async function extractKeywordsBatch(chunks: string[]): Promise<string[][]> {
  if (chunks.length === 0) return [];

  // 비용 절감: 10개씩 묶어서 LLM 호출
  const BATCH = 10;
  const allKeywords: string[][] = [];

  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    try {
      const prompt = batch.map((c, idx) =>
        `[청크 ${idx + 1}]\n${c.slice(0, 300)}`
      ).join("\n\n---\n\n");

      const result = await invokeLLM({
        messages: [
          {
            role: "system",
            content: `각 청크에서 핵심 키워드를 3~5개씩 추출하세요.
JSON 배열의 배열로 응답하세요. 예: [["HACCP", "온도관리"], ["CCP", "모니터링"]]
반드시 JSON만 응답하세요.`,
          },
          { role: "user", content: prompt },
        ],
        maxTokens: 1000,
      });

      const text = typeof result.choices[0]?.message?.content === "string"
        ? result.choices[0].message.content
        : "";

      try {
        const parsed = JSON.parse(text.replace(/```json?\n?|\n?```/g, "").trim());
        if (Array.isArray(parsed)) {
          allKeywords.push(...parsed.map((k: any) => Array.isArray(k) ? k : []));
          continue;
        }
      } catch {}

      // 파싱 실패 시 빈 키워드
      allKeywords.push(...batch.map(() => []));
    } catch {
      allKeywords.push(...batch.map(() => []));
    }
  }

  return allKeywords;
}

/**
 * 문서 목록 조회
 */
export async function listDocuments(
  tenantId: number,
  options?: { docType?: string; status?: string; limit?: number; offset?: number }
): Promise<{ documents: KBDocument[]; total: number }> {
  const conn = await getRawConnection();

  const conditions = ["(tenant_id = ? OR is_global = 1)"];
  const params: any[] = [tenantId];

  if (options?.docType) {
    conditions.push("doc_type = ?");
    params.push(options.docType);
  }
  if (options?.status) {
    conditions.push("status = ?");
    params.push(options.status);
  }

  const whereClause = conditions.join(" AND ");

  const [countRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM ai_knowledge_documents WHERE ${whereClause} AND is_active = 1`,
    params
  );
  const total = (countRows as any[])[0]?.cnt || 0;

  const [rows] = await conn.execute(
    `SELECT id, tenant_id, title, description, doc_type, source_url, source_file,
            chunk_count, total_tokens, status, is_active, is_global, created_at, updated_at
     FROM ai_knowledge_documents
     WHERE ${whereClause} AND is_active = 1
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, options?.limit || 50, options?.offset || 0]
  );

  return {
    documents: (rows as any[]).map(r => ({
      id: r.id,
      tenantId: r.tenant_id,
      title: r.title,
      description: r.description,
      docType: r.doc_type,
      content: "", // 목록에서는 본문 제외
      sourceUrl: r.source_url,
      sourceFile: r.source_file,
      chunkCount: r.chunk_count,
      totalTokens: r.total_tokens,
      status: r.status,
      isActive: r.is_active,
      isGlobal: r.is_global,
      createdAt: r.created_at,
    })),
    total,
  };
}

/**
 * 문서 상세 조회
 */
export async function getDocument(tenantId: number, documentId: number): Promise<KBDocument | null> {
  const conn = await getRawConnection();
  const [rows] = await conn.execute(
    `SELECT * FROM ai_knowledge_documents WHERE id = ? AND (tenant_id = ? OR is_global = 1)`,
    [documentId, tenantId]
  );
  const row = (rows as any[])[0];
  if (!row) return null;
  return {
    id: row.id,
    tenantId: row.tenant_id,
    title: row.title,
    description: row.description,
    docType: row.doc_type,
    content: row.content,
    sourceUrl: row.source_url,
    sourceFile: row.source_file,
    chunkCount: row.chunk_count,
    totalTokens: row.total_tokens,
    status: row.status,
    isActive: row.is_active,
    isGlobal: row.is_global,
    createdAt: row.created_at,
  };
}

/**
 * 문서 삭제 (소프트 삭제)
 */
export async function deleteDocument(tenantId: number, documentId: number): Promise<boolean> {
  const conn = await getRawConnection();
  const [result] = await conn.execute(
    `UPDATE ai_knowledge_documents SET is_active = 0, updated_at = NOW()
     WHERE id = ? AND tenant_id = ?`,
    [documentId, tenantId]
  );
  return (result as any).affectedRows > 0;
}

// ============================================================================
// 5. 벡터 검색 (RAG 핵심)
// ============================================================================

/**
 * 시맨틱 검색 - 질문에 가장 관련된 청크를 찾음
 *
 * 1. 질문 임베딩 생성
 * 2. DB에서 해당 테넌트의 모든 청크 임베딩 로드
 * 3. 코사인 유사도 계산
 * 4. 상위 N개 반환
 */
export async function searchKnowledge(
  tenantId: number,
  query: string,
  options?: {
    topK?: number;
    minScore?: number;
    docType?: string;
    documentIds?: number[];
  }
): Promise<SearchResult[]> {
  const conn = await getRawConnection();
  const topK = options?.topK || 5;
  const minScore = options?.minScore || 0.3;

  // 1. 쿼리 임베딩 생성
  let queryEmbedding: number[];
  try {
    queryEmbedding = await generateEmbedding(query);
  } catch (error) {
    console.error("[KB] Query embedding failed, falling back to keyword search:", error);
    return keywordSearch(tenantId, query, topK);
  }

  // 2. 해당 테넌트의 활성 청크 로드 (임베딩 포함)
  const conditions = ["c.tenant_id = ? OR d.is_global = 1"];
  const params: any[] = [tenantId];

  if (options?.docType) {
    conditions.push("d.doc_type = ?");
    params.push(options.docType);
  }

  if (options?.documentIds && options.documentIds.length > 0) {
    conditions.push(`c.document_id IN (${options.documentIds.map(() => "?").join(",")})`);
    params.push(...options.documentIds);
  }

  const [rows] = await conn.execute(
    `SELECT c.id, c.document_id, c.content, c.embedding, c.metadata,
            d.title as doc_title, d.doc_type
     FROM ai_knowledge_chunks c
     JOIN ai_knowledge_documents d ON c.document_id = d.id
     WHERE (${conditions.join(" AND ")})
       AND d.is_active = 1
       AND d.status = 'ready'
       AND c.embedding IS NOT NULL`,
    params
  );

  // 3. 코사인 유사도 계산
  const scored: SearchResult[] = [];
  for (const row of rows as any[]) {
    let embedding: number[];
    try {
      embedding = typeof row.embedding === "string"
        ? JSON.parse(row.embedding)
        : row.embedding;
    } catch {
      continue;
    }

    if (!embedding || embedding.length === 0) continue;

    const score = cosineSimilarity(queryEmbedding, embedding);
    if (score >= minScore) {
      scored.push({
        chunkId: row.id,
        documentId: row.document_id,
        documentTitle: row.doc_title,
        docType: row.doc_type,
        content: row.content,
        score,
        metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
      });
    }
  }

  // 4. 점수순 정렬 + 상위 K개
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}

/**
 * 키워드 기반 폴백 검색 (임베딩 실패 시)
 */
async function keywordSearch(
  tenantId: number,
  query: string,
  limit: number
): Promise<SearchResult[]> {
  const conn = await getRawConnection();

  // 질문에서 핵심 키워드 추출 (간단한 방식)
  const keywords = query
    .replace(/[?!.。]/g, "")
    .split(/\s+/)
    .filter(w => w.length >= 2);

  if (keywords.length === 0) return [];

  const likeConditions = keywords.map(() => "c.content LIKE ?").join(" OR ");
  const likeParams = keywords.map(k => `%${k}%`);

  const [rows] = await conn.execute(
    `SELECT c.id, c.document_id, c.content, c.metadata,
            d.title as doc_title, d.doc_type,
            (${keywords.map(() => "(c.content LIKE ?)").join(" + ")}) as match_count
     FROM ai_knowledge_chunks c
     JOIN ai_knowledge_documents d ON c.document_id = d.id
     WHERE (c.tenant_id = ? OR d.is_global = 1)
       AND d.is_active = 1
       AND (${likeConditions})
     ORDER BY match_count DESC
     LIMIT ?`,
    [...likeParams, tenantId, ...likeParams, limit]
  );

  return (rows as any[]).map((row, idx) => ({
    chunkId: row.id,
    documentId: row.document_id,
    documentTitle: row.doc_title,
    docType: row.doc_type,
    content: row.content,
    score: 0.5 - idx * 0.05, // 대략적 점수
    metadata: typeof row.metadata === "string" ? JSON.parse(row.metadata) : row.metadata,
  }));
}

// ============================================================================
// 6. RAG 컨텍스트 빌더 (챗봇 파이프라인 통합용)
// ============================================================================

/**
 * 사용자 질문에 대한 관련 지식 컨텍스트 생성
 * AI Action Engine에서 호출하여 시스템 프롬프트에 삽입
 */
export async function buildKnowledgeContext(
  tenantId: number,
  query: string,
  options?: { topK?: number; docType?: string }
): Promise<{
  hasContext: boolean;
  contextText: string;
  sources: Array<{ title: string; docType: string; score: number }>;
}> {
  try {
    const results = await searchKnowledge(tenantId, query, {
      topK: options?.topK || 3,
      minScore: 0.35,
      docType: options?.docType,
    });

    if (results.length === 0) {
      return { hasContext: false, contextText: "", sources: [] };
    }

    const contextText = results
      .map((r, i) => `[참고자료 ${i + 1}: ${r.documentTitle}]\n${r.content}`)
      .join("\n\n---\n\n");

    const sources = results.map(r => ({
      title: r.documentTitle,
      docType: r.docType,
      score: Math.round(r.score * 100) / 100,
    }));

    return { hasContext: true, contextText, sources };
  } catch (error) {
    console.error("[KB] buildKnowledgeContext failed:", error);
    return { hasContext: false, contextText: "", sources: [] };
  }
}

/**
 * 문서 재인덱싱 (임베딩 재생성)
 */
export async function reindexDocument(tenantId: number, documentId: number): Promise<{
  success: boolean;
  chunksUpdated: number;
}> {
  const conn = await getRawConnection();

  // 문서 확인
  const [docRows] = await conn.execute(
    `SELECT id, content FROM ai_knowledge_documents WHERE id = ? AND tenant_id = ?`,
    [documentId, tenantId]
  );
  const doc = (docRows as any[])[0];
  if (!doc) throw new Error("Document not found");

  // 기존 청크 삭제
  await conn.execute(
    `DELETE FROM ai_knowledge_chunks WHERE document_id = ? AND tenant_id = ?`,
    [documentId, tenantId]
  );

  // 상태 업데이트
  await conn.execute(
    `UPDATE ai_knowledge_documents SET status = 'chunking', updated_at = NOW() WHERE id = ?`,
    [documentId]
  );

  // 재청크 + 재임베딩
  const chunks = splitIntoChunks(doc.content);
  const chunkTexts = chunks.map(c => c.content);
  const keywordsMap = await extractKeywordsBatch(chunkTexts);

  const BATCH_SIZE = 20;
  const allEmbeddings: number[][] = [];
  for (let i = 0; i < chunkTexts.length; i += BATCH_SIZE) {
    const batch = chunkTexts.slice(i, i + BATCH_SIZE);
    try {
      const embeddings = await generateEmbeddings(batch);
      allEmbeddings.push(...embeddings);
    } catch {
      allEmbeddings.push(...batch.map(() => []));
    }
  }

  let totalTokens = 0;
  for (let i = 0; i < chunks.length; i++) {
    const tokens = estimateTokens(chunks[i].content);
    totalTokens += tokens;

    await conn.execute(
      `INSERT INTO ai_knowledge_chunks
         (tenant_id, document_id, chunk_index, content, token_count, embedding, metadata, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        tenantId,
        documentId,
        i,
        chunks[i].content,
        tokens,
        allEmbeddings[i]?.length > 0 ? JSON.stringify(allEmbeddings[i]) : null,
        JSON.stringify({ section: chunks[i].section, keywords: keywordsMap[i] || [] }),
      ]
    );
  }

  const hasAll = allEmbeddings.every(e => e.length > 0);
  await conn.execute(
    `UPDATE ai_knowledge_documents
     SET chunk_count = ?, total_tokens = ?, status = ?, updated_at = NOW()
     WHERE id = ?`,
    [chunks.length, totalTokens, hasAll ? "ready" : "error", documentId]
  );

  return { success: hasAll, chunksUpdated: chunks.length };
}

/**
 * Knowledge Base 통계
 */
export async function getKBStats(tenantId: number): Promise<{
  totalDocuments: number;
  readyDocuments: number;
  totalChunks: number;
  totalTokens: number;
  byDocType: Array<{ docType: string; count: number }>;
}> {
  const conn = await getRawConnection();

  const [totalRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM ai_knowledge_documents
     WHERE (tenant_id = ? OR is_global = 1) AND is_active = 1`,
    [tenantId]
  );

  const [readyRows] = await conn.execute(
    `SELECT COUNT(*) as cnt FROM ai_knowledge_documents
     WHERE (tenant_id = ? OR is_global = 1) AND is_active = 1 AND status = 'ready'`,
    [tenantId]
  );

  const [chunkRows] = await conn.execute(
    `SELECT COUNT(*) as cnt, COALESCE(SUM(c.token_count), 0) as tokens
     FROM ai_knowledge_chunks c
     JOIN ai_knowledge_documents d ON c.document_id = d.id
     WHERE (c.tenant_id = ? OR d.is_global = 1) AND d.is_active = 1`,
    [tenantId]
  );

  const [typeRows] = await conn.execute(
    `SELECT doc_type, COUNT(*) as cnt FROM ai_knowledge_documents
     WHERE (tenant_id = ? OR is_global = 1) AND is_active = 1
     GROUP BY doc_type ORDER BY cnt DESC`,
    [tenantId]
  );

  return {
    totalDocuments: (totalRows as any[])[0]?.cnt || 0,
    readyDocuments: (readyRows as any[])[0]?.cnt || 0,
    totalChunks: (chunkRows as any[])[0]?.cnt || 0,
    totalTokens: (chunkRows as any[])[0]?.tokens || 0,
    byDocType: (typeRows as any[]).map(r => ({ docType: r.doc_type, count: r.cnt })),
  };
}
