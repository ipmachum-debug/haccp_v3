const units: Record<string, { dimension: string; scale: number }> = {
  kg: { dimension: "mass", scale: 1000 },
  g: { dimension: "mass", scale: 1 },
  l: { dimension: "volume", scale: 1000 },
  ml: { dimension: "volume", scale: 1 },
};

/** Fixed metric conversions only; package sizes and mass/volume ratios require explicit settings. */
export function convertMetricQuantity(quantity: number, from: string, to: string): number | null {
  if (!Number.isFinite(quantity)) return null;
  const source = from.trim().toLowerCase();
  const target = to.trim().toLowerCase();
  if (!source || !target) return null;
  if (source === target) return quantity;
  const a = units[source];
  const b = units[target];
  if (!a || !b || a.dimension !== b.dimension) return null;
  const result = quantity * (a.scale / b.scale);
  return Number.isFinite(result) ? result : null;
}
