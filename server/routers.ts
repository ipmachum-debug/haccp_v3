// routers.ts - 하위 호환을 위한 re-export
// 실제 appRouter 조립은 server/routers/_root.ts에서 수행
// 기존 import { appRouter } from "./routers" 또는 "../routers" 유지
export { appRouter } from "./routers/_root";
export type { AppRouter } from "./routers/_root";
