"use client";
import { useState } from "react";
import { ChevronRight, Download, Plus, RotateCcw, Star, Trash2, X } from "lucide-react";
import { formatAmount, formatMoney, forecastUsage, monthKey, monthLabel, savingsAnalysis } from "../lib/finance";
import { categoryBudgetForMonth, spendableForMonth, seriesForMovement, type InsightQuery } from "../lib/planning";
import { exportBackup, exportCsv, importBackup, type UndoRecord } from "../lib/backups";
import { parseAmount } from "../lib/finance";
import type { AppData, AppSettings, QuickTemplate } from "../lib/types";

export function MoneyField({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return <label className="field"><span>{label}</span><div className="money-input"><input inputMode="decimal" value={value} onChange={(e) => onChange(e.target.value)} onBlur={() => { if (value.trim()) onChange(formatAmount(parseAmount(value))); }} /><b>€</b></div></label>;
}
export function SpendableCard({ data, month, today }: { data: AppData; month: string; today: string }) {
  const item = spendableForMonth(data, month, today);
  return <section className="section-card spendable-card">
    <span className="eyebrow">Sin contar ingresos aún no recibidos</span><h2>¿Cuánto puedo gastar todavía?</h2>
    <strong className={item.availableCents < 0 ? "negative" : "positive"}>{formatMoney(item.availableCents)}</strong>
    <p>Saldo de hoy menos salidas pendientes y ahorro reservado. Si fijaste un objetivo de ahorro, también se reserva lo que falta.</p>
    <div className="planning-stat-grid"><span>Ingresos recibidos<b>{formatMoney(item.actualIncomeCents)}</b></span><span>Por recibir<b>{formatMoney(item.expectedIncomeCents)}</b></span><span>Salidas reservadas<b>{formatMoney(item.reservedCents)}</b></span><span>Margen semanal<b>{formatMoney(item.weeklyCents)}</b></span></div>
    <small>{item.availableCents < 0 ? "Las salidas previstas necesitan ingresos adicionales o un ajuste." : item.days ? `Repartido entre ${item.days} días hasta final de mes, respetando también tu presupuesto general si lo has fijado.` : "Mes finalizado: no se calcula margen semanal."}</small>
  </section>;
}
export function QuickEntries({ settings, onSelect }: { settings: AppSettings; onSelect: (t: QuickTemplate) => void }) {
  return <section className="section-card"><span className="eyebrow">Registro rápido</span><h2>Tus favoritos</h2><p className="planning-help">Se rellenan los campos para que revises y guardes; no se añade un gasto al pulsarlos.</p>
    {settings.favorites?.length ? <div className="quick-entry-list">{settings.favorites.map((t) => <button className="secondary-button" type="button" key={t.id} onClick={() => onSelect(t)}><Star size={15} /><span>{t.concept}<small>{formatMoney(t.amountCents)}</small></span></button>)}</div> : <p className="planning-help">Guarda un favorito desde el formulario de un movimiento.</p>}
  </section>;
}
export function BudgetCards({ data, month, onInspect }: { data: AppData; month: string; onInspect?: (q: InsightQuery) => void }) {
  const budgets = (data.settings.categoryBudgets ?? []).filter((b) => b.startMonth <= month);
  if (!budgets.length) return null;
  return <section className="section-card"><span className="eyebrow">Real + pendiente, sin duplicados</span><h2>Presupuestos por categoría</h2><div className="budget-list">
    {budgets.map((budget) => { const item = categoryBudgetForMonth(data, budget, month); const category = data.categories.find((c) => c.id === budget.categoryId); return <article key={budget.categoryId} className="budget-item">
      <div><strong>{category?.name}</strong><b className={item.leftCents < 0 ? "negative" : "positive"}>{formatMoney(Math.abs(item.leftCents))} {item.leftCents < 0 ? "de exceso" : "libres"}</b></div>
      <progress max={Math.max(1, item.limitCents)} value={Math.min(item.limitCents, item.spentCents + item.pendingCents)} aria-label={`Presupuesto utilizado de ${category?.name}`} />
      <small>Límite {formatMoney(item.limitCents)} · Gastado {formatMoney(item.spentCents)} · Pendiente {formatMoney(item.pendingCents)}</small>
      {item.rollover && <small>Acumulado de meses cerrados: {formatMoney(item.carriedCents)}. No añade nuevos movimientos.</small>}
      {onInspect && <button className="text-button" onClick={() => onInspect({ title: category?.name ?? "Categoría", categoryId: budget.categoryId, kind: "expense", fromMonth: month, toMonth: month })}>Ver movimientos <ChevronRight size={16} /></button>}
    </article>; })}
  </div></section>;
}

export function PlanningSettings({ data, onSave, onApply }: { data: AppData; onSave: (settings: AppSettings) => void; onApply: (data: AppData, label: string) => Promise<void> }) {
  const [categoryId, setCategoryId] = useState(data.categories.find((c) => c.kind === "expense")?.id ?? "");
  const [amount, setAmount] = useState("");
  const [rollover, setRollover] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  function selectCategory(id: string) { setCategoryId(id); const existing = data.settings.categoryBudgets?.find((b) => b.categoryId === id); setAmount(existing ? formatAmount(existing.monthlyCents) : ""); setRollover(existing?.rollover ?? false); }
  function saveBudget() {
    const monthlyCents = parseAmount(amount);
    if (monthlyCents <= 0 || monthlyCents > 2147483647) { setError("Introduce un límite positivo válido."); return; }
    const existing = data.settings.categoryBudgets?.find((b) => b.categoryId === categoryId);
    const currentMonth = monthKey(new Date());
    const revisions = existing ? [...(existing.revisions ?? [{ startMonth: existing.startMonth, monthlyCents: existing.monthlyCents, rollover: existing.rollover }]).filter((r) => r.startMonth !== currentMonth), { startMonth: currentMonth, monthlyCents, rollover }] : undefined;
    onSave({ ...data.settings, updatedAt: new Date().toISOString(), categoryBudgets: [...(data.settings.categoryBudgets ?? []).filter((b) => b.categoryId !== categoryId), { categoryId, monthlyCents, rollover, startMonth: existing?.startMonth ?? currentMonth, revisions }] });
    setError("");
  }
  async function removeFuture(seriesId: string) {
    if (!window.confirm("Se detendrá la serie y se eliminarán solo las previsiones futuras sin gastos asociados. Los movimientos reales y los meses cerrados se conservarán.")) return;
    setBusy(true);
    try { const today = new Date(); const key = `${monthKey(today)}-${String(today.getDate()).padStart(2, "0")}`;
      await onApply({ ...data, settings: { ...data.settings, updatedAt: new Date().toISOString(), recurringSeries: data.settings.recurringSeries!.map((s) => s.id === seriesId ? { ...s, active: false } : s) }, movements: data.movements.filter((m) => !(seriesForMovement(data.settings, m)?.id === seriesId && m.date > key && m.status === "planned" && forecastUsage(data.movements, m).appliedCents === 0 && !data.closings.some((c) => m.date.startsWith(c.month)))) }, "Detener serie y quitar previsiones");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cambiar la serie"); } finally { setBusy(false); }
  }
  return <>
    <section className="section-card settings-card"><span className="eyebrow">Límites editables</span><h2>Presupuestos por categoría</h2><p className="planning-help">El remanente se acumula solo al cerrar el mes. Es un límite de gasto, no una salida adicional de dinero.</p>
      <label className="field"><span>Categoría</span><select value={categoryId} onChange={(e) => selectCategory(e.target.value)}>{data.categories.filter((c) => c.kind === "expense").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
      <MoneyField label="Límite mensual" value={amount} onChange={setAmount} />
      <label className="toggle-row"><span><strong>Acumular lo no gastado</strong><small>Desde este mes, después de cerrarlo</small></span><input type="checkbox" checked={rollover} onChange={(e) => setRollover(e.target.checked)} /><i /></label>
      <button className="primary-button full" onClick={saveBudget}><Plus size={16} /> Guardar límite</button>
      <small>Los cambios de límite se aplican desde el mes actual; los límites anteriores se conservan.</small>
      {(data.settings.categoryBudgets ?? []).map((b) => <div className="planning-setting-row" key={b.categoryId}><button className="text-button" onClick={() => selectCategory(b.categoryId)}>{data.categories.find((c) => c.id === b.categoryId)?.name} · {formatMoney(b.monthlyCents)}</button><button className="icon-button" aria-label={`Quitar presupuesto de ${b.categoryId}`} onClick={() => onSave({ ...data.settings, updatedAt: new Date().toISOString(), categoryBudgets: data.settings.categoryBudgets!.filter((item) => item.categoryId !== b.categoryId) })}><Trash2 size={18} /></button></div>)}
      {error && <p className="form-error">{error}</p>}
    </section>
    <section className="section-card"><span className="eyebrow">Previsiones automáticas</span><h2>Series recurrentes</h2><p className="planning-help">Crea una serie al añadir o editar un movimiento. Se prepara el horizonte de los próximos 12 meses al abrir o sincronizar la app. Edita una previsión para cambiar solo esa o las siguientes.</p>
      {data.settings.recurringSeries?.length ? data.settings.recurringSeries.map((s) => <article className="planning-series" key={s.id}><strong>{s.concept} · {formatMoney(s.amountCents)}</strong><small>Cada {s.intervalMonths} mes{ s.intervalMonths === 1 ? "" : "es"} · {s.active ? "Activa" : "Pausada"} · {s.skipMonths.length} omisión(es)</small><div className="planning-actions"><button className="secondary-button" disabled={busy} onClick={() => onSave({ ...data.settings, updatedAt: new Date().toISOString(), recurringSeries: data.settings.recurringSeries!.map((r) => r.id === s.id ? { ...r, active: !r.active } : r) })}>{s.active ? "Pausar nuevas" : "Reanudar"}</button><button className="quiet-button" disabled={busy} onClick={() => void removeFuture(s.id)}>Quitar futuras</button></div></article>) : <p className="planning-help">Aún no tienes series.</p>}
    </section>
    {!!data.settings.favorites?.length && <section className="section-card"><h2>Favoritos</h2>{data.settings.favorites.map((f) => <div className="planning-setting-row" key={f.id}><span>{f.concept} · {formatMoney(f.amountCents)}</span><button className="icon-button" aria-label={`Eliminar favorito ${f.concept}`} onClick={() => onSave({ ...data.settings, updatedAt: new Date().toISOString(), favorites: data.settings.favorites!.filter((t) => t.id !== f.id) })}><Trash2 size={18} /></button></div>)}</section>}
  </>;
}

function download(contents: string, name: string, type: string) { const url = URL.createObjectURL(new Blob([contents], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); window.setTimeout(() => URL.revokeObjectURL(url), 30000); }
export function BackupSettings({ data, undo, onUndo, onRestore }: { data: AppData; undo?: UndoRecord; onUndo: () => Promise<void>; onRestore: (data: AppData) => Promise<void> }) {
  const [preview, setPreview] = useState<AppData>(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const stamp = new Date().toISOString().slice(0, 10);
  return <section className="section-card settings-card"><span className="eyebrow">Control de tus datos</span><h2>Copias y recuperación</h2><div className="planning-actions">
    <button className="secondary-button" onClick={() => download(exportBackup(data, new Date().toISOString()), `mi-balance-${stamp}.json`, "application/json")}><Download size={17} /> Copia completa</button>
    <button className="secondary-button" onClick={() => download(exportCsv(data), `movimientos-${stamp}.csv`, "text/csv;charset=utf-8")}><Download size={17} /> Exportar a Excel</button>
  </div><p className="planning-help">La copia JSON conserva movimientos, vínculos, cierres y preferencias. El CSV sirve para consultar los movimientos. No incluye contraseñas ni sesiones. Guarda la copia en un lugar privado.</p>
    <label className="field"><span>Restaurar una copia JSON de tu cuenta</span><input type="file" accept=".json,application/json" disabled={busy} onChange={async (e) => { const file = e.target.files?.[0]; setPreview(undefined); setError(""); if (!file) return; try { if (file.size > 20_000_000) throw new Error("La copia supera 20 MB."); setPreview(importBackup(await file.text())); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo abrir la copia"); } e.target.value = ""; }} /></label>
    {preview && <div className="backup-preview"><strong>Vista previa</strong><p>{preview.movements.length} movimientos · {preview.closings.length} cierres · {preview.settings.recurringSeries?.length ?? 0} series.</p><p>Reemplazará los {data.movements.length} movimientos y {data.closings.length} cierres de esta cuenta y se sincronizará con tus dispositivos. Descarga antes una copia del estado actual.</p><div className="planning-actions"><button className="primary-button" disabled={busy} onClick={async () => { if (!window.confirm("¿Reemplazar los datos de esta cuenta por la copia mostrada?")) return; setBusy(true); try { await onRestore(preview); setPreview(undefined); } catch (err) { setError(err instanceof Error ? err.message : "No se pudo restaurar"); } finally { setBusy(false); } }}>Confirmar restauración</button><button className="quiet-button" disabled={busy} onClick={() => setPreview(undefined)}><X size={16} /> Cancelar</button></div></div>}
    <button className="secondary-button full" disabled={!undo || busy} onClick={async () => { setBusy(true); try { await onUndo(); } finally { setBusy(false); } }}><RotateCcw size={17} /> Deshacer último cambio</button>
    <small>{undo ? `${undo.label} · ${new Date(undo.createdAt).toLocaleString("es-ES")}` : "No hay un cambio que deshacer en este dispositivo."}</small>
    <p className="planning-help">La recuperación es local a este dispositivo; el resultado se sincroniza. Rechaza modificaciones posteriores detectadas en los mismos datos. Con Supabase requiere conexión para comprobar antes los otros dispositivos.</p>
    {error && <p className="form-error">{error}</p>}
  </section>;
}
export function ClosingReview({ data, month }: { data: AppData; month: string }) {
  const analysis = savingsAnalysis(data.movements, data.categories, month);
  const excess = analysis.forecastComparisons.filter((f) => f.varianceCents > 0);
  return <section className="closing-review"><span className="eyebrow">Balance del mes</span><h3>Qué ha cambiado frente al plan</h3><p>Ahorro real: {analysis.actualSavings.ratePercent === null ? "sin ingresos registrados" : `${Math.round(analysis.actualSavings.ratePercent)}% (${formatMoney(analysis.actualSavings.savedCents)})`}. Ingresos reales menos gastos reales; el dinero apartado no se vuelve a restar.</p>
    {analysis.forecastComparisons.length ? <div className="budget-list">{analysis.forecastComparisons.map((f) => <div className="budget-item" key={f.key}><strong>{f.concept}</strong><small>Previsto {formatMoney(f.plannedCents)} · Aplicado {formatMoney(f.spentCents)} · {f.varianceCents > 0 ? "Exceso" : "Pendiente"} {formatMoney(Math.abs(f.varianceCents))}</small></div>)}</div> : <p>No hay previsiones de gasto para comparar.</p>}
    <p>{excess.length ? `${excess.length} concepto(s) sobrepasaron la previsión.` : "Ninguna previsión de gasto se ha sobrepasado."} Los gastos no vinculados siguen contando en el total real.</p>
    <BudgetCards data={data} month={month} />
    <small>{monthLabel(month)} · revisión previa al cierre</small>
  </section>;
}
