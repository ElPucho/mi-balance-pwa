"use client";

import { useState } from "react";
import { Layers, Trash2 } from "lucide-react";
import { formatAmount, formatMoney, monthLabel, parseAmount } from "../lib/finance";
import { previewConceptBulkChanges, type ConceptBulkAction } from "../lib/planning";
import type { AppData, Movement } from "../lib/types";
import { MoneyField } from "./PlanningTools";

export function ConceptBulkActions({ data, movement, month, disabled, onApply }: {
  data: AppData;
  movement: Movement;
  month: string;
  disabled: boolean;
  onApply: (action: ConceptBulkAction, includeConfirmed: boolean, signature: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(formatAmount(movement.amountCents));
  const [includeConfirmed, setIncludeConfirmed] = useState(false);
  const [review, setReview] = useState<{ action: ConceptBulkAction; signature: string; includeConfirmed: boolean }>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const preview = previewConceptBulkChanges(data, movement, month, includeConfirmed);
  const signature = JSON.stringify(preview);
  const realCount = preview.movements.filter((m) => m.status === "confirmed").length;
  const seriesLabel = `${preview.series.length} ${preview.series.length === 1 ? "serie recurrente" : "series recurrentes"}`;
  const months = [...new Set(preview.movements.map((m) => m.date.slice(0, 7)))];
  const canApply = preview.movements.length + preview.series.length > 0;
  const protectedCount = preview.excluded.closed + preview.excluded.funding + preview.excluded.carried + preview.excluded.linked;
  const stale = review && (review.signature !== signature || review.includeConfirmed !== includeConfirmed);
  const locked = disabled || busy;

  function requestReview(action: ConceptBulkAction) {
    setError("");
    if (action.kind === "amount" && (!Number.isInteger(action.amountCents) || action.amountCents <= 0 || action.amountCents > 2147483647)) {
      setError("Introduce un importe mayor que cero y dentro del límite permitido."); return;
    }
    setReview({ action, signature, includeConfirmed });
  }
  async function confirm() {
    if (!review || stale || locked) return;
    setBusy(true); setError("");
    try { await onApply(review.action, review.includeConfirmed, review.signature); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo aplicar el cambio."); }
    finally { setBusy(false); }
  }

  return <section className="concept-bulk-section" aria-label="Gestión de conceptos iguales">
    <button className="secondary-button full" type="button" disabled={locked} aria-expanded={open} onClick={() => { setOpen(!open); setReview(undefined); setError(""); }}><Layers size={17} /> Gestionar conceptos iguales</button>
    {open && <div className="concept-bulk-panel">
      <strong>{movement.concept}</strong>
      <p>Desde <b>{monthLabel(month)}</b>, incluido, sin fecha final. Coincide el nombre y el tipo ({({ expense: "gasto", income: "ingreso", saving: "ahorro" })[movement.kind]}), en cualquier categoría. Se usa el concepto guardado, no los cambios sin guardar del formulario.</p>
      <label className="concept-bulk-checkbox"><input type="checkbox" checked={includeConfirmed} disabled={locked || Boolean(review)} onChange={(e) => setIncludeConfirmed(e.target.checked)} /><span>Incluir también movimientos ya realizados de meses abiertos</span></label>
      <div className="concept-bulk-summary" aria-live="polite">
        <b>{preview.movements.length} movimiento{preview.movements.length === 1 ? "" : "s"} en {months.length} {months.length === 1 ? "mes" : "meses"}</b>
        <span>{preview.movements.length - realCount} {preview.movements.length - realCount === 1 ? "previsión" : "previsiones"} · {realCount} {realCount === 1 ? "realizado" : "realizados"} · {seriesLabel}</span>
        {months.length > 0 && <details><summary>Ver meses afectados</summary><ul>{months.map((key) => <li key={key}>{monthLabel(key)} · {preview.movements.filter((m) => m.date.startsWith(key)).length} movimiento(s)</li>)}</ul></details>}
        {preview.excluded.confirmed > 0 && <span>{preview.excluded.confirmed} {preview.excluded.confirmed === 1 ? "realizado queda" : "realizados quedan"} fuera salvo que marques la casilla.</span>}
        {protectedCount > 0 && <span>Protegidos: {preview.excluded.closed} de meses cerrados, {preview.excluded.linked} previsiones con movimientos aplicados, {preview.excluded.funding} de planes de ahorro y {preview.excluded.carried} con arrastres de cierres.</span>}
      </div>
      {!review ? <>
        <MoneyField label="Nuevo importe por movimiento" value={amount} onChange={setAmount} />
        <p>Se sustituye el importe completo; no se suma. Las fechas, categorías y notas no cambian. Las series usarán el nuevo importe al generar meses posteriores.</p>
        <button className="secondary-button full" type="button" disabled={locked || !canApply} onClick={() => requestReview({ kind: "amount", amountCents: parseAmount(amount) })}>Revisar cambio de importe</button>
        <button className="delete-button" type="button" disabled={locked || !canApply} onClick={() => requestReview({ kind: "delete" })}><Trash2 size={17} /> Revisar eliminación desde este mes</button>
        {!canApply && <p>No hay movimientos o series modificables. Reabre los meses cerrados o revisa los conceptos protegidos por separado.</p>}
      </> : <div className="concept-bulk-confirm" role="alert">
        <strong>{review.action.kind === "delete" ? "Confirmar eliminación" : `Confirmar nuevo importe: ${formatMoney(review.action.amountCents)}`}</strong>
        <p>{review.action.kind === "delete" ? `Se eliminarán ${preview.movements.length} movimientos y se detendrá la generación de ${seriesLabel} desde ${monthLabel(month)}. No volverán a generarse automáticamente desde ese mes.` : `Se fijará el importe de cada uno de los ${preview.movements.length} movimientos y de ${seriesLabel} desde ${monthLabel(month)}.`}</p>
        {realCount > 0 && <p><b>Incluye {realCount} {realCount === 1 ? "movimiento realizado" : "movimientos realizados"}: cambiará tus saldos reales.</b></p>}
        <p>No se modifican meses anteriores ni registros protegidos. Puedes deshacer esta operación desde Ajustes.</p>
        {stale && <p>La vista previa ha cambiado. Vuelve atrás y revísala de nuevo.</p>}
        <button className={review.action.kind === "delete" ? "delete-button" : "primary-button full"} type="button" disabled={locked || Boolean(stale)} onClick={() => void confirm()}>{busy ? "Aplicando…" : review.action.kind === "delete" ? "Confirmar eliminación" : "Confirmar cambio de importe"}</button>
        <button className="quiet-button" type="button" disabled={locked} onClick={() => setReview(undefined)}>Volver sin aplicar</button>
      </div>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>}
  </section>;
}
