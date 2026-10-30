import { dateForMonth, forecastUsage, forecastsForMonth, moveMonth, projectionWithCarryover, snapshotWithCarryover } from "./finance.ts";
import type { AppData, AppSettings, CategoryBudget, Movement, RecurringSeries } from "./types.ts";

export function conceptKey(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " "); }
export function occurrenceId(series: RecurringSeries, month: string) {
  // Stable UUIDs make generation idempotent across devices, without a new movement column.
  const suffix = (Number(month.slice(0, 4)) * 12 + Number(month.slice(5)) - 1).toString(16).padStart(12, "0");
  return `${series.id.slice(0, 24)}${suffix}`;
}
export function seriesForMovement(settings: AppSettings, movement: Movement) {
  return settings.recurringSeries?.find((series) => series.seedId === movement.id || (movement.id.slice(0, 24) === series.id.slice(0, 24) && /^[0-9a-f]{12}$/i.test(movement.id.slice(24))));
}
export function seriesAmountForMonth(series: RecurringSeries, month: string) {
  return [...(series.amountRevisions ?? [])].filter((r) => r.fromMonth <= month).sort((a, b) => b.fromMonth.localeCompare(a.fromMonth))[0]?.amountCents ?? series.amountCents;
}
function reviseSeriesAmount(series: RecurringSeries, fromMonth: string, amountCents: number): RecurringSeries {
  return { ...series, amountRevisions: [...(series.amountRevisions ?? []).filter((r) => r.fromMonth < fromMonth), { fromMonth, amountCents }] };
}
export function generateRecurring(data: AppData, startMonth: string, now: string): Movement[] {
  const ids = new Set(data.movements.map((item) => item.id));
  const closed = new Set(data.closings.map((item) => item.month));
  const result: Movement[] = [];
  for (const series of data.settings.recurringSeries ?? []) {
    if (!series.active) continue;
    const anchor = series.startDate.slice(0, 7);
    for (let i = 0; i < 12; i++) {
      const month = moveMonth(startMonth, i);
      const distance = (Number(month.slice(0, 4)) - Number(anchor.slice(0, 4))) * 12 + Number(month.slice(5)) - Number(anchor.slice(5));
      if (distance <= 0 || distance % series.intervalMonths !== 0 || (series.endMonth && month > series.endMonth) || series.skipMonths.includes(month) || closed.has(month)) continue;
      const id = occurrenceId(series, month);
      if (ids.has(id)) continue;
      result.push({ id, concept: series.concept, amountCents: seriesAmountForMonth(series, month), categoryId: series.categoryId, kind: series.kind, date: dateForMonth(series.startDate, month), status: "planned", createdAt: now, updatedAt: now });
      ids.add(id);
    }
  }
  return result;
}
export function updateFutureSeries(data: AppData, movement: Movement, now: string) {
  const series = seriesForMovement(data.settings, movement);
  if (!series) return { settings: data.settings, movements: [movement] };
  const settings = { ...data.settings, updatedAt: now, recurringSeries: data.settings.recurringSeries!.map((item) => item.id === series.id ? { ...reviseSeriesAmount(item, movement.date.slice(0, 7), movement.amountCents), concept: movement.concept, categoryId: movement.categoryId, kind: movement.kind } : item) };
  const movements = data.movements.filter((item) => item.id !== movement.id && seriesForMovement(data.settings, item)?.id === series.id && item.date >= movement.date && item.status === "planned" && !data.closings.some((close) => item.date.startsWith(close.month)) && forecastUsage(data.movements, item).appliedCents === 0).map((item) => ({ ...item, concept: movement.concept, amountCents: movement.amountCents, categoryId: movement.categoryId, kind: movement.kind, updatedAt: now }));
  return { settings, movements: [movement, ...movements] };
}

export type ConceptBulkAction = { kind: "amount"; amountCents: number } | { kind: "delete" };
export function previewConceptBulkChanges(data: AppData, source: Movement, fromMonth: string, includeConfirmed = false) {
  const matches = (item: { concept: string; kind: Movement["kind"] }) => item.kind === source.kind && conceptKey(item.concept) === conceptKey(source.concept);
  const closed = new Set(data.closings.map((c) => c.month));
  const carried = new Set(data.closings.flatMap((c) => (c.snapshot.carriedForecasts ?? []).flatMap((f) => [f.sourceForecastId, f.targetMovementId])));
  const linked = new Set(data.movements.filter((m) => m.forecastId).map((m) => m.forecastId));
  const excluded = { closed: 0, funding: 0, carried: 0, linked: 0, confirmed: 0 };
  const movements = data.movements.filter((m) => {
    if (!matches(m) || m.date.slice(0, 7) < fromMonth) return false;
    const reason = closed.has(m.date.slice(0, 7)) ? "closed" : m.fundingPlanId ? "funding" : carried.has(m.id) ? "carried" : m.status === "planned" && linked.has(m.id) ? "linked" : m.status === "confirmed" && !includeConfirmed ? "confirmed" : undefined;
    if (reason) { excluded[reason]++; return false; }
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  // Include paused series too: resuming them must respect the user's bulk change.
  const series = (data.settings.recurringSeries ?? []).filter((s) => matches(s) && (!s.endMonth || s.endMonth >= fromMonth));
  return { movements, series, excluded };
}
export function applyConceptBulkChanges(data: AppData, source: Movement, fromMonth: string, action: ConceptBulkAction, now: string, includeConfirmed = false): AppData {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(fromMonth)) throw new Error("Selecciona un mes válido.");
  if (!data.movements.some((m) => m.id === source.id && m.kind === source.kind && conceptKey(m.concept) === conceptKey(source.concept))) throw new Error("El concepto ha cambiado. Cierra el formulario y vuelve a abrirlo.");
  if (action.kind === "amount" && (!Number.isInteger(action.amountCents) || action.amountCents <= 0 || action.amountCents > 2147483647)) throw new Error("Introduce un importe mayor que cero y dentro del límite permitido.");
  const preview = previewConceptBulkChanges(data, source, fromMonth, includeConfirmed);
  if (!preview.movements.length && !preview.series.length) throw new Error("No hay movimientos ni series que se puedan modificar desde ese mes.");
  const ids = new Set(preview.movements.map((m) => m.id));
  const seriesIds = new Set(preview.series.map((s) => s.id));
  const settings = seriesIds.size ? { ...data.settings, updatedAt: now, recurringSeries: data.settings.recurringSeries!.map((s) => !seriesIds.has(s.id) ? s : action.kind === "amount" ? reviseSeriesAmount(s, fromMonth, action.amountCents) : { ...s, endMonth: moveMonth(fromMonth, -1) }) } : data.settings;
  const movements = action.kind === "delete" ? data.movements.filter((m) => !ids.has(m.id)) : data.movements.map((m) => ids.has(m.id) ? { ...m, amountCents: action.amountCents, updatedAt: now } : m);
  return { ...data, settings, movements };
}

export function spendableForMonth(data: AppData, month: string, today: string) {
  const actual = snapshotWithCarryover(data.movements, data.closings, month);
  const projected = projectionWithCarryover(data.movements, data.closings, month);
  const expectedIncomeCents = projected.incomeCents - actual.incomeCents;
  const extraSavingCents = Math.max(0, data.settings.monthlySavingGoalCents - projected.savingCents);
  const availableCents = projected.resultCents - expectedIncomeCents - extraSavingCents;
  const budgetLeft = data.settings.monthlyBudgetCents > 0 ? data.settings.monthlyBudgetCents - projected.expenseCents : Infinity;
  const allowanceCents = Math.max(0, Math.min(availableCents, budgetLeft));
  const [year, m] = month.split("-").map(Number);
  const days = month < today.slice(0, 7) ? 0 : new Date(year, m, 0).getDate() - (month === today.slice(0, 7) ? Number(today.slice(8)) - 1 : 0);
  return { availableCents, allowanceCents, weeklyCents: days ? Math.round(allowanceCents * Math.min(7, days) / days) : 0, expectedIncomeCents, actualIncomeCents: actual.incomeCents, reservedCents: actual.resultCents - availableCents, days };
}

export function categoryBudgetForMonth(data: AppData, budget: CategoryBudget, month: string) {
  const effective = (key: string) => [...(budget.revisions ?? [])].filter((r) => r.startMonth <= key).sort((a, b) => b.startMonth.localeCompare(a.startMonth))[0] ?? budget;
  const currentBudget = effective(month);
  const spent = (key: string) => data.movements.filter((m) => m.date.startsWith(key) && m.kind === "expense" && m.status === "confirmed" && m.categoryId === budget.categoryId).reduce((n, m) => n + m.amountCents, 0);
  let carriedCents = 0;
  if (currentBudget.rollover && month > budget.startMonth) {
    // Only the contiguous closed chain is final; unrecorded/open months never create savings.
    const chain: string[] = [];
    let previous = moveMonth(month, -1);
    while (previous >= budget.startMonth && data.closings.some((close) => close.month === previous)) { chain.unshift(previous); previous = moveMonth(previous, -1); }
    for (const key of chain) { const plan = effective(key); carriedCents = plan.rollover ? Math.max(0, carriedCents + plan.monthlyCents - spent(key)) : 0; }
  }
  const spentCents = spent(month);
  const pendingCents = forecastsForMonth(data.movements, month).filter((item) => item.forecast.categoryId === budget.categoryId && item.forecast.kind === "expense").reduce((n, item) => n + item.remainingCents, 0);
  const limitCents = month >= budget.startMonth ? currentBudget.monthlyCents + carriedCents : 0;
  return { ...budget, monthlyCents: currentBudget.monthlyCents, rollover: currentBudget.rollover, limitCents, carriedCents, spentCents, pendingCents, leftCents: limitCents - spentCents - pendingCents };
}

export type InsightQuery = { title: string; concept?: string; categoryId?: string; fromMonth: string; toMonth: string; onlyConfirmed?: boolean; kind?: Movement["kind"]; linkedOnly?: boolean };
export function insightMovements(data: AppData, query: InsightQuery) {
  const forecastIds = new Set(data.movements.filter((m) => m.status === "planned" && (!query.concept || conceptKey(m.concept) === conceptKey(query.concept))).map((m) => m.id));
  return data.movements.filter((m) => m.date.slice(0, 7) >= query.fromMonth && m.date.slice(0, 7) <= query.toMonth && (!query.kind || m.kind === query.kind) && (!query.categoryId || m.categoryId === query.categoryId) && (!query.onlyConfirmed || m.status === "confirmed") && (!query.concept || (query.linkedOnly ? forecastIds.has(m.id) || (m.status === "confirmed" && forecastIds.has(m.forecastId ?? "")) : conceptKey(m.concept) === conceptKey(query.concept))));
}
