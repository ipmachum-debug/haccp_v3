/**
 * 비용전표 첨부파일 업로드 REST API
 * tRPC는 파일 업로드를 직접 지원하지 않으므로 Express REST 엔드포인트로 구현
 */
import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { getRawConnection } from "../db";

// 업로드 디렉토리 설정
const UPLOAD_DIR = path.join(process.cwd(), "uploads", "expense");

// 디렉토리 자동 생성
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// multer 설정
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `exp-${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const allowed = [
      "image/jpeg", "image/png", "image/gif", "image/webp",
      "application/pdf",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain", "text/csv",
    ];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`허용되지 않는 파일 형식입니다: ${file.mimetype}`));
    }
  },
});

const expenseUploadRouter = Router();

/**
 * POST /api/expense/upload
 * 비용전표 첨부파일 업로드
 */
expenseUploadRouter.post(
  "/upload",
  upload.array("files", 5), // 최대 5개 동시 업로드
  async (req: Request, res: Response) => {
    try {
      const tenantId = (req as any).session?.tenantId || (req as any).user?.tenantId;
      const userId = (req as any).session?.userId || (req as any).user?.id;
      const voucherId = req.body.voucherId;

      if (!tenantId || !userId) {
        return res.status(401).json({ error: "인증이 필요합니다." });
      }
      if (!voucherId) {
        return res.status(400).json({ error: "voucherId가 필요합니다." });
      }

      const files = req.files as Express.Multer.File[];
      if (!files || files.length === 0) {
        return res.status(400).json({ error: "파일이 없습니다." });
      }

      const conn = await getRawConnection();
      const results: any[] = [];

      for (const file of files) {
        const fileKey = file.filename;
        const fileUrl = `/uploads/expense/${file.filename}`;

        const [insResult] = await conn.execute(
          `INSERT INTO expense_attachments
             (tenant_id, voucher_id, file_key, file_url, file_name, file_size, mime_type, uploaded_by)
           VALUES (?,?,?,?,?,?,?,?)`,
          [tenantId, voucherId, fileKey, fileUrl, file.originalname, file.size, file.mimetype, userId],
        );

        results.push({
          id: Number((insResult as any).insertId),
          fileKey,
          fileUrl,
          fileName: file.originalname,
          fileSize: file.size,
          mimeType: file.mimetype,
        });
      }

      return res.json({ success: true, files: results });
    } catch (err: any) {
      console.error("[ExpenseUpload] Error:", err);
      return res.status(500).json({ error: err.message || "업로드 실패" });
    }
  },
);

/**
 * GET /api/expense/attachments/:voucherId
 * 비용전표 첨부파일 목록 조회
 */
expenseUploadRouter.get("/attachments/:voucherId", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).session?.tenantId || (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: "인증이 필요합니다." });

    const conn = await getRawConnection();
    const [rows] = await conn.execute(
      `SELECT * FROM expense_attachments WHERE voucher_id = ? AND tenant_id = ? ORDER BY id`,
      [req.params.voucherId, tenantId],
    );

    return res.json({ files: rows });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /api/expense/attachments/:id
 * 비용전표 첨부파일 삭제
 */
expenseUploadRouter.delete("/attachments/:id", async (req: Request, res: Response) => {
  try {
    const tenantId = (req as any).session?.tenantId || (req as any).user?.tenantId;
    if (!tenantId) return res.status(401).json({ error: "인증이 필요합니다." });

    const conn = await getRawConnection();

    // 파일 정보 조회
    const [rows] = await conn.execute(
      `SELECT * FROM expense_attachments WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId],
    );
    const attachment = (rows as any[])[0];
    if (!attachment) return res.status(404).json({ error: "첨부파일을 찾을 수 없습니다." });

    // 물리 파일 삭제
    const filePath = path.join(UPLOAD_DIR, attachment.file_key);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    // DB 삭제
    await conn.execute(
      `DELETE FROM expense_attachments WHERE id = ? AND tenant_id = ?`,
      [req.params.id, tenantId],
    );

    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default expenseUploadRouter;
