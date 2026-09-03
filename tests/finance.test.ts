import assert from "node:assert/strict";
import test from "node:test";

import {
  createForecastCarryovers,
  forecastUsage,
  movementDisplayAmountCents,
  revertForecastCarryovers,
  snapshotWithCarryover,
} from "../app/lib/finance.ts";
import type { MonthlyClose, Movement } from "../app/lib/types.ts";

const forecast: Movement = {
  id: "forecast-1",
  concept: "Compra prevista",
  amountCents: 10_000,
  date: "2026-08-20",
  categoryId: "shopping",
  kind: "expense",
  status: "planned",
  createdAt: "2026-08-01T10:00:00.000Z",
  updatedAt: "2026-08-01T10:00:00.000Z",
};

function linkedExpense(id: string, amountCents: number): Movement {
  return {
    ...forecast,
    id,
    amountCents,
    status: "confirmed",
    forecastId: forecast.id,
    createdAt: `2026-08-0${id === "expense-1" ? "2" : "3"}T10:00:00.000Z`,
    updatedAt: `2026-08-0${id === "expense-1" ? "2" : "3"}T10:00:00.000Z`,
  };
}

test("una previsión muestra únicamente el importe pendiente después del gasto aplicado", () => {
  const expense = linkedExpense("expense-1", 6_000);
  const movements = [forecast, expense];
  const usage = forecastUsage(movements, forecast);

  assert.equal(usage.appliedCents, 6_000);
  assert.equal(usage.remainingCents, 4_000);
  assert.equal(movementDisplayAmountCents(movements, forecast), 4_000);
  assert.equal(movementDisplayAmountCents(movements, expense), 6_000);
  assert.equal(movementDisplayAmountCents(movements, forecast) + movementDisplayAmountCents(movements, expense), 10_000);
});

test("si el gasto supera la previsión, esta queda a cero y se conserva todo el coste real", () => {
  const firstExpense = linkedExpense("expense-1", 6_000);
  const secondExpense = linkedExpense("expense-2", 6_000);
  const movements = [forecast, firstExpense, secondExpense];
  const usage = forecastUsage(movements, forecast);

  assert.equal(usage.remainingCents, 0);
  assert.equal(usage.overrunCents, 2_000);
  assert.equal(movementDisplayAmountCents(movements, forecast), 0);
  assert.equal(
    movementDisplayAmountCents(movements, forecast) +
      movementDisplayAmountCents(movements, firstExpense) +
      movementDisplayAmountCents(movements, secondExpense),
    12_000,
  );
});

test("el disponible del cierre anterior se usa como saldo inicial del mes siguiente", () => {
  const previousClose: MonthlyClose = {
    id: "close-august",
    month: "2026-08",
    closedAt: "2026-08-31T20:00:00.000Z",
    notes: "",
    snapshot: {
      incomeCents: 200_000,
      expenseCents: 120_000,
      savingCents: 20_000,
      fundingUsedCents: 0,
      resultCents: 60_000,
      movementCount: 3,
    },
  };
  const septemberIncome: Movement = {
    ...forecast,
    id: "september-income",
    concept: "Ingreso septiembre",
    amountCents: 100_000,
    date: "2026-09-01",
    categoryId: "salary",
    kind: "income",
    status: "confirmed",
  };
  const septemberExpense: Movement = {
    ...forecast,
    id: "september-expense",
    concept: "Gasto septiembre",
    amountCents: 30_000,
    date: "2026-09-02",
    status: "confirmed",
  };

  const snapshot = snapshotWithCarryover([septemberIncome, septemberExpense], [previousClose], "2026-09");
  assert.equal(snapshot.openingBalanceCents, 60_000);
  assert.equal(snapshot.resultCents, 130_000);
});

test("el cierre acumula únicamente lo pendiente en el mismo concepto del mes siguiente", () => {
  const expense = linkedExpense("expense-1", 6_000);
  const nextForecast: Movement = {
    ...forecast,
    id: "forecast-september",
    amountCents: 5_000,
    date: "2026-09-20",
  };
  const result = createForecastCarryovers([forecast, expense, nextForecast], "2026-08", "2026-08-31T20:00:00.000Z");

  assert.equal(result.upserts.length, 1);
  assert.equal(result.upserts[0].id, nextForecast.id);
  assert.equal(result.upserts[0].amountCents, 9_000);
  assert.deepEqual(result.carriedForecasts, [{ sourceForecastId: forecast.id, targetMovementId: nextForecast.id, amountCents: 4_000 }]);
});

test("el asistente permite trasladar solo una parte a un mes posterior elegido", () => {
  const octoberForecast: Movement = {
    ...forecast,
    id: "forecast-october",
    amountCents: 5_000,
    date: "2026-10-20",
  };
  const result = createForecastCarryovers(
    [forecast, octoberForecast],
    "2026-08",
    "2026-08-31T20:00:00.000Z",
    [{ sourceForecastId: forecast.id, targetMonth: "2026-10", amountCents: 3_000 }],
  );

  assert.equal(result.upserts.length, 1);
  assert.equal(result.upserts[0].id, octoberForecast.id);
  assert.equal(result.upserts[0].amountCents, 8_000);
  assert.deepEqual(result.carriedForecasts, [{ sourceForecastId: forecast.id, targetMovementId: octoberForecast.id, amountCents: 3_000 }]);
});

test("el asistente no traslada las previsiones marcadas para omitir", () => {
  const anotherForecast: Movement = {
    ...forecast,
    id: "forecast-2",
    concept: "Otra compra",
  };
  const result = createForecastCarryovers(
    [forecast, anotherForecast],
    "2026-08",
    "2026-08-31T20:00:00.000Z",
    [{ sourceForecastId: forecast.id, targetMonth: "2026-09", amountCents: 4_000 }],
  );

  assert.equal(result.upserts.length, 1);
  assert.equal(result.carriedForecasts.length, 1);
  assert.equal(result.carriedForecasts[0].sourceForecastId, forecast.id);
});

test("el asistente impide trasladar una previsión al mismo mes que se cierra", () => {
  const result = createForecastCarryovers(
    [forecast],
    "2026-08",
    "2026-08-31T20:00:00.000Z",
    [{ sourceForecastId: forecast.id, targetMonth: "2026-08", amountCents: 4_000 }],
  );

  assert.equal(result.upserts.length, 0);
  assert.equal(result.carriedForecasts.length, 0);
});

test("el cierre acumula el mismo concepto aunque la categoría haya cambiado", () => {
  const augustClothes: Movement = {
    ...forecast,
    id: "clothes-august",
    concept: " Rópa ",
    amountCents: 10_000,
    date: "2026-08-20",
    categoryId: "shopping",
  };
  const septemberClothes: Movement = {
    ...forecast,
    id: "clothes-september",
    concept: "ropa",
    amountCents: 5_000,
    date: "2026-09-20",
    categoryId: "other-expense",
  };
  const result = createForecastCarryovers([augustClothes, septemberClothes], "2026-08", "2026-08-31T20:00:00.000Z");

  assert.equal(result.upserts.length, 1);
  assert.equal(result.upserts[0].id, septemberClothes.id);
  assert.equal(result.upserts[0].amountCents, 15_000);
  assert.deepEqual(result.carriedForecasts, [{ sourceForecastId: augustClothes.id, targetMovementId: septemberClothes.id, amountCents: 10_000 }]);
});

test("el cierre no mezcla planes de fraccionamiento distintos aunque compartan concepto", () => {
  const augustPlan: Movement = {
    ...forecast,
    id: "plan-august",
    concept: "Ropa",
    amountCents: 10_000,
    date: "2026-08-20",
    fundingPlanId: "plan-a",
    fundingRole: "target",
  };
  const septemberPlan: Movement = {
    ...forecast,
    id: "plan-september",
    concept: "Ropa",
    amountCents: 5_000,
    date: "2026-09-20",
    fundingPlanId: "plan-b",
    fundingRole: "target",
  };
  const result = createForecastCarryovers([augustPlan, septemberPlan], "2026-08", "2026-08-31T20:00:00.000Z");

  assert.equal(result.upserts.length, 1);
  assert.notEqual(result.upserts[0].id, septemberPlan.id);
  assert.equal(result.upserts[0].amountCents, 10_000);
});

test("reabrir el mes deshace solo la cantidad que había sido acumulada", () => {
  const nextForecast: Movement = {
    ...forecast,
    id: "forecast-september",
    amountCents: 9_000,
    date: "2026-09-20",
  };
  const reverted = revertForecastCarryovers(
    [nextForecast],
    [{ sourceForecastId: forecast.id, targetMovementId: nextForecast.id, amountCents: 4_000 }],
    "2026-09-01T08:00:00.000Z",
  );

  assert.equal(reverted.deletes.length, 0);
  assert.equal(reverted.upserts[0].amountCents, 5_000);
});

