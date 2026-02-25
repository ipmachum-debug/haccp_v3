#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
기간별 일지 플로우 점검
1. 일일/주간/월간/연간 일지 라우터 확인
2. 상태 전환 플로우 확인
3. 승인 프로세스 확인
"""

import os
import re

def check_router_file(filepath, log_type):
    """라우터 파일 점검"""
    
    if not os.path.exists(filepath):
        return {
            'exists': False,
            'log_type': log_type,
            'errors': ['파일이 존재하지 않음']
        }
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    results = {
        'exists': True,
        'log_type': log_type,
        'has_create': False,
        'has_get': False,
        'has_update': False,
        'has_approve': False,
        'has_status_transition': False,
        'errors': [],
        'warnings': []
    }
    
    # 기본 CRUD 확인
    if re.search(r'create\w*:\s*protectedProcedure', content):
        results['has_create'] = True
    else:
        results['errors'].append('create 엔드포인트 없음')
    
    if re.search(r'get\w*:\s*protectedProcedure', content):
        results['has_get'] = True
    else:
        results['warnings'].append('get 엔드포인트 없음')
    
    if re.search(r'update\w*:\s*protectedProcedure', content):
        results['has_update'] = True
    else:
        results['warnings'].append('update 엔드포인트 없음')
    
    # 승인 기능 확인
    if re.search(r'approve\w*:\s*protectedProcedure', content):
        results['has_approve'] = True
    else:
        results['warnings'].append('approve 엔드포인트 없음')
    
    # 상태 전환 확인
    if re.search(r"status.*=.*'작성중'|'승인대기'|'승인완료'", content):
        results['has_status_transition'] = True
    else:
        results['warnings'].append('상태 전환 로직 없음')
    
    return results

def check_component_file(filepath, log_type):
    """컴포넌트 파일 점검"""
    
    if not os.path.exists(filepath):
        return {
            'exists': False,
            'log_type': log_type,
            'errors': ['파일이 존재하지 않음']
        }
    
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    results = {
        'exists': True,
        'log_type': log_type,
        'has_form': False,
        'has_validation': False,
        'has_submit': False,
        'has_writer_select': False,
        'errors': [],
        'warnings': []
    }
    
    # 폼 요소 확인
    if re.search(r'<Input|<Textarea|<Select', content):
        results['has_form'] = True
    else:
        results['errors'].append('폼 요소 없음')
    
    # 검증 로직 확인
    if re.search(r'validate|validation|required', content, re.IGNORECASE):
        results['has_validation'] = True
    else:
        results['warnings'].append('검증 로직 없음')
    
    # 제출 기능 확인
    if re.search(r'handleSubmit|onSubmit|mutation\.mutate', content):
        results['has_submit'] = True
    else:
        results['errors'].append('제출 기능 없음')
    
    # WriterSelect 사용 확인
    if 'WriterSelect' in content:
        results['has_writer_select'] = True
    else:
        results['warnings'].append('WriterSelect 미사용')
    
    return results

def print_results(results, title):
    """결과 출력"""
    print(f"\n{'='*60}")
    print(f"{title}")
    print(f"{'='*60}")
    
    for result in results:
        log_type = result['log_type']
        exists = result['exists']
        
        print(f"\n[{log_type}]")
        
        if not exists:
            print("  ✗ 파일 없음")
            continue
        
        # 기능 체크
        checks = [k for k in result.keys() if k.startswith('has_')]
        for check in checks:
            status = "✓" if result[check] else "✗"
            check_name = check.replace('has_', '').replace('_', ' ').title()
            print(f"  {status} {check_name}")
        
        # 에러 및 경고
        if result.get('errors'):
            print(f"  에러: {', '.join(result['errors'])}")
        if result.get('warnings'):
            print(f"  경고: {', '.join(result['warnings'])}")

if __name__ == "__main__":
    print("=== 기간별 일지 플로우 점검 시작 ===")
    
    router_base = "/root/haccp_v3/server/routers"
    component_base = "/root/haccp_v3/client/src/components"
    
    # 라우터 점검
    router_checks = [
        (f"{router_base}/weeklyLogs.ts", "주간일지 라우터"),
        (f"{router_base}/monthlyLogs.ts", "월간일지 라우터"),
        (f"{router_base}/yearlyLogs.ts", "연간일지 라우터"),
    ]
    
    router_results = []
    for filepath, log_type in router_checks:
        router_results.append(check_router_file(filepath, log_type))
    
    print_results(router_results, "라우터 점검 결과")
    
    # 컴포넌트 점검
    component_checks = [
        (f"{component_base}/WeeklyHygieneLogModal.tsx", "주간 위생일지 모달"),
        (f"{component_base}/WeeklyPestLogModal.tsx", "주간 방충방서일지 모달"),
        (f"{component_base}/MonthlyHygieneLogModal.tsx", "월간 위생일지 모달"),
        (f"{component_base}/MonthlyCCPLogModal.tsx", "월간 CCP일지 모달"),
        (f"{component_base}/YearlyLogModal.tsx", "연간일지 모달"),
    ]
    
    component_results = []
    for filepath, log_type in component_checks:
        component_results.append(check_component_file(filepath, log_type))
    
    print_results(component_results, "컴포넌트 점검 결과")
    
    # 종합 평가
    print(f"\n{'='*60}")
    print("종합 평가")
    print(f"{'='*60}")
    
    total_errors = sum(len(r.get('errors', [])) for r in router_results + component_results)
    total_warnings = sum(len(r.get('warnings', [])) for r in router_results + component_results)
    
    print(f"총 에러: {total_errors}개")
    print(f"총 경고: {total_warnings}개")
    
    if total_errors == 0:
        print("✓ 기간별 일지 플로우 정상")
    else:
        print("✗ 일부 기능 누락 또는 오류 있음")
    
    print("\n=== 점검 완료 ===")
