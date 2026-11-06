type State = { calls: any[]; mode: string };
const state = () => (window as any).__PURCHASE_TEST__ as State;
function node(parts: string[] = []): any {
  const key = parts.join(".");
  return new Proxy(() => {}, { get(_target, name) {
    if (name === "useUtils") return () => node();
    if (name === "invalidate") return async () => {};
    if (name === "fetch") return async () => ({ unitPrice: 10455 });
    if (name === "useQuery") return (input: any) => ({ data: key === "partners.list" ? [{ id: 1, companyName: "시험 거래처" }]
      : key === "itemMaster.list" ? { items: input.itemType === "raw_material" ? [
        { id: 315, itemName: "시험 피자치즈", itemType: "raw_material", baseUnit: "kg", defaultUnitPrice: "10455" },
        { id: 356, itemName: "시험 양송이", itemType: "raw_material", baseUnit: "ea", defaultUnitPrice: "10455" },
      ] : [] } : [], isLoading: false });
    if (name === "useMutation") return (options: any = {}) => ({ mutateAsync: async (payload: any) => {
      state().calls.push(payload);
      await new Promise((resolve) => setTimeout(resolve, 80));
      if (state().mode === "fail") throw new Error("시험 원료 연결이 없습니다. 품목 연결을 확인해 주세요.");
      if (state().mode === "missing" && !payload.savePackUnit) throw new Error("PACK_UNIT_MISSING: 시험 피자치즈 — 1개 = 0.75kg");
      const result = { id: 1, posted: true, status: "confirmed" };
      options.onSuccess?.(result);
      return result;
    } });
    return node([...parts, String(name)]);
  } });
}
export const trpc = node();
