/**
 * 허브 메뉴 컨텍스트 (3-b) — 레이아웃이 계산한 '이 사용자에게 보이는 허브 메뉴'(업종·모듈·데모·권한 필터 반영)를
 * 화면(허브 입구 등)이 그대로 쓰게 한다. 화면이 메뉴를 다시 계산하지 않으므로 사이드바와 항상 같다.
 */
import { createContext, useContext } from "react";
import type { HubMenuSection } from "./HubSidebarMenu";

export const HubMenuContext = createContext<HubMenuSection[]>([]);
export const useHubMenu = () => useContext(HubMenuContext);
