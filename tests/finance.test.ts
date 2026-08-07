import assert from "node:assert/strict";
import test from "node:test";

import { forecastUsage, movementDisplayAmountCents } from "../app/lib/finance.ts";
import type { Movement } from "../app/lib/types.ts";

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
