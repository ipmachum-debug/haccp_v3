// 생산 내역 데이터 타입 정의

/** 원료 사용량 (key: 원재료명, value: 사용량 kg) */
export type MaterialUsage = Record<string, number>;

/** 생산 기록 */
export interface ProductionRecord {
  /** 생산일자 (YYYY-MM-DD) */
  date: string;

  /** 제품명 */
  product: string;

  /** 생산량 (kg) */
  quantityKg: number;

  /** 원료별 사용량 (kg). 배합비 기반 자동 계산. null이면 배합비 미등록 */
  materialsUsed: MaterialUsage | null;
}

/** 전체 생산 데이터 */
export type ProductionRecordList = ProductionRecord[];

// 사용 예시:
// import productionData from './production_records.json';
// const data: ProductionRecordList = productionData;
//
// 특정 날짜 생산 조회:
// const march19 = data.filter(r => r.date === '2026-03-19');
//
// 특정 원료 총 사용량:
// const totalRice = data.reduce((sum, r) => 
//   sum + (r.materialsUsed?.['찹쌀(국내산)'] ?? 0), 0);
