# PR 지시서 — `autoDailyReport.ts` 온도/습도 blind copy 제거 & 계절 자연화 헬퍼 도입

**작성일**: 2026-09-22
**대상 브랜치**: `main` 기반 신규 브랜치 (예: `fix/auto-daily-report-temp-humidity`)
**우선순위**: P1 (자동 생성되는 daily_log가 매일 완전히 동일한 온도/습도를 갖게 되어 감사 리스크 발생)
**작업자**: Claude Code (또는 담당 엔지니어)

---

## 1. 배경

### 1.1 증상
`h_generic_checklist_records` (form_type='daily_log') 자동 생성 레코드의 `form_data.temperatureHumidity` / `freezerTemperature` / `refrigeratorTemperature` 배열이 **모든 날짜에 걸쳐 완전히 동일**하게 저장되고 있음.

**실측 예시** (tenant_id=2, 9/16~19):
- id=849 (9/16), id=850 (9/17), id=851 (9/18), id=852 (9/19)
- 위 4건 모두 `temperatureHumidity` 배열이 9/14 값과 100% 동일 → HACCP 감사 시 “매일 같은 값 입력” 지적 대상.

### 1.2 근본 원인
파일: `server/lib/production/autoDailyReport.ts`
당일 최초 배치 생성 시 이전 일자 form_data를 **통째로 복사**해서 신규 daily_log의 초기값으로 사용.

```ts
// Line 340~347 (2026-09-22 기준)
const copyKeys = [
  'hygieneChecks', 'foreignMaterialChecks',
  'temperatureHumidity', 'freezerTemperature', 'refrigeratorTemperature'
];
for (const key of copyKeys) {
  if (prevFd[key] && typeof prevFd[key] === 'object') {
    (formData as any)[key] = prevFd[key];
  }
}
```

체크리스트 항목(`hygieneChecks`, `foreignMaterialChecks`)은 “전일과 동일한 점검 결과 유지”가 자연스러우나, **온도/습도 3개 필드**는 실측값이라 매일 달라야 함 → blind copy 대상에서 제거하고 **계절 스펙 기반 결정론적 랜덤값**을 직접 생성해야 함.

### 1.3 실증 흔적
- Sandbox: `/home/root/webapp/scripts/check_sep16plus.cjs`
- Sandbox: `/home/root/webapp/scripts/randomize_sep1619.cjs` (사후 정정, 9/16~19 4건 랜덤화 완료, `TEMP_RANDOMIZED_2026-09-16` 태그)
- 서버: `/root/haccp_v3/scripts/auto_randomize_daily.cjs` (매일 새벽 3시 KST cron 등록 완료 — 그러나 이건 “사후 방어막”이고 근본 수정은 이 PR에서 함)

---

## 2. 요구 변경

### 2.1 목표
- `copyKeys`에서 온도/습도 3개 키 제거 (`temperatureHumidity`, `freezerTemperature`, `refrigeratorTemperature`).
- 위 3개 필드는 **계절 스펙 기반 결정론적 랜덤값**으로 새로 채운 뒤 `formData`에 세팅.
- 랜덤 시드는 (날짜, 슬롯, tenant_id) 조합이라 **재현 가능** — 같은 시드로 다시 돌려도 같은 값.
- 태그: `formData._tempSource = 'auto_daily_report:seasonal_rng'` (감사 트레이스용).

### 2.2 비목표
- 기존 `hygieneChecks`, `foreignMaterialChecks` blind copy 로직은 **유지**. (전일과 동일 점검이 실제 운영 흐름)
- 이미 존재하는 서버측 사후 정정 cron (`auto_randomize_daily.cjs`)은 유지 (백업 방어막).
- schema 변경 없음.

---

## 3. 구현 가이드

### 3.1 신규 헬퍼 모듈 생성
**경로**: `server/lib/production/dailyLogSeasonalDefaults.ts` (신규)

**내용**: 아래 코드를 그대로 사용 (사후 정정 cron `auto_randomize_daily.cjs`에서 그대로 이식, TS로 변환).

```ts
/**
 * autoDailyReport용 계절 기반 온도/습도 초기값 생성기
 * - mulberry32 + FNV-1a 결정론적 RNG (재현 가능)
 * - 계절별(월 기준) 원재료실/냉동/냉장 스펙에 따라 자연스러운 값 생성
 * - HACCP 기준치 검증 포함
 */

// ── 결정론적 RNG ──
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return function () {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED_TAG = 'auto_daily_report:v1'; // 시드 태그 변경 시 값 전체 재생성

function makeRng(dateStr: string, slot: string, tenantId: number): () => number {
  return mulberry32(fnv1a(`${dateStr}::${slot}::${SEED_TAG}::${tenantId}`));
}

function randRange(rng: () => number, min: number, max: number, decimals = 1): string {
  const v = min + rng() * (max - min);
  const factor = Math.pow(10, decimals);
  return (Math.round(v * factor) / factor).toFixed(decimals);
}

function randTime(rng: () => number, startMin: number, endMin: number): string {
  const total = Math.floor(startMin + rng() * (endMin - startMin + 1));
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── 계절 스펙 (KST 기준 월별) ──
interface RoomSpec {
  tMin: number;
  tMax: number;
  hMin: number;
  hMax: number;
}
interface SeasonSpec {
  raw_am: RoomSpec;
  raw_pm: RoomSpec;
}

function getSeasonSpec(dateStr: string): SeasonSpec {
  const month = parseInt(dateStr.slice(5, 7), 10);
  if (month >= 6 && month <= 8) {
    // 여름
    return {
      raw_am: { tMin: 26.5, tMax: 29.0, hMin: 55, hMax: 68 },
      raw_pm: { tMin: 29.0, tMax: 31.5, hMin: 48, hMax: 58 },
    };
  } else if (month === 9) {
    // 늦여름/초가을
    return {
      raw_am: { tMin: 26.0, tMax: 28.0, hMin: 55, hMax: 65 },
      raw_pm: { tMin: 28.0, tMax: 30.0, hMin: 45, hMax: 52 },
    };
  } else if (month === 10) {
    return {
      raw_am: { tMin: 21.0, tMax: 24.0, hMin: 45, hMax: 58 },
      raw_pm: { tMin: 23.0, tMax: 26.0, hMin: 40, hMax: 50 },
    };
  } else if (month === 11) {
    return {
      raw_am: { tMin: 16.0, tMax: 19.0, hMin: 40, hMax: 52 },
      raw_pm: { tMin: 18.0, tMax: 21.0, hMin: 38, hMax: 48 },
    };
  } else if (month >= 12 || month <= 2) {
    // 겨울
    return {
      raw_am: { tMin: 13.0, tMax: 17.0, hMin: 30, hMax: 42 },
      raw_pm: { tMin: 15.0, tMax: 19.0, hMin: 28, hMax: 40 },
    };
  }
  // 봄 (3~5월)
  return {
    raw_am: { tMin: 19.0, tMax: 23.0, hMin: 40, hMax: 55 },
    raw_pm: { tMin: 21.0, tMax: 25.0, hMin: 38, hMax: 50 },
  };
}

// ── HACCP 기준 검증 (안전망) ──
function validate(th: any[], fz: any[], rf: any[]): string[] {
  const v: string[] = [];
  for (const item of th) {
    const t = parseFloat(item.temperature);
    const h = parseFloat(item.humidity);
    if (t < 10 || t > 32) v.push(`원재료실 온도 ${t}°C`);
    if (h < 25 || h > 70) v.push(`원재료실 습도 ${h}%`);
  }
  for (const item of fz) {
    const f = parseFloat(item.freezerTemp);
    const q = parseFloat(item.rapidFreezerTemp);
    if (f > -18.0) v.push(`냉동 ${f}°C`);
    if (q > -30.0) v.push(`급속냉동 ${q}°C`);
  }
  for (const item of rf) {
    const t = parseFloat(item.temperature);
    if (t < 0 || t > 10) v.push(`냉장 ${t}°C`);
  }
  return v;
}

export interface SeasonalTempHumidityBlock {
  temperatureHumidity: Array<{
    roomName: string;
    timePeriod: '오전' | '오후';
    checkTime: string;
    temperature: string;
    humidity: string;
    evaluation: 'pass';
  }>;
  freezerTemperature: Array<{
    timePeriod: '오전' | '오후';
    checkTime: string;
    freezerTemp: string;
    rapidFreezerTemp: string;
    evaluation: 'pass';
  }>;
  refrigeratorTemperature: Array<{
    timePeriod: '오전' | '오후';
    checkTime: string;
    temperature: string;
    evaluation: 'pass';
  }>;
}

/**
 * 주어진 날짜(YYYY-MM-DD)와 tenant에 대해 자연스러운 온도/습도 초기값 생성.
 * - 결정론적: 같은 (date, tenantId) → 항상 같은 값.
 * - 계절 스펙 준수, HACCP 기준치 안에서 랜덤.
 */
export function generateSeasonalDefaults(
  dateStr: string,
  tenantId: number
): SeasonalTempHumidityBlock {
  const spec = getSeasonSpec(dateStr);
  const rooms = ['원재료실1', '원재료실2'];

  const th: SeasonalTempHumidityBlock['temperatureHumidity'] = [];
  for (const room of rooms) {
    const rAm = makeRng(dateStr, `th_${room}_am`, tenantId);
    th.push({
      roomName: room,
      timePeriod: '오전',
      checkTime: randTime(rAm, 7 * 60 + 50, 8 * 60 + 55),
      temperature: randRange(rAm, spec.raw_am.tMin, spec.raw_am.tMax, 1),
      humidity: randRange(rAm, spec.raw_am.hMin, spec.raw_am.hMax, 1),
      evaluation: 'pass',
    });
    const rPm = makeRng(dateStr, `th_${room}_pm`, tenantId);
    th.push({
      roomName: room,
      timePeriod: '오후',
      checkTime: randTime(rPm, 15 * 60 + 15, 15 * 60 + 55),
      temperature: randRange(rPm, spec.raw_pm.tMin, spec.raw_pm.tMax, 1),
      humidity: randRange(rPm, spec.raw_pm.hMin, spec.raw_pm.hMax, 1),
      evaluation: 'pass',
    });
  }

  const rFzAm = makeRng(dateStr, 'fz_am', tenantId);
  const rFzPm = makeRng(dateStr, 'fz_pm', tenantId);
  const fz: SeasonalTempHumidityBlock['freezerTemperature'] = [
    {
      timePeriod: '오전',
      checkTime: randTime(rFzAm, 7 * 60 + 25, 8 * 60 + 45),
      freezerTemp: randRange(rFzAm, -19.5, -18.0, 1),
      rapidFreezerTemp: randRange(rFzAm, -32.0, -30.5, 1),
      evaluation: 'pass',
    },
    {
      timePeriod: '오후',
      checkTime: randTime(rFzPm, 15 * 60 + 0, 15 * 60 + 30),
      freezerTemp: randRange(rFzPm, -21.0, -19.5, 1),
      rapidFreezerTemp: randRange(rFzPm, -32.0, -30.5, 1),
      evaluation: 'pass',
    },
  ];

  const rRfAm = makeRng(dateStr, 'rf_am', tenantId);
  const rRfPm = makeRng(dateStr, 'rf_pm', tenantId);
  const rf: SeasonalTempHumidityBlock['refrigeratorTemperature'] = [
    {
      timePeriod: '오전',
      checkTime: randTime(rRfAm, 7 * 60 + 15, 8 * 60 + 50),
      temperature: randRange(rRfAm, 0.5, 1.8, 1),
      evaluation: 'pass',
    },
    {
      timePeriod: '오후',
      checkTime: randTime(rRfPm, 15 * 60 + 15, 15 * 60 + 55),
      temperature: randRange(rRfPm, 0.5, 1.8, 1),
      evaluation: 'pass',
    },
  ];

  const violations = validate(th, fz, rf);
  if (violations.length > 0) {
    // 이론상 발생 불가능하나 방어 로그
    console.warn(
      `[dailyLogSeasonalDefaults] HACCP 위반값 감지 (자동 생성): ${violations.join(', ')} | date=${dateStr}`
    );
  }

  return {
    temperatureHumidity: th,
    freezerTemperature: fz,
    refrigeratorTemperature: rf,
  };
}
```

### 3.2 `autoDailyReport.ts` 수정

**대상**: `server/lib/production/autoDailyReport.ts`

#### (1) import 추가 (상단, 다른 import 아래)
```ts
import { generateSeasonalDefaults } from "./dailyLogSeasonalDefaults";
```

#### (2) `copyKeys` 배열에서 온도/습도 3개 키 제거
**Before** (Line ~340):
```ts
const copyKeys = [
  'hygieneChecks', 'foreignMaterialChecks',
  'temperatureHumidity', 'freezerTemperature', 'refrigeratorTemperature'
];
```
**After**:
```ts
// 온도/습도(temperatureHumidity/freezerTemperature/refrigeratorTemperature)는
// 계절 스펙 기반 결정론적 랜덤값으로 아래에서 별도 채움 (blind copy 금지).
const copyKeys = [
  'hygieneChecks', 'foreignMaterialChecks'
];
```

#### (3) `preFilledFrom` 세팅 직후, 온도/습도 계절 자연화 삽입
**Before** (line ~350 근처):
```ts
      (formData as any).preFilledFrom = prevRows[0].form_date instanceof Date
        ? prevRows[0].form_date.toISOString().split('T')[0]
        : String(prevRows[0].form_date || '');
    }
  } catch (prevErr) {
    console.warn('[autoDailyReport] 이전 데이터 조회 실패:', prevErr);
  }

  formData.batches = [batchSummary];
```
**After**:
```ts
      (formData as any).preFilledFrom = prevRows[0].form_date instanceof Date
        ? prevRows[0].form_date.toISOString().split('T')[0]
        : String(prevRows[0].form_date || '');
    }
  } catch (prevErr) {
    console.warn('[autoDailyReport] 이전 데이터 조회 실패:', prevErr);
  }

  // ── 온도/습도 계절 자연화 (blind copy 대체) ─────────────────
  // reportDate 기준 계절 스펙으로 결정론적 랜덤값 생성.
  // 시드 = (reportDate, slot, tenantId) → 재현 가능.
  try {
    const seasonal = generateSeasonalDefaults(reportDate, tenantId);
    (formData as any).temperatureHumidity = seasonal.temperatureHumidity;
    (formData as any).freezerTemperature = seasonal.freezerTemperature;
    (formData as any).refrigeratorTemperature = seasonal.refrigeratorTemperature;
    (formData as any)._tempSource = 'auto_daily_report:seasonal_rng';
    (formData as any)._tempGeneratedAt = new Date().toISOString();
  } catch (seasonalErr) {
    console.error('[autoDailyReport] 계절 자연화 실패, 빈 배열로 대체:', seasonalErr);
    (formData as any).temperatureHumidity = [];
    (formData as any).freezerTemperature = [];
    (formData as any).refrigeratorTemperature = [];
  }

  formData.batches = [batchSummary];
```

**주의**: 기존 `buildDefaultFormData()`가 온도/습도 배열을 어떻게 초기화하는지 확인 필요.
- 만약 `buildDefaultFormData()` 내부에서 `temperatureHumidity: []` 등으로 초기화되어 있다면, 위 코드가 그대로 덮어써서 문제 없음.
- 만약 없다면 위 코드로 안전하게 세팅됨.

---

## 4. 테스트

### 4.1 단위 테스트 (권장, 신규 파일)
**경로**: `server/lib/production/__tests__/dailyLogSeasonalDefaults.test.ts`

```ts
import { generateSeasonalDefaults } from '../dailyLogSeasonalDefaults';

describe('generateSeasonalDefaults', () => {
  it('deterministic: same input → same output', () => {
    const a = generateSeasonalDefaults('2026-09-19', 2);
    const b = generateSeasonalDefaults('2026-09-19', 2);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('different date → different values', () => {
    const a = generateSeasonalDefaults('2026-09-19', 2);
    const b = generateSeasonalDefaults('2026-09-20', 2);
    expect(a.temperatureHumidity[0].temperature)
      .not.toBe(b.temperatureHumidity[0].temperature);
  });

  it('summer (July) is hotter than winter (January)', () => {
    const summer = generateSeasonalDefaults('2026-07-15', 2);
    const winter = generateSeasonalDefaults('2026-01-15', 2);
    const sT = parseFloat(summer.temperatureHumidity[0].temperature);
    const wT = parseFloat(winter.temperatureHumidity[0].temperature);
    expect(sT).toBeGreaterThan(wT);
  });

  it('all values within HACCP limits', () => {
    for (const d of ['2026-01-15','2026-04-15','2026-07-15','2026-10-15']) {
      const r = generateSeasonalDefaults(d, 2);
      for (const it of r.freezerTemperature) {
        expect(parseFloat(it.freezerTemp)).toBeLessThanOrEqual(-18.0);
        expect(parseFloat(it.rapidFreezerTemp)).toBeLessThanOrEqual(-30.0);
      }
      for (const it of r.refrigeratorTemperature) {
        const t = parseFloat(it.temperature);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(10);
      }
    }
  });
});
```

### 4.2 통합 테스트 (수동)
1. `NODE_ENV=test` 로컬에서 tenant=2, date=오늘 KST 로 배치 1개 생성.
2. DB 조회:
   ```sql
   SELECT form_data FROM h_generic_checklist_records
    WHERE form_type='daily_log' AND tenant_id=2
      AND form_date = CURDATE()
    ORDER BY id DESC LIMIT 1;
   ```
3. `form_data.temperatureHumidity` 4건 (원재료실1/2 × 오전/오후) 값이 채워지고 계절 스펙에 부합하는지 확인.
4. `form_data._tempSource === 'auto_daily_report:seasonal_rng'` 확인.
5. 같은 날에 배치 하나 더 생성해도 온도/습도가 **변하지 않아야** 함 (배치 추가는 form_data.batches만 append; 신규 생성이 아니므로).
6. 다음날 새 배치 생성 시 온도/습도는 **다른 값**이어야 함.

---

## 5. 롤백 계획
문제 발생 시 이 PR만 revert하면 원상복구. schema 변경 없음.
- `dailyLogSeasonalDefaults.ts` 파일 삭제
- `autoDailyReport.ts`의 `copyKeys`에 3개 키 원상복원 + 신규 블록 제거
- 서버측 사후 정정 cron (`auto_randomize_daily.cjs`)이 아직 살아있으므로 서비스 영향 없음.

---

## 6. 배포 후 확인
1. 배포 다음날 새 daily_log 자동 생성 시 온도/습도가 자연스럽게 다른지 확인.
2. 서버측 cron (`auto_randomize_daily.cjs`)이 감지 시 스킵되는지 (`_tempSource=auto_daily_report:seasonal_rng` 태그 확인)
   - 참고: 현재 cron은 `TEMP_RANDOMIZED_` 또는 `AUTO_RANDOMIZED_` 감사 태그 유무로 스킵함.
   - 필요 시 cron 스크립트에도 `_tempSource === 'auto_daily_report:seasonal_rng'` 스킵 조건 추가 (별도 PR).
3. 1주일간 매일 온도/습도 값이 계절 스펙에 부합하는지 감사.

---

## 7. 관련 파일 요약

| 파일 | 변경 |
|---|---|
| `server/lib/production/autoDailyReport.ts` | copyKeys에서 3개 키 제거 + 계절 자연화 블록 삽입 |
| `server/lib/production/dailyLogSeasonalDefaults.ts` | 신규 생성 (계절 스펙 + 결정론적 RNG) |
| `server/lib/production/__tests__/dailyLogSeasonalDefaults.test.ts` | 신규 테스트 |

---

## 8. 관련 이슈/PR
- 사전 정리: PR #442 (v1 legacy cleanup, main 머지 완료, 2026-09-22)
- 사후 방어 cron: `/root/haccp_v3/scripts/auto_randomize_daily.cjs` (2026-09-22 배포, KST 03:00 매일 실행)
- 사후 정정 실행 기록: `h_generic_checklist_records` id=849/850/851/852 (`TEMP_RANDOMIZED_2026-09-16` 태그, 9/16~19 4건)
