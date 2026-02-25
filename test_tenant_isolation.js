// tenantId 필터링 테스트 스크립트
import { listCategories } from './server/db/categories.js';

async function testTenantIsolation() {
  console.log('=== 멀티테넌트 데이터 격리 테스트 ===\n');
  
  // 테넌트 1 데이터 조회
  console.log('테넌트 1 (골든터틀컴퍼니) 카테고리:');
  const tenant1 = await listCategories({ tenantId: 1 });
  console.log(tenant1);
  console.log(`총 ${tenant1.length}개\n`);
  
  // 테넌트 2 데이터 조회
  console.log('테넌트 2 ((주)단지) 카테고리:');
  const tenant2 = await listCategories({ tenantId: 2 });
  console.log(tenant2);
  console.log(`총 ${tenant2.length}개\n`);
  
  // 테넌트 3 데이터 조회
  console.log('테넌트 3 ((주)미미스상회) 카테고리:');
  const tenant3 = await listCategories({ tenantId: 3 });
  console.log(tenant3);
  console.log(`총 ${tenant3.length}개\n`);
  
  // 테넌트 4 데이터 조회
  console.log('테넌트 4 (이지다인) 카테고리:');
  const tenant4 = await listCategories({ tenantId: 4 });
  console.log(tenant4);
  console.log(`총 ${tenant4.length}개\n`);
  
  // 검증
  const hasT1OnlyT1Data = tenant1.every(c => c.tenantId === 1);
  const hasT2OnlyT2Data = tenant2.every(c => c.tenantId === 2);
  const hasT3OnlyT3Data = tenant3.every(c => c.tenantId === 3);
  const hasT4OnlyT4Data = tenant4.every(c => c.tenantId === 4);
  
  console.log('=== 검증 결과 ===');
  console.log(`테넌트 1 격리: ${hasT1OnlyT1Data ? '✅ 성공' : '❌ 실패'}`);
  console.log(`테넌트 2 격리: ${hasT2OnlyT2Data ? '✅ 성공' : '❌ 실패'}`);
  console.log(`테넌트 3 격리: ${hasT3OnlyT3Data ? '✅ 성공' : '❌ 실패'}`);
  console.log(`테넌트 4 격리: ${hasT4OnlyT4Data ? '✅ 성공' : '❌ 실패'}`);
  
  if (hasT1OnlyT1Data && hasT2OnlyT2Data && hasT3OnlyT3Data && hasT4OnlyT4Data) {
    console.log('\n✅ 멀티테넌트 데이터 격리 테스트 성공!');
  } else {
    console.log('\n❌ 멀티테넌트 데이터 격리 테스트 실패!');
  }
}

testTenantIsolation().catch(console.error);
