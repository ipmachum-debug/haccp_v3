import { drizzle } from 'drizzle-orm/mysql2';
import mysql from 'mysql2/promise';
import * as dotenv from 'dotenv';
import { sql } from 'drizzle-orm';
import { matchingRules, partners } from '../drizzle/schema_main.ts';

// .env 파일 로드
dotenv.config();

/**
 * 매칭 규칙 샘플 데이터 시드 스크립트
 * 
 * 실행 방법:
 * node scripts/seed-matching-rules.mjs
 */

async function main() {
  console.log('🌱 매칭 규칙 샘플 데이터 시드 시작...');

  // 데이터베이스 연결
  const connection = await mysql.createConnection(process.env.DATABASE_URL);
  const db = drizzle(connection);

  try {
    // 1. 샘플 거래처 추가 (이미 존재하지 않는 경우만)
    console.log('\n📦 샘플 거래처 추가 중...');
    
    const samplePartners = [
      { name: '네이버(주)', bizNo: '220-81-62517', partnerType: 'customer', isActive: 1 },
      { name: '카카오(주)', bizNo: '120-81-47521', partnerType: 'customer', isActive: 1 },
      { name: '(주)우아한형제들', bizNo: '120-87-65763', partnerType: 'customer', isActive: 1 },
      { name: '쿠팡(주)', bizNo: '120-88-00767', partnerType: 'customer', isActive: 1 },
      { name: '(주)비바리퍼블리카', bizNo: '120-87-01126', partnerType: 'customer', isActive: 1 },
      { name: '한국전력공사', bizNo: '117-82-00052', partnerType: 'supplier', isActive: 1 },
      { name: 'SK텔레콤(주)', bizNo: '101-81-00816', partnerType: 'supplier', isActive: 1 },
      { name: 'KT', bizNo: '102-81-42945', partnerType: 'supplier', isActive: 1 },
    ];

    const partnerIdMap = {};

    for (const partner of samplePartners) {
      // 이미 존재하는지 확인
      const [existing] = await db
        .select()
        .from(partners)
        .where(sql`biz_no = ${partner.bizNo}`)
        .limit(1);

      if (existing) {
        console.log(`  ✓ ${partner.name} (이미 존재함)`);
        partnerIdMap[partner.name] = existing.id;
      } else {
        const [result] = await db.insert(partners).values({
          userId: 1, // 관리자 사용자 ID (실제 환경에서는 적절한 userId 사용)
          name: partner.name,
          bizNo: partner.bizNo,
          partnerType: partner.partnerType,
          isActive: partner.isActive,
        });
        partnerIdMap[partner.name] = result.insertId;
        console.log(`  ✓ ${partner.name} 추가 완료 (ID: ${result.insertId})`);
      }
    }

    // 2. 매칭 규칙 추가
    console.log('\n🔗 매칭 규칙 추가 중...');

    const sampleRules = [
      // 네이버 - 키워드 매칭
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 900,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: '네이버' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['네이버(주)'] },
        ]),
        isActive: 1,
      },
      // 카카오 - 키워드 매칭
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 900,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: '카카오' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['카카오(주)'] },
        ]),
        isActive: 1,
      },
      // 배달의민족 - 키워드 매칭
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 900,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: '배달의민족' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['(주)우아한형제들'] },
        ]),
        isActive: 1,
      },
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 900,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: '우아한형제들' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['(주)우아한형제들'] },
        ]),
        isActive: 1,
      },
      // 쿠팡 - 키워드 매칭
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 900,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: '쿠팡' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['쿠팡(주)'] },
        ]),
        isActive: 1,
      },
      // 토스 - 키워드 매칭
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 900,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: '토스' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['(주)비바리퍼블리카'] },
        ]),
        isActive: 1,
      },
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 900,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: '비바리퍼블리카' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['(주)비바리퍼블리카'] },
        ]),
        isActive: 1,
      },
      // 한국전력공사 - 키워드 매칭
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 800,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: '한국전력' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['한국전력공사'] },
        ]),
        isActive: 1,
      },
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 800,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: 'KEPCO' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['한국전력공사'] },
        ]),
        isActive: 1,
      },
      // SK텔레콤 - 키워드 매칭
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 800,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: 'SK텔레콤' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['SK텔레콤(주)'] },
        ]),
        isActive: 1,
      },
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 800,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: 'SKT' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['SK텔레콤(주)'] },
        ]),
        isActive: 1,
      },
      // KT - 키워드 매칭
      {
        userId: 1,
        ruleType: 'keyword',
        priority: 800,
        weight: '1.00',
        conditions: JSON.stringify([
          { field: 'counterpartyText', operator: 'contains', value: 'KT' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: partnerIdMap['KT'] },
        ]),
        isActive: 1,
      },
      // 금액 기반 매칭 샘플 (100만원 이상 출금 → 고액 거래)
      {
        userId: 1,
        ruleType: 'amount',
        priority: 500,
        weight: '0.50',
        conditions: JSON.stringify([
          { field: 'amount', operator: 'gte', value: 1000000 },
          { field: 'direction', operator: 'equals', value: 'out' },
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: null }, // 수동 확인 필요
        ]),
        isActive: 1,
      },
      // 정규식 패턴 매칭 샘플 (계좌이체 패턴)
      {
        userId: 1,
        ruleType: 'pattern',
        priority: 700,
        weight: '0.80',
        conditions: JSON.stringify([
          { field: 'memo', operator: 'regex', value: '\\d{3}-\\d{4}-\\d{4}' }, // 전화번호 패턴
        ]),
        actions: JSON.stringify([
          { type: 'assignPartner', partnerId: null }, // 수동 확인 필요
        ]),
        isActive: 1,
      },
    ];

    for (const rule of sampleRules) {
      await db.insert(matchingRules).values(rule);
      const conditionsObj = JSON.parse(rule.conditions);
      console.log(`  ✓ ${rule.ruleType} 규칙 추가: ${conditionsObj[0].field} ${conditionsObj[0].operator} ${conditionsObj[0].value}`);
    }

    console.log('\n✅ 매칭 규칙 샘플 데이터 시드 완료!');
    console.log(`   - 거래처: ${samplePartners.length}개`);
    console.log(`   - 매칭 규칙: ${sampleRules.length}개`);

  } catch (error) {
    console.error('❌ 시드 데이터 추가 실패:', error);
    throw error;
  } finally {
    await connection.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
