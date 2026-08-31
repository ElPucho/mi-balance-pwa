import type { Category, ForecastCarryover, MonthlyClose, Movement, MonthlySnapshot, MovementKind } from "./types";

export type ForecastUsage = {
  forecast: Movement;
  appliedCents: number;
  remainingCents: number;
  overrunCents: number;
  progress: number;
};

export type FundingPlanProgress = {
  target: Movement;
  savedCents: number;
  projectedCents: number;
  remainingCents: number;
  progress: number;
};

export const money = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export const shortMoney = new Intl.NumberFormat("es-ES", {
  style: "currency",
  currency: "EUR",
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatMoney(cents: number) {
  return money.format(cents / 100);
}

export function formatShortMoney(cents: number) {
  return shortMoney.format(cents / 100);
}

export function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function dateFromMonth(key: string) {
  const [year, month] = key.split("-").map(Number);
  return new Date(year, month - 1, 1, 12);
}

export function moveMonth(key: string, delta: number) {
  const value = dateFromMonth(key);
  value.setMonth(value.getMonth() + delta);
  return monthKey(value);
}

export function dateForMonth(sourceDate: string, targetMonth: string) {
  const [year, month] = targetMonth.split("-").map(Number);
  const sourceDay = Number(sourceDate.slice(8, 10)) || 1;
  const lastDay = new Date(year, month, 0, 12).getDate();
  return `${targetMonth}-${String(Math.min(sourceDay, lastDay)).padStart(2, "0")}`;
}

export function monthLabel(key: string, style: "long" | "short" = "long") {
  const label = new Intl.DateTimeFormat("es-ES", { month: style, year: style === "long" ? "numeric" : undefined }).format(dateFromMonth(key));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function dayLabel(date: string) {
  return new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short" }).format(new Date(`${date}T12:00:00`));
}

export function movementsForMonth(movements: Movement[], key: string) {
  return movements.filter((movement) => movement.date.startsWith(key));
}

export function snapshotForMonth(movements: Movement[], key: string): MonthlySnapshot {
  const confirmed = movementsForMonth(movements, key).filter((movement) => movement.status === "confirmed");
  const incomeCents = confirmed.filter((movement) => movement.kind === "income").reduce((sum, movement) => sum + movement.amountCents, 0);
  const expenseCents = confirmed.filter((movement) => movement.kind === "expense").reduce((sum, movement) => sum + movement.amountCents, 0);
  const savingCents = confirmed.filter((movement) => movement.kind === "saving").reduce((sum, movement) => sum + movement.amountCents, 0);
  const fundingUsedCents = confirmed
    .filter((movement) => movement.kind === "expense" && movement.fundingPlanId)
    .reduce((sum, movement) => sum + Math.min(movement.amountCents, actualFundingForPlan(movements, movement.fundingPlanId!, movement.date)), 0);
  return {
    incomeCents,
    expenseCents,
    savingCents,
    resultCents: incomeCents - expenseCents - savingCents + fundingUsedCents,
    fundingUsedCents,
    movementCount: confirmed.length,
  };
}

export function openingBalanceForMonth(closings: MonthlyClose[], key: string) {
  return closings.find((closing) => closing.month === moveMonth(key, -1))?.snapshot.resultCents ?? 0;
}

export function snapshotWithCarryover(movements: Movement[], closings: MonthlyClose[], key: string): MonthlySnapshot {
  const snapshot = snapshotForMonth(movements, key);
  const openingBalanceCents = openingBalanceForMonth(closings, key);
  return {
    ...snapshot,
    openingBalanceCents,
    resultCents: openingBalanceCents + snapshot.resultCents,
  };
}

export function plannedForMonth(movements: Movement[], key: string) {
  const planned = movementsForMonth(movements, key).filter((movement) => movement.status === "planned");
  return {
    incomeCents: planned.filter((movement) => movement.kind === "income").reduce((sum, movement) => sum + movement.amountCents, 0),
    expenseCents: planned.filter((movement) => movement.kind === "expense").reduce((sum, movement) => sum + movement.amountCents, 0),
    savingCents: planned.filter((movement) => movement.kind === "saving").reduce((sum, movement) => sum + movement.amountCents, 0),
    count: planned.length,
  };
}

export function forecastUsage(movements: Movement[], forecast: Movement): ForecastUsage {
  const forecastMonth = forecast.date.slice(0, 7);
  const appliedCents = movements
    .filter(
      (movement) =>
        movement.forecastId === forecast.id &&
        movement.status === "confirmed" &&
        movement.kind === forecast.kind &&
        movement.date.startsWith(forecastMonth),
    )
    .reduce((sum, movement) => sum + movement.amountCents, 0);
  return {
    forecast,
    appliedCents,
    remainingCents: Math.max(0, forecast.amountCents - appliedCents),
    overrunCents: Math.max(0, appliedCents - forecast.amountCents),
    progress: forecast.amountCents > 0 ? (appliedCents / forecast.amountCents) * 100 : 0,
  };
}

export function movementDisplayAmountCents(movements: Movement[], movement: Movement) {
  return movement.status === "planned" ? forecastUsage(movements, movement).remainingCents : movement.amountCents;
}

export function forecastsForMonth(movements: Movement[], key: string) {
  return movementsForMonth(movements, key)
    .filter((movement) => movement.status === "planned")
    .map((forecast) => forecastUsage(movements, forecast))
    .sort((a, b) => a.forecast.date.localeCompare(b.forecast.date) || a.forecast.createdAt.localeCompare(b.forecast.createdAt));
}

export function projectionForMonth(movements: Movement[], key: string): MonthlySnapshot {
  const actual = snapshotForMonth(movements, key);
  const forecasts = forecastsForMonth(movements, key);
  const remaining = (kind: MovementKind) =>
    forecasts
      .filter((item) => item.forecast.kind === kind)
      .reduce((sum, item) => sum + item.remainingCents, 0);
  const incomeCents = actual.incomeCents + remaining("income");
  const expenseCents = actual.expenseCents + remaining("expense");
  const savingCents = actual.savingCents + remaining("saving");
  const projectedFundingUsedCents = forecasts
    .filter((item) => item.forecast.kind === "expense" && item.forecast.fundingRole === "target" && item.forecast.fundingPlanId)
    .reduce((sum, item) => {
      const planId = item.forecast.fundingPlanId!;
      const available = projectedFundingForPlan(movements, planId, item.forecast.date);
      const alreadyUsed = actualFundingUsedForPlanInMonth(movements, planId, key);
      return sum + Math.min(item.remainingCents, Math.max(0, available - alreadyUsed));
    }, 0);
  const fundingUsedCents = actual.fundingUsedCents + projectedFundingUsedCents;
  return {
    incomeCents,
    expenseCents,
    savingCents,
    resultCents: incomeCents - expenseCents - savingCents + fundingUsedCents,
    fundingUsedCents,
    movementCount: actual.movementCount + forecasts.filter((item) => item.remainingCents > 0).length,
  };
}

export function projectionWithCarryover(movements: Movement[], closings: MonthlyClose[], key: string): MonthlySnapshot {
  const projection = projectionForMonth(movements, key);
  const openingBalanceCents = openingBalanceForMonth(closings, key);
  return {
    ...projection,
    openingBalanceCents,
    resultCents: openingBalanceCents + projection.resultCents,
  };
}

function normalizedConcept(value: string) {
  return value.trim().toLocaleLowerCase("es").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ");
}

function carryoverMatchScore(candidate: Movement, source: Movement) {
  if (
    candidate.status !== "planned" ||
    candidate.kind !== source.kind ||
    normalizedConcept(candidate.concept) !== normalizedConcept(source.concept)
  ) return -1;

  const candidateHasFunding = Boolean(candidate.fundingPlanId || candidate.fundingRole);
  const sourceHasFunding = Boolean(source.fundingPlanId || source.fundingRole);
  if (candidateHasFunding || sourceHasFunding) {
    if (
      (candidate.fundingPlanId ?? "") !== (source.fundingPlanId ?? "") ||
      (candidate.fundingRole ?? "") !== (source.fundingRole ?? "")
    ) return -1;
  }

  return candidate.categoryId === source.categoryId ? 2 : 1;
}

function bestCarryoverTargetIndex(movements: Movement[], source: Movement, nextMonth: string) {
  let bestIndex = -1;
  let bestScore = -1;
  for (let index = 0; index < movements.length; index += 1) {
    const candidate = movements[index];
    if (!candidate.date.startsWith(nextMonth)) continue;
    const score = carryoverMatchScore(candidate, source);
    if (score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }
  return bestIndex;
}

export function createForecastCarryovers(movements: Movement[], key: string, timestamp: string) {
  const nextMonth = moveMonth(key, 1);
  const working = [...movements];
  const upserts = new Map<string, Movement>();
  const carriedForecasts: ForecastCarryover[] = [];

  for (const usage of forecastsForMonth(movements, key).filter((item) => item.remainingCents > 0)) {
    const existingIndex = bestCarryoverTargetIndex(working, usage.forecast, nextMonth);
    let target: Movement;

    if (existingIndex >= 0) {
      target = {
        ...working[existingIndex],
        amountCents: working[existingIndex].amountCents + usage.remainingCents,
        updatedAt: timestamp,
      };
      working[existingIndex] = target;
    } else {
      target = {
        ...usage.forecast,
        id: crypto.randomUUID(),
        amountCents: usage.remainingCents,
        date: dateForMonth(usage.forecast.date, nextMonth),
        status: "planned",
        forecastId: undefined,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      working.push(target);
    }

    upserts.set(target.id, target);
    carriedForecasts.push({
      sourceForecastId: usage.forecast.id,
      targetMovementId: target.id,
      amountCents: usage.remainingCents,
    });
  }

  return { upserts: [...upserts.values()], carriedForecasts };
}

export function revertForecastCarryovers(movements: Movement[], carriedForecasts: ForecastCarryover[], timestamp: string) {
  const carriedByTarget = new Map<string, number>();
  for (const carryover of carriedForecasts) {
    carriedByTarget.set(carryover.targetMovementId, (carriedByTarget.get(carryover.targetMovementId) ?? 0) + carryover.amountCents);
  }

  const upserts: Movement[] = [];
  const deletes: string[] = [];
  for (const [targetId, carriedCents] of carriedByTarget) {
    const target = movements.find((movement) => movement.id === targetId);
    if (!target) continue;
    const remainingCents = target.amountCents - carriedCents;
    if (remainingCents > 0) upserts.push({ ...target, amountCents: remainingCents, updatedAt: timestamp });
    else deletes.push(targetId);
  }
  return { upserts, deletes };
}

export function categoryBreakdown(movements: Movement[], categories: Category[], key: string) {
  const totals = new Map<string, number>();
  for (const movement of movementsForMonth(movements, key)) {
    if (movement.kind !== "expense" || movement.status !== "confirmed") continue;
    totals.set(movement.categoryId, (totals.get(movement.categoryId) ?? 0) + movement.amountCents);
  }
  return [...totals.entries()]
    .map(([categoryId, value]) => {
      const category = categories.find((item) => item.id === categoryId);
      return { id: categoryId, name: category?.name ?? "Sin categoría", value, color: category?.color ?? "#8190a5", essential: category?.essential ?? false };
    })
    .sort((a, b) => b.value - a.value);
}

export function annualSeries(movements: Movement[], year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const snapshot = snapshotForMonth(movements, key);
    return {
      key,
      name: new Intl.DateTimeFormat("es-ES", { month: "short" }).format(dateFromMonth(key)).replace(".", ""),
      ingresos: snapshot.incomeCents / 100,
      gastos: snapshot.expenseCents / 100,
      ahorro: snapshot.savingCents / 100,
      resultado: snapshot.resultCents / 100,
    };
  });
}

function contributionMovements(movements: Movement[], planId: string, untilDate: string) {
  return movements.filter(
    (movement) => movement.fundingPlanId === planId && movement.fundingRole === "contribution" && movement.date <= untilDate,
  );
}

export function actualFundingForPlan(movements: Movement[], planId: string, untilDate = "9999-12-31") {
  return contributionMovements(movements, planId, untilDate)
    .filter((movement) => movement.status === "confirmed")
    .reduce((sum, movement) => sum + movement.amountCents, 0);
}

export function projectedFundingForPlan(movements: Movement[], planId: string, untilDate = "9999-12-31") {
  const contributions = contributionMovements(movements, planId, untilDate);
  const planned = contributions.filter((movement) => movement.status === "planned");
  const plannedIds = new Set(planned.map((movement) => movement.id));
  const linkedActual = new Map<string, number>();
  let standaloneActual = 0;
  for (const movement of contributions.filter((item) => item.status === "confirmed")) {
    if (movement.forecastId && plannedIds.has(movement.forecastId)) {
      linkedActual.set(movement.forecastId, (linkedActual.get(movement.forecastId) ?? 0) + movement.amountCents);
    } else {
      standaloneActual += movement.amountCents;
    }
  }
  const plannedTotal = planned.reduce(
    (sum, movement) => sum + Math.max(movement.amountCents, linkedActual.get(movement.id) ?? 0),
    0,
  );
  return standaloneActual + plannedTotal;
}

function actualFundingUsedForPlanInMonth(movements: Movement[], planId: string, key: string) {
  return movementsForMonth(movements, key)
    .filter((movement) => movement.status === "confirmed" && movement.kind === "expense" && movement.fundingPlanId === planId)
    .reduce((sum, movement) => sum + Math.min(movement.amountCents, actualFundingForPlan(movements, planId, movement.date)), 0);
}

export function fundingPlans(movements: Movement[]): FundingPlanProgress[] {
  return movements
    .filter((movement) => movement.fundingRole === "target" && movement.fundingPlanId)
    .map((target) => {
      const savedCents = actualFundingForPlan(movements, target.fundingPlanId!, target.date);
      const projectedCents = projectedFundingForPlan(movements, target.fundingPlanId!, target.date);
      return {
        target,
        savedCents,
        projectedCents,
        remainingCents: Math.max(0, target.amountCents - savedCents),
        progress: target.amountCents > 0 ? (savedCents / target.amountCents) * 100 : 0,
      };
    })
    .sort((a, b) => a.target.date.localeCompare(b.target.date));
}

export function annualProjectionSeries(movements: Movement[], closings: MonthlyClose[], year: number, today = new Date()) {
  const currentMonth = monthKey(today);
  const closedMonths = new Set(closings.map((closing) => closing.month));
  return Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const actual = snapshotForMonth(movements, key);
    const projected = key < currentMonth || closedMonths.has(key) ? actual : projectionForMonth(movements, key);
    return {
      key,
      name: new Intl.DateTimeFormat("es-ES", { month: "short" }).format(dateFromMonth(key)).replace(".", ""),
      ingresos: actual.incomeCents / 100,
      gastos: actual.expenseCents / 100,
      ahorro: actual.savingCents / 100,
      resultado: actual.resultCents / 100,
      ingresosPrevistos: projected.incomeCents / 100,
      gastosPrevistos: projected.expenseCents / 100,
      ahorroPrevisto: projected.savingCents / 100,
      resultadoPrevisto: projected.resultCents / 100,
    };
  });
}

export function annualCumulativeProjectionSeries(movements: Movement[], closings: MonthlyClose[], year: number, today = new Date()) {
  let income = 0;
  let expense = 0;
  let saving = 0;
  let result = 0;
  return annualProjectionSeries(movements, closings, year, today).map((item) => {
    income += item.ingresosPrevistos;
    expense += item.gastosPrevistos;
    saving += item.ahorroPrevisto;
    result += item.resultadoPrevisto;
    return {
      key: item.key,
      name: item.name,
      ingresosAcumulados: income,
      gastosAcumulados: expense,
      disponibleAcumulado: result,
    };
  });
}

export function parseAmount(value: string) {
  const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

