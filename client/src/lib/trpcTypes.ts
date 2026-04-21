/**
 * tRPC 라우터 입력/출력 타입 헬퍼
 *
 * 대규모 AppRouter 에서는 createTRPCReact 의 proxy 가 `.useMutation`/`.useQuery` 레벨까지
 * 타입을 완전히 전파하지 못해 콜백 파라미터가 `any` 로 떨어지는 경우가 있습니다.
 * 그럴 때는 이 헬퍼로 특정 프로시저의 입출력 타입을 명시적으로 뽑아 사용하세요.
 *
 * @example
 *   import type { RouterOutput } from "@/lib/trpcTypes";
 *   type Employees = RouterOutput["payroll"]["employees"];
 *   const emps: Employees = employeeList ?? [];
 */
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type RouterInput = inferRouterInputs<AppRouter>;
export type RouterOutput = inferRouterOutputs<AppRouter>;
