import { Router } from "express";
import { db } from "../db";

const router = Router();

// 테이블 자동 생성
db.exec(`
  CREATE TABLE IF NOT EXISTS training_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id INTEGER NOT NULL,
    educator TEXT NOT NULL,
    location TEXT NOT NULL,
    training_date TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    target_audience TEXT NOT NULL,
    category TEXT NOT NULL,
    material TEXT NOT NULL,
    topic_1 TEXT,
    topic_2 TEXT,
    topic_3 TEXT,
    topic_4 TEXT,
    content_summary TEXT,
    content_result TEXT,
    evidence_photos TEXT,
    attendees TEXT,
    concentration TEXT,
    understanding TEXT,
    application TEXT,
    improvement_action TEXT,
    status TEXT DEFAULT '작성중',
    creator TEXT,
    reviewer TEXT,
    approver TEXT,
    approved_at TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

// 교육훈련일지 작성
router.post("/create", async (req, res) => {
  try {
    const {
      tenantId,
      educator,
      location,
      trainingDate,
      startTime,
      endTime,
      targetAudience,
      category,
      material,
      topic1,
      topic2,
      topic3,
      topic4,
      contentSummary,
      contentResult,
      evidencePhotos,
      attendees,
      concentration,
      understanding,
      application,
      improvementAction,
      creator,
    } = req.body;

    const result = db
      .prepare(
        `INSERT INTO training_logs (
          tenant_id, educator, location, training_date, start_time, end_time,
          target_audience, category, material, topic_1, topic_2, topic_3, topic_4,
          content_summary, content_result, evidence_photos, attendees,
          concentration, understanding, application, improvement_action, creator
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        tenantId,
        educator,
        location,
        trainingDate,
        startTime,
        endTime,
        targetAudience,
        category,
        material,
        topic1,
        topic2,
        topic3,
        topic4,
        contentSummary,
        contentResult,
        JSON.stringify(evidencePhotos || []),
        JSON.stringify(attendees || []),
        concentration,
        understanding,
        application,
        improvementAction,
        creator
      );

    res.json({ success: true, id: result.lastInsertRowid });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 조회
router.get("/get", async (req, res) => {
  try {
    const { tenantId, startDate, endDate, status } = req.query;

    let query = "SELECT * FROM training_logs WHERE tenant_id = ?";
    const params: any[] = [tenantId];

    if (startDate) {
      query += " AND training_date >= ?";
      params.push(startDate);
    }

    if (endDate) {
      query += " AND training_date <= ?";
      params.push(endDate);
    }

    if (status && status !== "all") {
      query += " AND status = ?";
      params.push(status);
    }

    query += " ORDER BY training_date DESC, created_at DESC";

    const logs = db.prepare(query).all(...params);

    // JSON 파싱
    const parsedLogs = logs.map((log: any) => ({
      ...log,
      evidencePhotos: JSON.parse(log.evidence_photos || "[]"),
      attendees: JSON.parse(log.attendees || "[]"),
    }));

    res.json(parsedLogs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 수정
router.put("/update", async (req, res) => {
  try {
    const {
      id,
      educator,
      location,
      trainingDate,
      startTime,
      endTime,
      targetAudience,
      category,
      material,
      topic1,
      topic2,
      topic3,
      topic4,
      contentSummary,
      contentResult,
      evidencePhotos,
      attendees,
      concentration,
      understanding,
      application,
      improvementAction,
    } = req.body;

    db.prepare(
      `UPDATE training_logs SET
        educator = ?, location = ?, training_date = ?, start_time = ?, end_time = ?,
        target_audience = ?, category = ?, material = ?, topic_1 = ?, topic_2 = ?,
        topic_3 = ?, topic_4 = ?, content_summary = ?, content_result = ?,
        evidence_photos = ?, attendees = ?, concentration = ?, understanding = ?,
        application = ?, improvement_action = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).run(
      educator,
      location,
      trainingDate,
      startTime,
      endTime,
      targetAudience,
      category,
      material,
      topic1,
      topic2,
      topic3,
      topic4,
      contentSummary,
      contentResult,
      JSON.stringify(evidencePhotos || []),
      JSON.stringify(attendees || []),
      concentration,
      understanding,
      application,
      improvementAction,
      id
    );

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 삭제
router.delete("/delete", async (req, res) => {
  try {
    const { id } = req.query;

    db.prepare("DELETE FROM training_logs WHERE id = ?").run(id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 승인
router.post("/approve", async (req, res) => {
  try {
    const { id, approver } = req.body;

    db.prepare(
      `UPDATE training_logs SET
        status = '승인완료',
        approver = ?,
        approved_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).run(approver, id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 승인 요청
router.post("/requestApproval", async (req, res) => {
  try {
    const { id } = req.body;

    db.prepare(
      `UPDATE training_logs SET
        status = '승인대기',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).run(id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 교육훈련일지 반려
router.post("/reject", async (req, res) => {
  try {
    const { id } = req.body;

    db.prepare(
      `UPDATE training_logs SET
        status = '작성중',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?`
    ).run(id);

    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
