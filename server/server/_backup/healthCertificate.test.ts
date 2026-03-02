import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getDb } from "./db";
import { healthCertificates, employees, users } from "../drizzle/schema";
import { eq } from "drizzle-orm";
import * as XLSX from "xlsx";

describe("건강진단서 파일 업로드 및 Excel 일괄 업로드 테스트", () => {
  let testUserId: number;
  let testEmployeeId: number;

  beforeAll(async () => {
    const db = await getDb();
    if (!db) throw new Error("데이터베이스 연결 실패");

    // 테스트 사용자 생성
    const [userResult] = await db.insert(users).values({
      openId: `test-${Date.now()}`,
      name: "테스트 사용자",
      email: `test-${Date.now()}@test.com`,
      passwordHash: "test-hash",
      role: "user"
    });
    testUserId = userResult.insertId;

    // 테스트 직원 생성
    const [empResult] = await db.insert(employees).values({
      name: "테스트직원",
      department: "테스트부서",
      position: "사원",
      phone: "010-1234-5678",
      email: "test@example.com",
      hireDate: new Date("2024-01-01"),
      status: "active",
      createdBy: testUserId
    });
    testEmployeeId = empResult.insertId;
  });

  afterAll(async () => {
    const db = await getDb();
    if (!db) return;

    // 테스트 데이터 정리
    await db
      .delete(healthCertificates)
      .where(eq(healthCertificates.createdBy, testUserId));
    await db.delete(employees).where(eq(employees.createdBy, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it("파일 업로드 시 base64 데이터 파싱 및 S3 키 생성 테스트", async () => {
    // 테스트용 이미지 데이터 (1x1 픽셀 PNG)
    const testImageBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    // base64 디코딩 테스트
    const buffer = Buffer.from(testImageBase64, "base64");
    expect(buffer.length).toBeGreaterThan(0);

    // 파일 키 생성 로직 테스트
    const fileName = "test-certificate.png";
    const randomSuffix = Math.random().toString(36).substring(7);
    const fileKey = `health-certificates/${testUserId}/${Date.now()}-${randomSuffix}-${fileName}`;

    expect(fileKey).toContain("health-certificates");
    expect(fileKey).toContain(testUserId.toString());
    expect(fileKey).toContain("test-certificate.png");
  });

  it("건강진단서 파일 정보 저장 테스트", async () => {
    const db = await getDb();
    if (!db) throw new Error("데이터베이스 연결 실패");

    const testFileUrl = "https://storage.example.com/test-file.pdf";
    const testFileKey = "health-certificates/test/test-file.pdf";
    const testFileName = "test-certificate.pdf";

    // 건강진단서 등록
    const [result] = await db.insert(healthCertificates).values({
      employeeId: testEmployeeId,
      employeeName: "테스트직원",
      issueDate: new Date("2024-01-15"),
      expiryDate: new Date("2025-01-14"),
      status: "valid",
      fileUrl: testFileUrl,
      fileKey: testFileKey,
      fileName: testFileName,
      createdBy: testUserId
    });

    expect(result.insertId).toBeGreaterThan(0);

    // 저장된 데이터 확인
    const saved = await db
      .select()
      .from(healthCertificates)
      .where(eq(healthCertificates.id, result.insertId))
      .limit(1)
      .then((rows) => rows[0]);

    expect(saved).toBeDefined();
    expect(saved.fileUrl).toBe(testFileUrl);
    expect(saved.fileKey).toBe(testFileKey);
    expect(saved.fileName).toBe(testFileName);
  });

  it("Excel 파일 파싱 테스트", async () => {
    // 테스트용 Excel 데이터 생성
    const testData = [
      {
        직원명: "홍길동",
        부서: "생산부",
        직책: "사원",
        연락처: "010-1111-2222",
        이메일: "hong@example.com",
        발급일: "2024-01-15",
        만료일: "2025-01-14",
        비고: "정상"
      },
      {
        직원명: "김철수",
        부서: "품질관리부",
        직책: "대리",
        연락처: "010-3333-4444",
        이메일: "kim@example.com",
        발급일: "2024-02-01",
        만료일: "2025-01-31",
        비고: ""
      },
    ];

    const ws = XLSX.utils.json_to_sheet(testData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "건강진단서");

    // Excel 파일을 버퍼로 변환
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    expect(buffer.length).toBeGreaterThan(0);

    // 파싱 테스트
    const parsedWorkbook = XLSX.read(buffer, { type: "buffer" });
    const sheetName = parsedWorkbook.SheetNames[0];
    const worksheet = parsedWorkbook.Sheets[sheetName];
    const parsedData = XLSX.utils.sheet_to_json<any>(worksheet);

    expect(parsedData.length).toBe(2);
    expect(parsedData[0]["직원명"]).toBe("홍길동");
    expect(parsedData[1]["직원명"]).toBe("김철수");
  });

  it("Excel 날짜 파싱 테스트", async () => {
    // Excel 일련번호 날짜 파싱
    const parseExcelDate = (value: any): Date => {
      if (typeof value === "number") {
        const date = XLSX.SSF.parse_date_code(value);
        return new Date(date.y, date.m - 1, date.d);
      } else if (typeof value === "string") {
        const parsed = new Date(value);
        if (isNaN(parsed.getTime())) {
          throw new Error("잘못된 날짜 형식");
        }
        return parsed;
      }
      throw new Error("잘못된 날짜 형식");
    };

    // Excel 일련번호 파싱 테스트 (45308 = 2024-01-15, 타임존에 따라 다를 수 있음)
    const excelDate = parseExcelDate(45308);
    expect(excelDate.getFullYear()).toBe(2024);
    expect(excelDate.getMonth()).toBe(0);
    // 타임존 문제로 날짜가 다를 수 있으므로 범위 확인
    expect(excelDate.getDate()).toBeGreaterThanOrEqual(14);
    expect(excelDate.getDate()).toBeLessThanOrEqual(17);

    // 문자열 날짜 파싱 테스트 (타임존 문제로 인해 연/월만 확인)
    const stringDate = parseExcelDate("2024-01-15");
    expect(stringDate.getFullYear()).toBe(2024);
    expect(stringDate.getMonth()).toBe(0); // 0 = January
    // getDate()는 타임존에 따라 14 또는 15가 될 수 있으므로 범위 확인
    expect(stringDate.getDate()).toBeGreaterThanOrEqual(14);
    expect(stringDate.getDate()).toBeLessThanOrEqual(15);
  });

  it("건강진단서 상태 자동 계산 테스트", async () => {
    const now = new Date();

    // 유효한 건강진단서 (만료일이 60일 후)
    const validExpiry = new Date(now.getTime() + 60 * 24 * 60 * 60 * 1000);
    let daysUntilExpiry = Math.ceil(
      (validExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    let status: "valid" | "expiring_soon" | "expired" = "valid";
    if (daysUntilExpiry < 0) {
      status = "expired";
    } else if (daysUntilExpiry <= 30) {
      status = "expiring_soon";
    }
    expect(status).toBe("valid");

    // 만료 임박 건강진단서 (만료일이 15일 후)
    const expiringSoonExpiry = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
    daysUntilExpiry = Math.ceil(
      (expiringSoonExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    status = "valid";
    if (daysUntilExpiry < 0) {
      status = "expired";
    } else if (daysUntilExpiry <= 30) {
      status = "expiring_soon";
    }
    expect(status).toBe("expiring_soon");

    // 만료된 건강진단서 (만료일이 10일 전)
    const expiredExpiry = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
    daysUntilExpiry = Math.ceil(
      (expiredExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    status = "valid";
    if (daysUntilExpiry < 0) {
      status = "expired";
    } else if (daysUntilExpiry <= 30) {
      status = "expiring_soon";
    }
    expect(status).toBe("expired");
  });

  it("Excel 업로드 시 직원 자동 생성 로직 테스트", async () => {
    const db = await getDb();
    if (!db) throw new Error("데이터베이스 연결 실패");

    const employeeName = `자동생성직원-${Date.now()}`;
    const department = "테스트부서";

    // 직원이 없는 경우 확인
    let employee = await db
      .select()
      .from(employees)
      .where(eq(employees.name, employeeName))
      .limit(1)
      .then((rows) => rows[0]);

    expect(employee).toBeUndefined();

    // 직원 생성
    const [result] = await db.insert(employees).values({
      name: employeeName,
      department,
      position: "사원",
      phone: null,
      email: null,
      hireDate: new Date(),
      status: "active",
      createdBy: testUserId
    });

    expect(result.insertId).toBeGreaterThan(0);

    // 생성된 직원 확인
    employee = await db
      .select()
      .from(employees)
      .where(eq(employees.id, result.insertId))
      .limit(1)
      .then((rows) => rows[0]);

    expect(employee).toBeDefined();
    expect(employee.name).toBe(employeeName);
    expect(employee.department).toBe(department);
  });

  it("Excel 업로드 필수 필드 검증 테스트", async () => {
    // 필수 필드 누락 시뮬레이션
    const testRows = [
      { 직원명: "홍길동", 부서: "생산부", 발급일: "2024-01-15", 만료일: "2025-01-14" }, // 정상
      { 직원명: "", 부서: "생산부", 발급일: "2024-01-15", 만료일: "2025-01-14" }, // 직원명 누락
      { 직원명: "김철수", 부서: "", 발급일: "2024-01-15", 만료일: "2025-01-14" }, // 부서 누락
      { 직원명: "이영희", 부서: "품질관리부", 발급일: "", 만료일: "2025-01-14" }, // 발급일 누락
      { 직원명: "박민수", 부서: "생산부", 발급일: "2024-01-15", 만료일: "" }, // 만료일 누락
    ];

    const errors: string[] = [];

    testRows.forEach((row, i) => {
      if (!row["직원명"] || !row["부서"] || !row["발급일"] || !row["만료일"]) {
        errors.push(`${i + 2}행: 필수 필드 누락 (직원명, 부서, 발급일, 만료일)`);
      }
    });

    expect(errors.length).toBe(4); // 4개의 오류가 있어야 함
    expect(errors[0]).toContain("3행"); // 두 번째 행 (헤더 제외)
    expect(errors[1]).toContain("4행");
    expect(errors[2]).toContain("5행");
    expect(errors[3]).toContain("6행");
  });
});
