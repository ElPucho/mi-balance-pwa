import { formatAmount } from "./finance.ts";
import type { AppData, AppSettings, CloudAction, Movement } from "./types.ts";

export type UndoRecord = { label: string; createdAt: string; before: AppData; after: AppData };
export type DataChange = { action: CloudAction; payload: unknown };
function canonical(value: unknown, omitStamps = false) { return JSON.stringify(value, (key, item) => omitStamps && ["createdAt", "updatedAt", "closedAt"].includes(key) ? undefined : item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item); }
const equal = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function comparable(value: unknown) { return canonical(value, true); }

export function dataChanges(before: AppData, after: AppData): DataChange[] {
  const changes: DataChange[] = [];
  for (const item of before.closings) if (!after.closings.some((m) => m.id === item.id)) changes.push({ action: "deleteClosing", payload: { id: item.id } });
  const upserts = after.movements.filter((m) => !equal(m, before.movements.find((item) => item.id === m.id))).sort((a, b) => (a.status === "planned" ? 0 : 1) - (b.status === "planned" ? 0 : 1));
  for (const item of upserts) changes.push({ action: "saveMovement", payload: item });
  for (const item of before.movements) if (!after.movements.some((m) => m.id === item.id)) changes.push({ action: "deleteMovement", payload: { id: item.id } });
  for (const item of after.closings) if (!equal(item, before.closings.find((m) => m.id === item.id))) changes.push({ action: "saveClosing", payload: item });
  if (!equal(before.settings, after.settings)) changes.push({ action: "saveSettings", payload: after.settings });
  return changes;
}
export function undoData(current: AppData, record: UndoRecord, now: string): AppData {
  function reverse<T extends { id: string }>(list: T[], before: T[], after: T[]) {
    const touched = new Set([...before, ...after].filter((m) => !equal(before.find((item) => item.id === m.id), after.find((item) => item.id === m.id))).map((m) => m.id));
    for (const id of touched) if (comparable(list.find((m) => m.id === id)) !== comparable(after.find((m) => m.id === id))) throw new Error("Hay cambios posteriores en estos datos. No se han sobrescrito; revisa el movimiento manualmente.");
    return [...list.filter((m) => !touched.has(m.id)), ...before.filter((m) => touched.has(m.id)).map((m) => "updatedAt" in m ? { ...m, updatedAt: now } : m)];
  }
  let settings = current.settings;
  if (!equal(record.before.settings, record.after.settings)) {
    if (comparable(current.settings) !== comparable(record.after.settings)) throw new Error("Las preferencias han cambiado después. No se han sobrescrito.");
    settings = { ...record.before.settings, updatedAt: now };
  }
  return { ...current, settings, movements: reverse(current.movements, record.before.movements, record.after.movements), closings: reverse(current.closings, record.before.closings, record.after.closings) };
}
export function exportBackup(data: AppData, now: string) { return JSON.stringify({ app: "mi-balance", version: 1, exportedAt: now, data }, null, 2); }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isMonth = (s: unknown): s is string => typeof s === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
function isDate(s: unknown): s is string { return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s; }
const cents = (n: unknown, positive = false): n is number => Number.isInteger(n) && Number(n) >= (positive ? 1 : 0) && Number(n) <= 2_147_483_647;
const stamp = (s: unknown) => typeof s === "string" && Number.isFinite(Date.parse(s));
const text = (s: unknown, max = 160) => typeof s === "string" && s.trim().length > 0 && s.length <= max;

export function importBackup(contents: string): AppData {
  const fail = () => { throw new Error("La copia no es válida o contiene datos incompatibles. No se ha cambiado nada."); };
  if (contents.length > 20_000_000) return fail();
  let root;
  try { root = JSON.parse(contents); } catch { return fail(); }
  if (root?.app !== "mi-balance" || root.version !== 1 || !root.data) return fail();
  const data = root.data as AppData;
  if (!Array.isArray(data.movements) || !Array.isArray(data.categories) || !Array.isArray(data.closings) || !data.settings) return fail();
  const kinds = ["expense", "income", "saving"];
  const categoryIds = new Set<string>();
  for (const c of data.categories) {
    if (!c || !text(c.id) || !text(c.name) || !kinds.includes(c.kind) || !/^#[0-9a-f]{6}$/i.test(c.color) || !text(c.icon) || categoryIds.has(c.id)) return fail();
    categoryIds.add(c.id);
  }
  const templateValid = (t: { id: string; concept: string; amountCents: number; kind: string; categoryId: string }) => t && uuid.test(t.id) && text(t.concept) && cents(t.amountCents, true) && data.categories.some((c) => c.id === t.categoryId && c.kind === t.kind);
  const ids = new Set<string>();
  for (const m of data.movements) {
    if (!templateValid(m) || !isDate(m.date) || !["planned", "confirmed"].includes(m.status) || !stamp(m.createdAt) || !stamp(m.updatedAt) || ids.has(m.id) || (m.notes !== undefined && (typeof m.notes !== "string" || m.notes.length > 10000)) || (m.forecastId && !uuid.test(m.forecastId)) || (m.fundingPlanId && !uuid.test(m.fundingPlanId)) || (m.fundingRole && !["target", "contribution"].includes(m.fundingRole)) || (m.fundingInstallments !== undefined && (!Number.isInteger(m.fundingInstallments) || m.fundingInstallments < 2 || m.fundingInstallments > 120))) return fail();
    ids.add(m.id);
  }
  for (const m of data.movements) if (m.forecastId && !data.movements.some((f) => f.id === m.forecastId && f.status === "planned" && m.status === "confirmed" && f.kind === m.kind && f.date.slice(0, 7) === m.date.slice(0, 7) && f.id !== m.id)) return fail();
  const closeMonths = new Set<string>(), closeIds = new Set<string>();
  for (const c of data.closings) {
    if (!c || !uuid.test(c.id) || !isMonth(c.month) || !stamp(c.closedAt) || typeof c.notes !== "string" || !c.snapshot || closeMonths.has(c.month) || closeIds.has(c.id)) return fail();
    const s = c.snapshot;
    if (![s.incomeCents, s.expenseCents, s.savingCents, s.fundingUsedCents, s.movementCount].every((n) => Number.isSafeInteger(n) && n >= 0) || !Number.isSafeInteger(s.resultCents) || (s.openingBalanceCents !== undefined && !Number.isSafeInteger(s.openingBalanceCents))) return fail();
    if (s.carriedForecasts !== undefined && (!Array.isArray(s.carriedForecasts) || s.carriedForecasts.some((f) => !f || !uuid.test(f.sourceForecastId) || !uuid.test(f.targetMovementId) || !cents(f.amountCents, true)))) return fail();
    closeMonths.add(c.month); closeIds.add(c.id);
  }
  const s = data.settings;
  const widgetIds = ["balance", "projection", "fundingGoals", "progress", "forecasts", "recent", "categoryChart", "annualChart", "spendable", "categoryBudgets", "quickEntry"];
  if (!text(s.displayName) || !cents(s.monthlyBudgetCents) || !cents(s.monthlySavingGoalCents) || s.currency !== "EUR" || !stamp(s.updatedAt) || !Array.isArray(s.homeWidgets) || s.homeWidgets.some((w) => !widgetIds.includes(w)) || new Set(s.homeWidgets).size !== s.homeWidgets.length) return fail();
  if (s.favorites !== undefined && (!Array.isArray(s.favorites) || s.favorites.some((t) => !templateValid(t)) || new Set(s.favorites.map((t) => t.id)).size !== s.favorites.length)) return fail();
  if (s.categoryBudgets !== undefined && (!Array.isArray(s.categoryBudgets) || s.categoryBudgets.some((b) => !b || !data.categories.some((c) => c.id === b.categoryId && c.kind === "expense") || !cents(b.monthlyCents, true) || typeof b.rollover !== "boolean" || !isMonth(b.startMonth)) || new Set(s.categoryBudgets.map((b) => b.categoryId)).size !== s.categoryBudgets.length)) return fail();
  for (const b of s.categoryBudgets ?? []) if (b.revisions !== undefined && (!Array.isArray(b.revisions) || b.revisions.some((r) => !r || !isMonth(r.startMonth) || r.startMonth < b.startMonth || !cents(r.monthlyCents, true) || typeof r.rollover !== "boolean") || new Set(b.revisions.map((r) => r.startMonth)).size !== b.revisions.length)) return fail();
  if (s.recurringSeries !== undefined && (!Array.isArray(s.recurringSeries) || s.recurringSeries.some((r) => !templateValid(r) || !isDate(r.startDate) || !uuid.test(r.seedId) || typeof r.active !== "boolean" || !Number.isInteger(r.intervalMonths) || r.intervalMonths < 1 || r.intervalMonths > 120 || !Array.isArray(r.skipMonths) || r.skipMonths.some((m) => !isMonth(m)) || (r.endMonth !== undefined && !isMonth(r.endMonth))) || new Set(s.recurringSeries.map((r) => r.id)).size !== s.recurringSeries.length)) return fail();
  return data;
}
export function exportCsv(data: AppData) {
  function cell(value: string) { const safe = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value; return `"${safe.replace(/"/g, '""')}"`; }
  const rows = data.movements.map((m: Movement) => [m.date, m.concept, data.categories.find((c) => c.id === m.categoryId)?.name ?? m.categoryId, ({ expense: "Gasto", income: "Ingreso", saving: "Ahorro" })[m.kind], m.status === "planned" ? "Previsión" : "Real", formatAmount(m.amountCents), m.forecastId ?? "", m.notes ?? ""]);
  return "\uFEFF" + [["Fecha", "Concepto", "Categoría", "Tipo", "Estado", "Importe EUR", "Previsión aplicada", "Nota"], ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
}
export function planningPreferences(settings: AppSettings) { return { favorites: settings.favorites ?? [], categoryBudgets: settings.categoryBudgets ?? [], recurringSeries: settings.recurringSeries ?? [], planningWidgetsVersion: settings.planningWidgetsVersion ?? 1 }; }
