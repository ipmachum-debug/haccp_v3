#!/usr/bin/env node
/**
 * 매일 새벽 실행되는 일반위생관리 및 공정점검표 자연화 크론
 *
 * 동작:
 *  1. 어제 (KST) daily_log 레코드 조회 (tenant_id=2)
 *  2. temperatureHumidity/freezerTemperature/refrigeratorTemperature 가
 *     ── 그 전날(어제-1)과 완전히 동일하면 → 자연화 대상
 *     ── 이미 _tempRandomizedTag 있으면 → 스킵 (재실행 방지)
 *  3. 계절/월별 스펙에 맞춰 결정론적 랜덤 값 생성
 *  4. UPDATE 후 감사 로그 파일 남김
 *
 * 크론 등록:
 *   0 3 * * * TZ=Asia/Seoul /usr/bin/node /root/haccp_v3/scripts/auto_randomize_daily.cjs >> /var/log/haccp/auto_randomize.log 2>&1
 *
 * 환경변수:
 *   DATABASE_URL (or .env)
 *   AUTO_RANDOMIZE_DRY=1  → dry-run
 *   AUTO_RANDOMIZE_TENANT=2  → 대상 tenant (기본 2)
 *   AUTO_RANDOMIZE_TARGET_DATE=2026-09-20  → 특정 날짜 수동 실행
 */
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

// .env 로드
const envPath = path.join(__dirname, '..', '.env');
const URL = process.env.DATABASE_URL || (() => {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const line = envContent.split('\n').find(l => l.startsWith('DATABASE_URL='));
  return line ? line.split('=').slice(1).join('=') : null;
})();

const DRY_RUN = process.env.AUTO_RANDOMIZE_DRY === '1';
const TENANT_ID = Number(process.env.AUTO_RANDOMIZE_TENANT || 2);

// 대상 날짜: 기본 = 어제 (KST)
function yesterdayKST() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000)); // UTC + 9
  kstNow.setUTCDate(kstNow.getUTCDate() - 1);
  return kstNow.toISOString().slice(0, 10);
}
const TARGET_DATE = process.env.AUTO_RANDOMIZE_TARGET_DATE || yesterdayKST();

const AUDIT_TAG = `AUTO_RANDOMIZED_${new Date().toISOString().slice(0,10)}`;

// ── 결정론적 RNG (mulberry32 + FNV-1a) ──
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let t = seed >>> 0;
  return function() {
    t = (t + 0x6D2B79F5) >>> 0;
    let r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
function makeRng(dateStr, slot) {
  return mulberry32(fnv1a(`${dateStr}::${slot}::${AUDIT_TAG}::${TENANT_ID}`));
}
function randRange(rng, min, max, decimals = 1) {
  const v = min + rng() * (max - min);
  const factor = Math.pow(10, decimals);
  return (Math.round(v * factor) / factor).toFixed(decimals);
}
function randTime(rng, startMin, endMin) {
  const total = Math.floor(startMin + rng() * (endMin - startMin + 1));
  const hh = String(Math.floor(total / 60)).padStart(2, '0');
  const mm = String(total % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// ── 계절별 스펙 ──
function getSeasonSpec(dateStr) {
  const month = parseInt(dateStr.slice(5, 7), 10);
  // 6~8월: 여름
  // 9월: 늦여름/초가을
  // 10~11월: 가을
  // 12~2월: 겨울
  // 3~5월: 봄
  if (month >= 6 && month <= 8) {
    return {
      raw_am: { tMin: 26.5, tMax: 29.0, hMin: 55, hMax: 68 },
      raw_pm: { tMin: 29.0, tMax: 31.5, hMin: 48, hMax: 58 },
    };
  } else if (month === 9) {
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
    return {
      raw_am: { tMin: 13.0, tMax: 17.0, hMin: 30, hMax: 42 },
      raw_pm: { tMin: 15.0, tMax: 19.0, hMin: 28, hMax: 40 },
    };
  } else {
    // 3~5월
    return {
      raw_am: { tMin: 19.0, tMax: 23.0, hMin: 40, hMax: 55 },
      raw_pm: { tMin: 21.0, tMax: 25.0, hMin: 38, hMax: 50 },
    };
  }
}

function generateForDate(dateStr) {
  const spec = getSeasonSpec(dateStr);
  const rooms = ['원재료실1', '원재료실2'];
  const th = [];
  for (const room of rooms) {
    const rngAm = makeRng(dateStr, `th_${room}_am`);
    th.push({
      humidity: randRange(rngAm, spec.raw_am.hMin, spec.raw_am.hMax, 1),
      roomName: room,
      checkTime: randTime(rngAm, 7*60+50, 8*60+55),
      evaluation: 'pass',
      timePeriod: '오전',
      temperature: randRange(rngAm, spec.raw_am.tMin, spec.raw_am.tMax, 1),
    });
    const rngPm = makeRng(dateStr, `th_${room}_pm`);
    th.push({
      humidity: randRange(rngPm, spec.raw_pm.hMin, spec.raw_pm.hMax, 1),
      roomName: room,
      checkTime: randTime(rngPm, 15*60+15, 15*60+55),
      evaluation: 'pass',
      timePeriod: '오후',
      temperature: randRange(rngPm, spec.raw_pm.tMin, spec.raw_pm.tMax, 1),
    });
  }

  const rngFzAm = makeRng(dateStr, 'fz_am');
  const rngFzPm = makeRng(dateStr, 'fz_pm');
  const fz = [
    {
      checkTime: randTime(rngFzAm, 7*60+25, 8*60+45),
      evaluation: 'pass',
      timePeriod: '오전',
      freezerTemp: randRange(rngFzAm, -19.5, -18.0, 1),
      rapidFreezerTemp: randRange(rngFzAm, -32.0, -30.5, 1),
    },
    {
      checkTime: randTime(rngFzPm, 15*60+0, 15*60+30),
      evaluation: 'pass',
      timePeriod: '오후',
      freezerTemp: randRange(rngFzPm, -21.0, -19.5, 1),
      rapidFreezerTemp: randRange(rngFzPm, -32.0, -30.5, 1),
    },
  ];

  const rngRfAm = makeRng(dateStr, 'rf_am');
  const rngRfPm = makeRng(dateStr, 'rf_pm');
  const rf = [
    {
      checkTime: randTime(rngRfAm, 7*60+15, 8*60+50),
      evaluation: 'pass',
      timePeriod: '오전',
      temperature: randRange(rngRfAm, 0.5, 1.8, 1),
    },
    {
      checkTime: randTime(rngRfPm, 15*60+15, 15*60+55),
      evaluation: 'pass',
      timePeriod: '오후',
      temperature: randRange(rngRfPm, 0.5, 1.8, 1),
    },
  ];

  return { th, fz, rf };
}

function validate(th, fz, rf) {
  const violations = [];
  for (const item of th) {
    const t = parseFloat(item.temperature);
    const h = parseFloat(item.humidity);
    if (t < 10 || t > 32) violations.push(`원재료실 온도 ${t}°C`);
    if (h < 25 || h > 70) violations.push(`원재료실 습도 ${h}%`);
  }
  for (const item of fz) {
    const f = parseFloat(item.freezerTemp);
    const q = parseFloat(item.rapidFreezerTemp);
    if (f > -18.0) violations.push(`냉동 ${f}°C`);
    if (q > -30.0) violations.push(`급속냉동 ${q}°C`);
  }
  for (const item of rf) {
    const t = parseFloat(item.temperature);
    if (t < 0 || t > 10) violations.push(`냉장 ${t}°C`);
  }
  return violations;
}

// ── 두 배열이 완전 동일한가? (얕은 비교, JSON 문자열) ──
function isSame(a, b) {
  if (!a || !b) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch { return false; }
}

// ── 로그 ──
function log(...args) {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19);
  console.log(`[${ts}]`, ...args);
}

(async () => {
  if (!URL) {
    log('❌ DATABASE_URL 없음');
    process.exit(1);
  }

  log(`━━━ AUTO RANDOMIZE 시작 ━━━`);
  log(`  Target date (KST): ${TARGET_DATE}`);
  log(`  Tenant ID: ${TENANT_ID}`);
  log(`  DRY_RUN: ${DRY_RUN}`);
  log(`  Audit tag: ${AUDIT_TAG}`);

  const conn = await mysql.createConnection(URL);

  // 대상 daily_log 조회
  const [rows] = await conn.execute(`
    SELECT id, form_date, form_data
    FROM h_generic_checklist_records
    WHERE tenant_id = ?
      AND form_type = 'daily_log'
      AND form_date = ?
  `, [TENANT_ID, TARGET_DATE]);

  log(`  Target daily_log 레코드: ${rows.length}건`);

  if (rows.length === 0) {
    log('  → 대상 없음. 종료.');
    await conn.end();
    return;
  }

  // 그 전날 (비교용)
  const prevDate = new Date(TARGET_DATE);
  prevDate.setDate(prevDate.getDate() - 1);
  const prevDateStr = prevDate.toISOString().slice(0, 10);

  const [prevRows] = await conn.execute(`
    SELECT id, form_date, form_data
    FROM h_generic_checklist_records
    WHERE tenant_id = ?
      AND form_type = 'daily_log'
      AND form_date = ?
  `, [TENANT_ID, prevDateStr]);
  const prevData = prevRows.length > 0 ? (typeof prevRows[0].form_data === 'string' ? JSON.parse(prevRows[0].form_data) : prevRows[0].form_data) : null;

  log(`  전일(${prevDateStr}) 레코드: ${prevRows.length}건`);

  let processed = 0, skipped = 0, violations = 0;

  for (const r of rows) {
    const fd = typeof r.form_data === 'string' ? JSON.parse(r.form_data) : r.form_data;

    // 이미 랜덤화됐으면 스킵
    if (fd._tempRandomizedTag) {
      log(`  [${TARGET_DATE}] id=${r.id} 스킵 (이미 tag: ${fd._tempRandomizedTag})`);
      skipped++;
      continue;
    }

    // 전일과 비교 (사용자가 실제 입력한 값이면 건드리지 않음)
    if (prevData) {
      const sameAll =
        isSame(fd.temperatureHumidity, prevData.temperatureHumidity) &&
        isSame(fd.freezerTemperature, prevData.freezerTemperature) &&
        isSame(fd.refrigeratorTemperature, prevData.refrigeratorTemperature);

      if (!sameAll) {
        log(`  [${TARGET_DATE}] id=${r.id} 스킵 (전일과 다름 → 사용자 입력 존중)`);
        skipped++;
        continue;
      }
    }

    // 자연화 대상! 값 생성
    const { th, fz, rf } = generateForDate(TARGET_DATE);

    // 검증
    const viol = validate(th, fz, rf);
    if (viol.length > 0) {
      log(`  [${TARGET_DATE}] id=${r.id} ⚠️ 위반: ${viol.join(', ')}`);
      violations += viol.length;
    }

    if (DRY_RUN) {
      log(`  [${TARGET_DATE}] id=${r.id} DRY 시뮬레이션:`);
      log(`     원재료실1 오전: ${th[0].checkTime} ${th[0].temperature}°C ${th[0].humidity}%`);
      log(`     냉동 오전: ${fz[0].freezerTemp}°C / 급속 ${fz[0].rapidFreezerTemp}°C`);
      log(`     냉장 오전: ${rf[0].checkTime} ${rf[0].temperature}°C`);
      processed++;
      continue;
    }

    // UPDATE
    fd.temperatureHumidity = th;
    fd.freezerTemperature = fz;
    fd.refrigeratorTemperature = rf;
    fd._tempRandomizedAt = new Date().toISOString();
    fd._tempRandomizedTag = AUDIT_TAG;
    fd._tempRandomizedBy = 'cron:auto_randomize_daily';

    await conn.execute(
      `UPDATE h_generic_checklist_records
         SET form_data = ?, updated_at = NOW()
       WHERE id = ? AND tenant_id = ?`,
      [JSON.stringify(fd), r.id, TENANT_ID]
    );
    log(`  [${TARGET_DATE}] id=${r.id} ✓ 자연화 완료 (원재료실 AM ${th[0].temperature}°C ${th[0].humidity}%)`);
    processed++;
  }

  log(`━━━ 완료 ━━━`);
  log(`  처리: ${processed}건 | 스킵: ${skipped}건 | 위반: ${violations}건`);

  await conn.end();
})().catch(e => {
  console.error('❌ FATAL:', e.message);
  console.error(e.stack);
  process.exit(1);
});
