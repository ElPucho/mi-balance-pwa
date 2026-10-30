import assert from "node:assert/strict";
import test from "node:test";
import { applyConceptBulkChanges, categoryBudgetForMonth, generateRecurring, insightMovements, occurrenceId, previewConceptBulkChanges, seriesAmountForMonth, seriesForMovement, spendableForMonth, updateFutureSeries } from "../app/lib/planning.ts";
import { dataChanges, exportBackup, exportCsv, importBackup, undoData, type UndoRecord } from "../app/lib/backups.ts";
import type { AppData, MonthlyClose, Movement, RecurringSeries } from "../app/lib/types.ts";

const now = "2026-10-01T12:00:00.000Z";
function movement(extra: Partial<Movement> = {}): Movement { return { id: crypto.randomUUID(), concept: "Ropa", amountCents: 10000, date: "2026-10-15", categoryId: "shopping", kind: "expense", status: "planned", createdAt: now, updatedAt: now, ...extra }; }
function data(movements: Movement[] = []): AppData { return { movements, closings: [], categories: [{ id: "shopping", name: "Compras", kind: "expense", color: "#123456", icon: "bag" }, { id: "salary", name: "Nómina", kind: "income", color: "#123456", icon: "wallet" }, { id: "goals", name: "Objetivos", kind: "saving", color: "#123456", icon: "target" }], settings: { displayName: "Prueba", monthlyBudgetCents: 0, monthlySavingGoalCents: 0, homeWidgets: ["balance", "spendable"], currency: "EUR", updatedAt: now, favorites: [], categoryBudgets: [], recurringSeries: [], planningWidgetsVersion: 1 } }; }
function close(month: string): MonthlyClose { return { id: crypto.randomUUID(), month, closedAt: now, notes: "", snapshot: { incomeCents: 0, expenseCents: 0, savingCents: 0, fundingUsedCents: 0, movementCount: 0, resultCents: 0, carriedForecasts: [] } }; }
function series(extra: Partial<RecurringSeries> = {}): RecurringSeries { return { id: crypto.randomUUID(), seedId: crypto.randomUUID(), concept: "Seguro", amountCents: 12500, categoryId: "shopping", kind: "expense", startDate: "2026-01-31", intervalMonths: 1, active: true, skipMonths: [], ...extra }; }

test("series: generación estable, día 31 ajustado y sin duplicados al reabrir en otro dispositivo", () => {
  const state = data(); const s = series(); state.settings.recurringSeries = [s];
  const first = generateRecurring(state, "2026-01", now);
  assert.equal(first.length, 11); assert.equal(first[0].date, "2026-02-28"); assert.equal(first[0].status, "planned");
  assert.deepEqual(first.map((m) => m.id), generateRecurring(state, "2026-01", "2026-10-02T12:00:00Z").map((m) => m.id));
  assert.equal(generateRecurring({ ...state, movements: first }, "2026-01", now).length, 0);
  assert.match(first[0].id, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
});
test("series trimestrales, anuales y variables cruzan de año correctamente", () => {
  for (const [interval, count] of [[3, 4], [12, 1], [2, 6]]) { const state = data(); state.settings.recurringSeries = [series({ startDate: "2026-11-30", intervalMonths: interval })]; const generated = generateRecurring(state, "2026-12", now); assert.equal(generated.length, count); assert.equal(generated.every((m) => m.date > "2026-11-30"), true); }
});
test("series: respetan meses omitidos, cerrados, fecha final y pausa", () => {
  const state = data(); state.closings = [close("2026-03")]; const s = series({ skipMonths: ["2026-04"], endMonth: "2026-05" }); state.settings.recurringSeries = [s];
  assert.deepEqual(generateRecurring(state, "2026-01", now).map((m) => m.date.slice(0, 7)), ["2026-02", "2026-05"]);
  state.settings.recurringSeries = [{ ...s, active: false }]; assert.equal(generateRecurring(state, "2026-01", now).length, 0);
});
test("series: una modificación individual no se sobreescribe al extender el horizonte", () => {
  const state = data(); const s = series(); state.settings.recurringSeries = [s]; const edited = movement({ id: occurrenceId(s, "2026-02"), date: "2026-02-25", amountCents: 999 }); state.movements = [edited];
  assert.equal(generateRecurring(state, "2026-01", now).some((m) => m.id === edited.id), false); assert.equal(seriesForMovement(state.settings, edited)?.id, s.id);
});
test("series: cambios futuros conservan gastos reales, previsiones consumidas y meses cerrados", () => {
  const state = data(); const s = series({ startDate: "2026-09-10" }); state.settings.recurringSeries = [s];
  const oct = movement({ id: occurrenceId(s, "2026-10") }), nov = movement({ id: occurrenceId(s, "2026-11"), date: "2026-11-15" }), dec = movement({ id: occurrenceId(s, "2026-12"), date: "2026-12-15" }), jan = movement({ id: occurrenceId(s, "2027-01"), date: "2027-01-15" });
  state.movements = [oct, nov, dec, jan, movement({ forecastId: nov.id, date: "2026-11-16", status: "confirmed", amountCents: 500 })]; state.closings = [close("2026-12")];
  const result = updateFutureSeries(state, { ...oct, amountCents: 50000 }, now);
  assert.deepEqual(result.movements.map((m) => m.id), [oct.id, jan.id]); assert.equal(seriesAmountForMonth(result.settings.recurringSeries![0], "2027-01"), 50000); assert.equal(seriesAmountForMonth(result.settings.recurringSeries![0], "2026-09"), s.amountCents);
});
test("disponible: descuenta pendiente y objetivo de ahorro sin contar ingresos esperados ni duplicar previsiones", () => {
  const f = movement({ amountCents: 20000 }); const state = data([f, movement({ status: "confirmed", amountCents: 8000, forecastId: f.id }), movement({ kind: "income", categoryId: "salary", status: "confirmed", amountCents: 100000 }), movement({ kind: "income", categoryId: "salary", amountCents: 50000 }), movement({ kind: "saving", categoryId: "goals", status: "confirmed", amountCents: 5000 })]);
  state.settings.monthlySavingGoalCents = 15000; state.settings.monthlyBudgetCents = 30000;
  const result = spendableForMonth(state, "2026-10", "2026-10-01");
  assert.equal(result.availableCents, 65000); assert.equal(result.expectedIncomeCents, 50000); assert.equal(result.allowanceCents, 10000); assert.equal(result.weeklyCents, Math.round(10000 * 7 / 31));
});
test("disponible: excesos siguen restando y un saldo negativo no ofrece margen semanal", () => {
  const f = movement(); const state = data([f, movement({ status: "confirmed", forecastId: f.id, amountCents: 15000 })]); const result = spendableForMonth(state, "2026-10", "2026-10-10"); assert.equal(result.availableCents, -15000); assert.equal(result.weeklyCents, 0);
});
test("disponible: conserva saldo heredado y el último día permite distribuir todo el margen", () => {
  const state = data(); state.closings = [{ ...close("2026-09"), snapshot: { ...close("2026-09").snapshot, resultCents: 35000 } }]; assert.equal(spendableForMonth(state, "2026-10", "2026-10-31").weeklyCents, 35000); assert.equal(spendableForMonth(state, "2026-10", "2026-11-01").weeklyCents, 0);
});
test("presupuesto: acumula remanentes cerrados y muestra real + pendiente sin duplicar", () => {
  const f = movement(); const state = data([movement({ date: "2026-08-10", status: "confirmed", amountCents: 4000 }), movement({ date: "2026-09-10", status: "confirmed", amountCents: 8000 }), f, movement({ status: "confirmed", amountCents: 3000, forecastId: f.id })]); state.closings = [close("2026-08"), close("2026-09")];
  const result = categoryBudgetForMonth(state, { categoryId: "shopping", monthlyCents: 10000, rollover: true, startMonth: "2026-08" }, "2026-10");
  assert.equal(result.carriedCents, 8000); assert.equal(result.limitCents, 18000); assert.equal(result.spentCents, 3000); assert.equal(result.pendingCents, 7000); assert.equal(result.leftCents, 8000);
});
test("presupuesto: meses abiertos/ausentes no crean remanentes y los excesos no desaparecen", () => {
  const f = movement(); const state = data([f, movement({ status: "confirmed", forecastId: f.id, amountCents: 14000 })]); state.closings = [close("2026-08")]; const b = { categoryId: "shopping", monthlyCents: 10000, rollover: true, startMonth: "2026-08" };
  assert.equal(categoryBudgetForMonth(state, b, "2026-10").carriedCents, 0); assert.equal(categoryBudgetForMonth(state, b, "2026-10").leftCents, -4000);
  assert.equal(categoryBudgetForMonth(state, { ...b, rollover: false }, "2026-10").limitCents, 10000);
});
test("presupuesto: cambiar el límite no aumenta retroactivamente los remanentes cerrados", () => {
  const state = data([movement({ date: "2026-09-10", status: "confirmed", amountCents: 8000 })]); state.closings = [close("2026-09")];
  const budget = { categoryId: "shopping", monthlyCents: 20000, rollover: true, startMonth: "2026-09", revisions: [{ startMonth: "2026-09", monthlyCents: 10000, rollover: true }, { startMonth: "2026-10", monthlyCents: 20000, rollover: true }] };
  assert.equal(categoryBudgetForMonth(state, budget, "2026-10").carriedCents, 2000); assert.equal(categoryBudgetForMonth(state, budget, "2026-10").limitCents, 22000); assert.equal(categoryBudgetForMonth(state, budget, "2026-09").limitCents, 10000);
});
test("análisis: distingue gastos del mismo concepto y gastos realmente asociados a una previsión", () => {
  const f = movement({ concept: " Rópa " }); const linked = movement({ status: "confirmed", concept: "Camisa", forecastId: f.id }); const unrelated = movement({ status: "confirmed" }); const state = data([f, linked, unrelated, movement({ date: "2026-09-15" })]); const query = { title: "Ropa", concept: "ropa", kind: "expense" as const, fromMonth: "2026-10", toMonth: "2026-10" };
  assert.deepEqual(insightMovements(state, { ...query, linkedOnly: true }).map((m) => m.id), [f.id, linked.id]); assert.deepEqual(insightMovements(state, { ...query, onlyConfirmed: true }).map((m) => m.id), [unrelated.id]);
});
test("deshacer: recupera previsión y vínculo, conserva otros cambios y sincroniza previsión antes del gasto", () => {
  const f = movement(); const actual = movement({ status: "confirmed", forecastId: f.id }); const before = data([f, actual]); const after = data([{ ...actual, forecastId: undefined }]); const other = movement({ concept: "Otro" }); const record: UndoRecord = { label: "Eliminar", before, after, createdAt: now };
  const restored = undoData({ ...after, movements: [...after.movements, other] }, record, now);
  assert.equal(restored.movements.find((m) => m.id === actual.id)?.forecastId, f.id); assert.equal(restored.movements.some((m) => m.id === other.id), true);
  assert.deepEqual(dataChanges(after, restored).filter((c) => c.action === "saveMovement").map((c) => (c.payload as Movement).status), ["planned", "confirmed", "planned"].sort((a, b) => (a === "planned" ? 0 : 1) - (b === "planned" ? 0 : 1)));
});
test("deshacer: rechaza cambios posteriores en el mismo movimiento sin sobrescribirlos", () => {
  const m = movement(); const before = data([m]), after = data([{ ...m, amountCents: 20000 }]); const record = { label: "Editar", before, after, createdAt: now }; assert.throws(() => undoData(data([{ ...m, amountCents: 30000 }]), record, now), /cambios posteriores/);
});
test("deshacer: diferencias de orden JSON y timestamps de Supabase no provocan falsos conflictos", () => {
  const m = movement(); const edited = { ...m, amountCents: 20000 }; const before = data([m]), after = data([edited]); const reordered = Object.fromEntries(Object.entries(edited).reverse()) as Movement; const current = data([{ ...reordered, createdAt: "2026-10-01T12:00:00+00:00" }]); const restored = undoData(current, { label: "Editar", before, after, createdAt: now }, now); assert.equal(restored.movements[0].amountCents, m.amountCents);
});
test("copia JSON conserva importes, vínculos, cierres, favoritos, presupuestos y series", () => {
  const f = movement(); const state = data([f, movement({ status: "confirmed", forecastId: f.id })]); state.closings = [close("2026-09")]; state.settings.favorites = [{ id: crypto.randomUUID(), concept: "Ropa", amountCents: 999, categoryId: "shopping", kind: "expense" }]; state.settings.categoryBudgets = [{ categoryId: "shopping", monthlyCents: 10000, rollover: true, startMonth: "2026-10" }]; state.settings.recurringSeries = [series()]; assert.deepEqual(importBackup(exportBackup(state, now)), state);
});
test("copia inválida: no acepta enlaces rotos, cifras fuera de rango, fechas inválidas ni ids duplicados", () => {
  const m = movement(); for (const invalid of [data([{ ...m, forecastId: crypto.randomUUID(), status: "confirmed" }]), data([{ ...m, amountCents: 2147483648 }]), data([{ ...m, date: "2026-02-30" }]), data([m, m]), { ...data(), settings: { ...data().settings, recurringSeries: [series({ intervalMonths: 0 })] } }]) assert.throws(() => importBackup(exportBackup(invalid, now)), /no es válida/);
  assert.throws(() => importBackup('{"version":1}'), /no es válida/);
});
test("CSV de Excel usa dos decimales, punto de miles, BOM y neutraliza fórmulas en texto", () => {
  const csv = exportCsv(data([movement({ concept: '=HYPERLINK("x")', amountCents: 123456, notes: "Nota;con separador" })])); assert.equal(csv.startsWith("\uFEFF"), true); assert.match(csv, /1\.234,56/); assert.match(csv, /'=HYPERLINK/); assert.match(csv, /"Nota;con separador"/); assert.match(csv, /""x""/);
});

test("conceptos: incluye todo el mes seleccionado y futuro sin límite, por nombre normalizado y tipo, incluso copias de otra categoría", () => {
  const source = movement({ date: "2026-10-30" });
  const firstDay = movement({ date: "2026-10-01", concept: "  RÓPA  " });
  const farFuture = movement({ date: "2030-02-01", categoryId: "other" });
  const past = movement({ date: "2026-09-30" }), similar = movement({ concept: "Ropa deportiva" }), income = movement({ kind: "income" });
  const state = data([source, firstDay, farFuture, past, similar, income]);
  const original = structuredClone(state);
  const result = applyConceptBulkChanges(state, source, "2026-10", { kind: "amount", amountCents: 123456 }, now);
  assert.deepEqual(previewConceptBulkChanges(state, source, "2026-10").movements.map((m) => m.id), [firstDay.id, source.id, farFuture.id]);
  for (const m of result.movements) assert.deepEqual(m, [source.id, firstDay.id, farFuture.id].includes(m.id) ? { ...state.movements.find((before) => before.id === m.id), amountCents: 123456, updatedAt: now } : state.movements.find((before) => before.id === m.id));
  assert.deepEqual(state, original);
});

test("conceptos: protege meses cerrados, planes, arrastres y previsiones aplicadas; realizados requieren permiso explícito", () => {
  const source = movement(); const closed = movement({ date: "2026-11-15" });
  const target = movement(), applied = movement();
  const actual = movement({ status: "confirmed", forecastId: applied.id });
  const funding = movement({ fundingPlanId: crypto.randomUUID(), fundingRole: "target" });
  const state = data([source, closed, target, applied, actual, funding]);
  state.closings = [close("2026-11"), { ...close("2026-09"), snapshot: { ...close("2026-09").snapshot, carriedForecasts: [{ sourceForecastId: crypto.randomUUID(), targetMovementId: target.id, amountCents: 5000 }] } }];
  const preview = previewConceptBulkChanges(state, source, "2026-10");
  assert.deepEqual(preview.movements.map((m) => m.id), [source.id]);
  assert.deepEqual(preview.excluded, { closed: 1, funding: 1, carried: 1, linked: 1, confirmed: 1 });
  const result = applyConceptBulkChanges(state, source, "2026-10", { kind: "delete" }, now);
  assert.deepEqual(result.movements, state.movements.filter((m) => m.id !== source.id)); assert.deepEqual(result.closings, state.closings);
  const withActual = applyConceptBulkChanges(state, source, "2026-10", { kind: "amount", amountCents: 2222 }, now, true);
  assert.equal(withActual.movements.find((m) => m.id === actual.id)?.amountCents, 2222);
  assert.equal(withActual.movements.find((m) => m.id === actual.id)?.forecastId, applied.id);
  assert.equal(withActual.movements.find((m) => m.id === applied.id)?.amountCents, applied.amountCents);
});

test("conceptos: eliminar realizados optativamente conserva su previsión y no deja referencias rotas", () => {
  const forecast = movement(), actual = movement({ status: "confirmed", forecastId: forecast.id }); const state = data([forecast, actual]);
  const result = applyConceptBulkChanges(state, forecast, "2026-10", { kind: "delete" }, now, true);
  assert.deepEqual(result.movements, [forecast]); assert.deepEqual(importBackup(exportBackup(result, now)), result);
});

test("conceptos: importe futuro de series activas y pausadas no cambia meses anteriores, respeta omisiones y no duplica", () => {
  const source = movement(); const active = series({ concept: source.concept, startDate: "2026-08-10", seedId: source.id });
  const paused = series({ concept: " RÓPA ", active: false }); const other = series(); const expired = series({ concept: source.concept, endMonth: "2026-09" });
  const state = data([source]); state.settings.recurringSeries = [active, paused, other, expired];
  const result = applyConceptBulkChanges(state, source, "2026-10", { kind: "amount", amountCents: 33333 }, now);
  assert.equal(result.settings.recurringSeries![0].amountCents, active.amountCents);
  assert.equal(seriesAmountForMonth(result.settings.recurringSeries![0], "2026-09"), active.amountCents);
  assert.equal(seriesAmountForMonth(result.settings.recurringSeries![0], "2030-01"), 33333);
  assert.equal(seriesAmountForMonth(result.settings.recurringSeries![1], "2030-01"), 33333); assert.equal(result.settings.recurringSeries![1].active, false);
  assert.deepEqual(result.settings.recurringSeries![2], other); assert.deepEqual(result.settings.recurringSeries![3], expired);
  const generated = generateRecurring(result, "2026-09", now).filter((m) => seriesForMovement(result.settings, m)?.id === active.id);
  assert.equal(generated.find((m) => m.date.startsWith("2026-09"))?.amountCents, active.amountCents);
  assert.equal(generated.find((m) => m.date.startsWith("2026-11"))?.amountCents, 33333);
  assert.equal(generateRecurring({ ...result, movements: [...result.movements, ...generateRecurring(result, "2026-09", now)] }, "2026-09", now).length, 0);
});

test("conceptos: un nuevo cambio sustituye revisiones posteriores pero conserva el histórico de importes", () => {
  const source = movement(); const state = data([source]); state.settings.recurringSeries = [series({ concept: source.concept, amountRevisions: [{ fromMonth: "2026-03", amountCents: 2000 }, { fromMonth: "2026-11", amountCents: 3000 }, { fromMonth: "2027-05", amountCents: 4000 }] })];
  const result = applyConceptBulkChanges(state, source, "2026-10", { kind: "amount", amountCents: 5000 }, now);
  assert.deepEqual(result.settings.recurringSeries![0].amountRevisions, [{ fromMonth: "2026-03", amountCents: 2000 }, { fromMonth: "2026-10", amountCents: 5000 }]);
  const update = updateFutureSeries(result, { ...source, id: result.settings.recurringSeries![0].seedId, date: "2026-11-15", amountCents: 6000 }, now);
  assert.equal(seriesAmountForMonth(update.settings.recurringSeries![0], "2026-10"), 5000); assert.equal(seriesAmountForMonth(update.settings.recurringSeries![0], "2026-12"), 6000);
});

test("conceptos: eliminar finaliza todas las series coincidentes y no las regenera al sincronizar o reanudar", () => {
  const source = movement(); const s = series({ concept: source.concept, startDate: "2026-08-15", seedId: source.id }); const paused = series({ concept: source.concept, active: false });
  const old = movement({ id: occurrenceId(s, "2026-09"), date: "2026-09-15" }), future = movement({ id: occurrenceId(s, "2026-11"), date: "2026-11-15" });
  const state = data([old, source, future]); state.settings.recurringSeries = [s, paused];
  const result = applyConceptBulkChanges(state, source, "2026-10", { kind: "delete" }, now);
  assert.deepEqual(result.movements, [old]); assert.equal(result.settings.recurringSeries!.every((r) => r.endMonth === "2026-09"), true);
  assert.deepEqual(generateRecurring(result, "2026-10", now), []);
  result.settings.recurringSeries = result.settings.recurringSeries!.map((r) => ({ ...r, active: true }));
  assert.deepEqual(generateRecurring(result, "2027-01", now), []);
  assert.equal(previewConceptBulkChanges(result, old, "2026-10").series.length, 0);
});

test("conceptos: también actualiza una serie sin ocurrencias editables y conserva las previsiones protegidas", () => {
  const source = movement({ status: "confirmed" }); const state = data([source]); state.settings.recurringSeries = [series({ seedId: source.id, concept: source.concept })];
  const result = applyConceptBulkChanges(state, source, "2026-10", { kind: "amount", amountCents: 11111 }, now);
  assert.deepEqual(result.movements, state.movements); assert.equal(seriesAmountForMonth(result.settings.recurringSeries![0], "2026-10"), 11111);
});

test("conceptos: una operación masiva se deshace completa y produce acciones de sincronización solo para los afectados", () => {
  const source = movement(); const copy = movement({ date: "2027-01-15" }); const past = movement({ date: "2026-09-15" });
  const before = data([source, copy, past]); before.settings.recurringSeries = [series({ concept: source.concept, seedId: source.id })];
  for (const action of [{ kind: "amount", amountCents: 4321 }, { kind: "delete" }] as const) {
    const after = applyConceptBulkChanges(before, source, "2026-10", action, now);
    const changes = dataChanges(before, after);
    assert.equal(changes.length, 3); assert.equal(changes.filter((c) => c.action === "saveSettings").length, 1);
    assert.equal(changes.filter((c) => c.action === (action.kind === "amount" ? "saveMovement" : "deleteMovement")).length, 2);
    const undone = undoData(after, { label: "Conceptos", before, after, createdAt: now }, now);
    assert.deepEqual(undone.settings, before.settings); assert.deepEqual([...undone.movements].sort((a, b) => a.id.localeCompare(b.id)), [...before.movements].sort((a, b) => a.id.localeCompare(b.id)));
    assert.deepEqual(importBackup(exportBackup(after, now)), after);
  }
});

test("conceptos: valida importes y meses sin modificar datos ni aceptar conceptos desactualizados", () => {
  const source = movement(); const state = data([source]); const original = structuredClone(state);
  for (const amountCents of [0, -1, 1.5, NaN, Infinity, 2147483648]) assert.throws(() => applyConceptBulkChanges(state, source, "2026-10", { kind: "amount", amountCents }, now), /importe/);
  assert.throws(() => applyConceptBulkChanges(state, source, "2026-13", { kind: "delete" }, now), /mes válido/);
  assert.throws(() => applyConceptBulkChanges(state, { ...source, concept: "Otro" }, "2026-10", { kind: "delete" }, now), /concepto ha cambiado/);
  assert.throws(() => applyConceptBulkChanges(state, source, "2027-01", { kind: "delete" }, now), /No hay/);
  assert.deepEqual(state, original);
});

test("copias: conservan revisiones de importe por mes y rechazan revisiones inválidas o duplicadas", () => {
  const state = data(); const s = series({ amountRevisions: [{ fromMonth: "2026-10", amountCents: 12345 }] }); state.settings.recurringSeries = [s];
  assert.deepEqual(importBackup(exportBackup(state, now)), state);
  for (const amountRevisions of [[{ fromMonth: "2026-13", amountCents: 123 }], [{ fromMonth: "2026-10", amountCents: 0 }], [{ fromMonth: "2026-10", amountCents: 123 }, { fromMonth: "2026-10", amountCents: 456 }]]) assert.throws(() => importBackup(exportBackup({ ...state, settings: { ...state.settings, recurringSeries: [{ ...s, amountRevisions }] } }, now)), /no es válida/);
});
