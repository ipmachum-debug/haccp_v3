import { useEffect } from 'react';

/**
 * 페이지 포커스 시 자동으로 쿼리를 새로고침하는 커스텀 훅
 * @param refetch - tRPC query의 refetch 함수
 * @param enabled - 자동 새로고침 활성화 여부 (기본값: true)
 */
export function useRefetchOnFocus(refetch: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;

    const handleFocus = () => {
      refetch();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('focus', handleFocus);
    };
  }, [refetch, enabled]);
}
