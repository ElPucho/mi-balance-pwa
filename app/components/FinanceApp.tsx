"use client";

import {
  ArrowDownLeft,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  Car,
  Check,
  ChevronDown,
  ChevronRight,
  CircleEllipsis,
  Coins,
  Copy,
  Cloud,
  Download,
  Gift,
  HeartPulse,
  Home,
  Landmark,
  LayoutDashboard,
  LockKeyhole,
  LogIn,
  ListChecks,
  Pencil,
  PiggyBank,
  Plus,
  ReceiptText,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  ShieldCheck,
  ShoppingBag,
  ShoppingBasket,
  Sparkles,
  Target,
  Trash2,
  TrendingDown,
  TrendingUp,
  WalletCards,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  annualCumulativeProjectionSeries,
  annualProjectionSeries,
  annualSeries,
  categoryBreakdown,
  dateForMonth,
  dayLabel,
  forecastsForMonth,
  forecastUsage,
  fundingPlans,
  formatMoney,
  formatShortMoney,
  monthKey,
  monthLabel,
  moveMonth,
  movementsForMonth,
  parseAmount,
  projectionForMonth,
  snapshotForMonth,
} from "../lib/finance";
import {
  cloudConfigured,
  disconnectCloud,
  flushCloudActions,
  getCloudSession,
  sendEmailCode,
  signInWithPasswordAccess,
  synchronizeCloud,
  verifyEmailAccess,
  watchCloudSession,
} from "../lib/cloud";
import {
  activateUserStorage,
  clearUserData,
  deactivateUserStorage,
  defaultHomeWidgets,
  defaultSettings,
  loadAppData,
  queueCloudAction,
  removeMovement,
  saveMonthlyClose,
  saveMovement,
  saveSettings,
} from "../lib/storage";
import type { AppData, AppSettings, Category, CloudAction, CloudState, HomeWidgetId, MonthlyClose, Movement, MovementKind } from "../lib/types";

type Tab = "home" | "movements" | "analysis" | "settings";
type AnalysisPeriod = "month" | "year";

const emptyData: AppData = {
  movements: [],
  categories: [],
  closings: [],
  settings: defaultSettings,
};

const iconMap: Record<string, LucideIcon> = {
  home: Home,
  shopping: ShoppingBasket,
  car: Car,
  receipt: ReceiptText,
  heart: HeartPulse,
  sparkles: Sparkles,
  bag: ShoppingBag,
  more: CircleEllipsis,
  wallet: WalletCards,
  plus: Plus,
  coins: Coins,
  gift: Gift,
  landmark: Landmark,
  shield: ShieldCheck,
  target: Target,
  chart: BarChart3,
};

function cloudErrorMessage(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/rate limit|too many requests|after \d+ seconds|429/i.test(message)) {
    return "Espera 60 segundos antes de solicitar otro código.";
  }
  return message || fallback;
}

function todayInput() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function dateInputForMonth(month: string) {
  const today = todayInput();
  if (today.startsWith(month)) return today;
  return `${month}-01`;
}

function CategoryIcon({ category, size = 20 }: { category?: Category; size?: number }) {
  const Icon = iconMap[category?.icon ?? "more"] ?? CircleEllipsis;
  return <Icon size={size} strokeWidth={2} />;
}

function AppLogo() {
  return (
    <div className="app-logo" aria-hidden="true">
      <Landmark size={21} strokeWidth={2.4} />
    </div>
  );
}

export default function FinanceApp() {
  const [data, setData] = useState<AppData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("home");
  const [selectedMonth, setSelectedMonth] = useState(() => monthKey(new Date()));
  const [editingMovement, setEditingMovement] = useState<Movement | null | undefined>(undefined);
  const [closeOpen, setCloseOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [cloud, setCloud] = useState<CloudState>({ mode: cloudConfigured ? "checking" : "disabled" });
  const [signedIn, setSignedIn] = useState(!cloudConfigured);

  const refresh = useCallback(async () => {
    const next = await loadAppData();
    setData(next);
  }, []);

  const syncNow = useCallback(async (email?: string) => {
    setCloud({ mode: "syncing", email });
    let storageReady = false;
    try {
      const session = await getCloudSession();
      if (!session) throw new Error("CLOUD_NOT_SIGNED_IN");
      await activateUserStorage(session.user.id);
      storageReady = true;
      setSignedIn(true);
      const next = await synchronizeCloud();
      setData(next);
      setCloud({ mode: "synced", email });
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo sincronizar";
      setCloud({ mode: navigator.onLine ? "error" : "offline", email, message });
      if (storageReady) {
        const local = await loadAppData().catch(() => emptyData);
        setData(local);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setMounted(true));
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    if ("serviceWorker" in navigator) navigator.serviceWorker.register(`${basePath}/sw.js`).catch(() => undefined);
    if (!cloudConfigured) {
      loadAppData().then((next) => {
        setData(next);
        setLoading(false);
      });
    } else {
      getCloudSession().then((session) => {
        if (session) void syncNow(session.user.email);
        else {
          deactivateUserStorage();
          setSignedIn(false);
          setCloud({ mode: "signedOut" });
          setLoading(false);
        }
      }).catch(() => {
        setCloud({ mode: "error", message: "No se pudo comprobar la sesión" });
        setLoading(false);
      });
    }
    const stopWatching = watchCloudSession((session, event) => {
      if (event === "INITIAL_SESSION") return;
      if (session) void syncNow(session.user.email);
      else if (cloudConfigured) {
        deactivateUserStorage();
        setSignedIn(false);
        setData(emptyData);
        setCloud({ mode: "signedOut" });
      }
    });
    return () => {
      window.cancelAnimationFrame(frame);
      stopWatching();
    };
  }, [syncNow]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const notify = (message: string) => setToast(message);

  async function queueAndSync(action: CloudAction, payload: unknown) {
    await queueCloudAction(action, payload);
    if (cloud.mode === "signedOut" || cloud.mode === "codeSent" || cloud.mode === "disabled") return;
    try {
      await flushCloudActions();
      setCloud((current) => ({ mode: "synced", email: current.email }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cambios pendientes";
      setCloud((current) => ({ mode: navigator.onLine ? "error" : "offline", email: current.email, message }));
    }
  }

  async function handleMovementSave(movement: Movement) {
    await saveMovement(movement);
    await queueAndSync("saveMovement", movement);
    await refresh();
    setEditingMovement(undefined);
    notify(movement.createdAt === movement.updatedAt ? "Movimiento añadido" : "Movimiento actualizado");
  }

  async function handleMovementDelete(id: string) {
    const deletedIds = await removeMovement(id);
    for (const deletedId of deletedIds) await queueCloudAction("deleteMovement", { id: deletedId });
    if (cloud.mode !== "signedOut" && cloud.mode !== "codeSent" && cloud.mode !== "disabled") await flushCloudActions().catch(() => undefined);
    await refresh();
    setEditingMovement(undefined);
    notify("Movimiento eliminado");
  }

  async function handleMovementCopies(copies: Movement[]) {
    for (const copy of copies) {
      await saveMovement(copy);
      await queueCloudAction("saveMovement", copy);
    }
    if (cloud.mode !== "signedOut" && cloud.mode !== "codeSent" && cloud.mode !== "disabled") {
      try {
        await flushCloudActions();
        setCloud((current) => ({ mode: "synced", email: current.email }));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Copias pendientes de sincronizar";
        setCloud((current) => ({ mode: navigator.onLine ? "error" : "offline", email: current.email, message }));
      }
    }
    await refresh();
    setEditingMovement(undefined);
    notify(copies.length === 1 ? "Previsión copiada a otro mes" : `${copies.length} previsiones creadas`);
  }

  async function handleFundingPlanCreate(items: Movement[]) {
    for (const item of items) {
      await saveMovement(item);
      await queueCloudAction("saveMovement", item);
    }
    if (cloud.mode !== "signedOut" && cloud.mode !== "codeSent" && cloud.mode !== "disabled") await flushCloudActions().catch(() => undefined);
    await refresh();
    setEditingMovement(undefined);
    notify(`Gasto fraccionado en ${Math.max(0, items.length - 1)} aportaciones mensuales`);
  }

  async function handleSettingsSave(settings: AppSettings) {
    await saveSettings(settings);
    await queueAndSync("saveSettings", settings);
    await refresh();
    notify("Preferencias guardadas");
  }

  async function handleClose(close: MonthlyClose) {
    await saveMonthlyClose(close);
    await queueAndSync("saveClosing", close);
    await refresh();
    setCloseOpen(false);
    notify(`${monthLabel(close.month)} cerrado`);
  }

  async function handleClear() {
    await clearUserData();
    await queueAndSync("clearData", {});
    await refresh();
    notify("Movimientos y cierres eliminados");
  }

  async function handleCloudConnect(email: string) {
    setCloud({ mode: "syncing", email });
    try {
      await sendEmailCode(email);
      setCloud({ mode: "codeSent", email });
    } catch (error) {
      setCloud({ mode: "error", email, message: cloudErrorMessage(error, "No se pudo enviar el código") });
    }
  }

  async function handleCloudVerify(email: string, credential: string) {
    setCloud({ mode: "syncing", email });
    try {
      await verifyEmailAccess(email, credential);
    } catch (error) {
      setCloud({ mode: "codeSent", email, message: cloudErrorMessage(error, "El código no es válido") });
    }
  }

  async function handlePasswordAccess(email: string, password: string) {
    setCloud({ mode: "syncing", email });
    try {
      await signInWithPasswordAccess(email, password);
    } catch (error) {
      setCloud({ mode: "error", email, message: cloudErrorMessage(error, "Correo o contraseña incorrectos") });
    }
  }

  async function handleCloudDisconnect() {
    await disconnectCloud();
    deactivateUserStorage();
    setSignedIn(false);
    setData(emptyData);
    setCloud({ mode: "signedOut" });
  }

  function goToCurrentMonth() {
    setSelectedMonth(monthKey(new Date()));
    if (tab === "settings") setTab("home");
  }

  return (
    <main className="app-shell">
      <div className="phone-canvas">
        {cloudConfigured && !signedIn ? (
          loading ? <LoadingState /> : <AuthGate cloud={cloud} onPassword={handlePasswordAccess} onCodeRequest={handleCloudConnect} onCodeVerify={handleCloudVerify} />
        ) : (
          <>
        <header className="topbar">
          <button className="brand-button" onClick={() => setTab("home")} aria-label="Ir al inicio">
            <AppLogo />
            <span>
              <strong>Mi balance</strong>
              <small>Control personal</small>
            </span>
          </button>
          <div className="topbar-actions">
            <button className="current-month-button" type="button" onClick={goToCurrentMonth} aria-label="Volver al mes actual" aria-current={selectedMonth === monthKey(new Date()) ? "date" : undefined}><CalendarDays size={16} /><span>Mes actual</span></button>
            <button className="avatar-button" onClick={() => setTab("settings")} aria-label="Abrir ajustes">
              {(data.settings.displayName || "D").charAt(0).toUpperCase()}
            </button>
          </div>
        </header>

        <section className="screen" aria-live="polite">
          {loading ? (
            <LoadingState />
          ) : tab === "home" ? (
            <HomeView
              data={data}
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
              onAdd={() => setEditingMovement(null)}
              onEdit={(movement) => setEditingMovement(movement)}
              onOpenMovements={() => setTab("movements")}
              onOpenAnalysis={() => setTab("analysis")}
              onCloseMonth={() => setCloseOpen(true)}
              mounted={mounted}
              onSaveSettings={handleSettingsSave}
            />
          ) : tab === "movements" ? (
            <MovementsView
              data={data}
              month={selectedMonth}
              onMonthChange={setSelectedMonth}
              onAdd={() => setEditingMovement(null)}
              onEdit={(movement) => setEditingMovement(movement)}
            />
          ) : tab === "analysis" ? (
            <AnalysisView data={data} month={selectedMonth} onMonthChange={setSelectedMonth} mounted={mounted} />
          ) : (
            <SettingsView
              data={data}
              cloud={cloud}
              onSave={handleSettingsSave}
              onClear={handleClear}
              onCloudConnect={handleCloudConnect}
              onCloudVerify={handleCloudVerify}
              onCloudSync={() => syncNow(cloud.email)}
              onCloudDisconnect={handleCloudDisconnect}
            />
          )}
        </section>

        <nav className="bottom-nav" aria-label="Navegación principal">
          <NavButton active={tab === "home"} label="Inicio" icon={LayoutDashboard} onClick={() => setTab("home")} />
          <NavButton active={tab === "movements"} label="Movimientos" icon={ListChecks} onClick={() => setTab("movements")} />
          <button className="add-main" onClick={() => setEditingMovement(null)} aria-label="Añadir movimiento">
            <Plus size={28} strokeWidth={2.3} />
          </button>
          <NavButton active={tab === "analysis"} label="Análisis" icon={BarChart3} onClick={() => setTab("analysis")} />
          <NavButton active={tab === "settings"} label="Ajustes" icon={Settings} onClick={() => setTab("settings")} />
        </nav>

        {editingMovement !== undefined && (
          <MovementSheet
            movement={editingMovement}
            categories={data.categories}
            movements={data.movements}
            selectedMonth={selectedMonth}
            onClose={() => setEditingMovement(undefined)}
            onSave={handleMovementSave}
            onCopy={handleMovementCopies}
            onCreateFundingPlan={handleFundingPlanCreate}
            onDelete={handleMovementDelete}
          />
        )}
        {closeOpen && (
          <CloseMonthSheet
            month={selectedMonth}
            movements={data.movements}
            existing={data.closings.find((close) => close.month === selectedMonth)}
            onClose={() => setCloseOpen(false)}
            onSave={handleClose}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            <Check size={18} /> {toast}
          </div>
        )}
          </>
        )}
      </div>
    </main>
  );
}

function AuthGate({ cloud, onPassword, onCodeRequest, onCodeVerify }: {
  cloud: CloudState;
  onPassword: (email: string, password: string) => Promise<void>;
  onCodeRequest: (email: string) => Promise<void>;
  onCodeVerify: (email: string, code: string) => Promise<void>;
}) {
  const [method, setMethod] = useState<"password" | "code">("password");
  const [email, setEmail] = useState(cloud.email ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const busy = cloud.mode === "syncing" || cloud.mode === "checking";

  return (
    <section className="auth-screen">
      <div className="auth-brand"><AppLogo /><span><strong>Mi balance</strong><small>Acceso privado por invitación</small></span></div>
      <div className="auth-card">
        <span className="auth-icon"><LockKeyhole size={25} /></span>
        <span className="eyebrow">Beta privada</span>
        <h1>Entra en tu espacio</h1>
        <p>Cada persona tiene sus propios movimientos, previsiones y preferencias.</p>
        <div className="segmented auth-methods">
          <button type="button" className={method === "password" ? "active" : ""} onClick={() => setMethod("password")}>Contraseña</button>
          <button type="button" className={method === "code" ? "active" : ""} onClick={() => setMethod("code")}>Código</button>
        </div>
        {method === "password" ? (
          <form className="cloud-connect" onSubmit={(event) => { event.preventDefault(); void onPassword(email.trim(), password); }}>
            <label className="field"><span>Correo electrónico</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label className="field"><span>Contraseña de invitado</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={6} required /></label>
            {cloud.mode === "error" && cloud.message && <span className="cloud-error">{cloud.message}</span>}
            <button className="primary-button full large" type="submit" disabled={busy}><LogIn size={18} /> Entrar</button>
          </form>
        ) : cloud.mode === "codeSent" ? (
          <form className="cloud-connect" onSubmit={(event) => { event.preventDefault(); void onCodeVerify(cloud.email ?? email, code); }}>
            <div className="cloud-message"><Check size={18} /><span>Código enviado a <strong>{cloud.email}</strong>.</span></div>
            <label className="field"><span>Código recibido</span><input className="otp-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 10))} minLength={6} maxLength={10} required /></label>
            {cloud.message && <span className="cloud-error">{cloud.message}</span>}
            <button className="primary-button full large" type="submit" disabled={busy || code.length < 6}>Verificar código</button>
          </form>
        ) : (
          <form className="cloud-connect" onSubmit={(event) => { event.preventDefault(); void onCodeRequest(email.trim()); }}>
            <label className="field"><span>Correo electrónico</span><input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            {cloud.mode === "error" && cloud.message && <span className="cloud-error">{cloud.message}</span>}
            <button className="primary-button full large" type="submit" disabled={busy}>Enviar código</button>
          </form>
        )}
        <small className="auth-help">Las cuentas se crean manualmente desde Supabase. No existe registro público.</small>
      </div>
    </section>
  );
}

function NavButton({ active, label, icon: Icon, onClick }: { active: boolean; label: string; icon: LucideIcon; onClick: () => void }) {
  return (
    <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick} aria-current={active ? "page" : undefined}>
      <Icon size={21} strokeWidth={active ? 2.5 : 2} />
      <span>{label}</span>
    </button>
  );
}

function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  return (
    <div className="month-switcher">
      <button onClick={() => onChange(moveMonth(month, -1))} aria-label="Mes anterior"><ArrowLeft size={18} /></button>
      <div><CalendarDays size={16} /><strong>{monthLabel(month)}</strong></div>
      <button onClick={() => onChange(moveMonth(month, 1))} aria-label="Mes siguiente"><ArrowRight size={18} /></button>
    </div>
  );
}

function HomeView({ data, month, onMonthChange, onAdd, onEdit, onOpenMovements, onOpenAnalysis, onCloseMonth, mounted, onSaveSettings }: {
  data: AppData;
  month: string;
  onMonthChange: (month: string) => void;
  onAdd: () => void;
  onEdit: (movement: Movement) => void;
  onOpenMovements: () => void;
  onOpenAnalysis: () => void;
  onCloseMonth: () => void;
  mounted: boolean;
  onSaveSettings: (settings: AppSettings) => void;
}) {
  const [openForecastMonth, setOpenForecastMonth] = useState<string | null>(null);
  const [customizing, setCustomizing] = useState(false);
  const [widgetDraft, setWidgetDraft] = useState<HomeWidgetId[]>(data.settings.homeWidgets ?? defaultHomeWidgets);
  const current = snapshotForMonth(data.movements, month);
  const projected = projectionForMonth(data.movements, month);
  const forecasts = forecastsForMonth(data.movements, month);
  const pendingOutCents = forecasts.filter((item) => item.forecast.kind !== "income").reduce((sum, item) => sum + item.remainingCents, 0);
  const monthlyMovements = movementsForMonth(data.movements, month);
  const confirmedExpenseProgress = data.settings.monthlyBudgetCents > 0 ? Math.min(100, (current.expenseCents / data.settings.monthlyBudgetCents) * 100) : 0;
  const savingProgress = data.settings.monthlySavingGoalCents > 0 ? Math.min(100, (current.savingCents / data.settings.monthlySavingGoalCents) * 100) : 0;
  const closing = data.closings.find((item) => item.month === month);
  const forecastsOpen = openForecastMonth === month;
  const plans = fundingPlans(data.movements).filter((plan) => plan.target.status === "planned" || plan.remainingCents > 0);
  const monthCategories = categoryBreakdown(data.movements, data.categories, month);
  const cumulative = annualCumulativeProjectionSeries(data.movements, data.closings, Number(month.slice(0, 4)));
  const widgets = data.settings.homeWidgets ?? defaultHomeWidgets;
  const show = (widget: HomeWidgetId) => widgets.includes(widget);

  function toggleWidget(widget: HomeWidgetId) {
    setWidgetDraft((currentWidgets) => currentWidgets.includes(widget)
      ? currentWidgets.filter((item) => item !== widget)
      : [...currentWidgets, widget]);
  }

  return (
    <div className="view-stack">
      <MonthSwitcher month={month} onChange={onMonthChange} />
      <button className="customize-home-button" type="button" onClick={() => { setWidgetDraft(widgets); setCustomizing((value) => !value); }}><SlidersHorizontal size={17} /> Personalizar Inicio</button>
      {customizing && <HomeWidgetEditor selected={widgetDraft} onToggle={toggleWidget} onSave={() => { onSaveSettings({ ...data.settings, homeWidgets: widgetDraft, updatedAt: new Date().toISOString() }); setCustomizing(false); }} />}
      {show("balance") && <section className="hero-card">
        <div className="hero-topline">
          <span>Disponible hasta hoy</span>
          <span className={`status-pill ${current.resultCents >= 0 ? "positive" : "negative"}`}>
            {current.resultCents >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {current.resultCents >= 0 ? "En positivo" : "Revisar gastos"}
          </span>
        </div>
        <strong className="hero-amount">{formatMoney(current.resultCents)}</strong>
        <div className="hero-breakdown">
          <div><ArrowDownLeft size={17} /><span>Ingresos<small>{formatMoney(current.incomeCents)}</small></span></div>
          <div><ArrowUpRight size={17} /><span>Gastos<small>{formatMoney(current.expenseCents)}</small></span></div>
          <div><PiggyBank size={17} /><span>Apartado<small>{formatMoney(current.savingCents)}</small></span></div>
        </div>
      </section>}

      {show("projection") && <section className={`projection-card ${projected.resultCents >= 0 ? "positive" : "negative"}`}>
        <div>
          <span className="eyebrow">Previsión de cierre</span>
          <h2>Así terminaría {monthLabel(month, "short").toLowerCase()}</h2>
          <p>Con lo realizado y todo lo que aún tienes previsto.</p>
        </div>
        <strong>{formatMoney(projected.resultCents)}</strong>
        <div className="projection-breakdown">
          <span>Ingresos <b>{formatMoney(projected.incomeCents)}</b></span>
          <span>Gastos <b>{formatMoney(projected.expenseCents)}</b></span>
          <span>Ahorro <b>{formatMoney(projected.savingCents)}</b></span>
        </div>
      </section>}

      {monthlyMovements.length === 0 && (
        <section className="empty-card">
          <div className="empty-icon"><ReceiptText size={27} /></div>
          <h2>Empieza por el primer movimiento</h2>
          <p>Añade un ingreso, un gasto o una cantidad que quieras separar para ahorrar.</p>
          <button className="primary-button" onClick={onAdd}><Plus size={18} /> Añadir movimiento</button>
        </section>
      )}

      {show("fundingGoals") && plans.length > 0 && <section className="section-card funding-goals-card">
        <div className="section-heading"><div><span className="eyebrow">Ahorro anticipado</span><h2>Próximos gastos fraccionados</h2></div></div>
        <div className="funding-goal-list">
          {plans.slice(0, 4).map((plan) => <button key={plan.target.id} className="funding-goal-row" onClick={() => onEdit(plan.target)}>
            <span className="funding-goal-icon"><Target size={19} /></span>
            <span><strong>{plan.target.concept}</strong><small>{formatMoney(plan.savedCents)} ahorrados de {formatMoney(plan.target.amountCents)} · gasto en {monthLabel(plan.target.date.slice(0, 7), "short")}</small><i><em style={{ width: `${Math.min(100, plan.progress)}%` }} /></i></span>
            <b>{Math.round(plan.progress)}%</b>
          </button>)}
        </div>
      </section>}

      {show("progress") && monthlyMovements.length > 0 && <section className="section-card progress-card">
            <div className="section-heading">
              <div><span className="eyebrow">Límites del mes</span><h2>Tu ritmo de gasto</h2></div>
              <button className="text-button" onClick={onOpenAnalysis}>Ver análisis <ChevronRight size={16} /></button>
            </div>
            <ProgressRow label="Presupuesto utilizado" value={confirmedExpenseProgress} detail={`${formatMoney(current.expenseCents)} de ${formatMoney(data.settings.monthlyBudgetCents)}`} tone="expense" />
            <ProgressRow label="Objetivo de ahorro" value={savingProgress} detail={`${formatMoney(current.savingCents)} de ${formatMoney(data.settings.monthlySavingGoalCents)}`} tone="saving" />
            {forecasts.length > 0 && (
              <div className="forecast-note"><CalendarDays size={17} /><span>Tienes {forecasts.length} previsión{forecasts.length === 1 ? "" : "es"}: {formatMoney(pendingOutCents)} de salida todavía pendiente.</span></div>
            )}
      </section>}

      {show("forecasts") && forecasts.length > 0 && (
            <section className="section-card forecast-card">
              <button className="forecast-toggle" type="button" aria-expanded={forecastsOpen} onClick={() => setOpenForecastMonth(forecastsOpen ? null : month)}>
                <div><span className="eyebrow">Planificación</span><h2>Previsiones del mes</h2></div>
                <span className="forecast-toggle-meta"><span className="forecast-count">{forecasts.length}</span><ChevronDown className={forecastsOpen ? "open" : ""} size={19} /></span>
              </button>
              <p className="forecast-summary">{formatMoney(pendingOutCents)} de salida pendiente</p>
              {forecastsOpen && (
                <div className="forecast-list">
                  {forecasts.map((item) => <ForecastRow key={item.forecast.id} item={item} categories={data.categories} onClick={() => onEdit(item.forecast)} />)}
                </div>
              )}
            </section>
      )}

      {show("recent") && monthlyMovements.length > 0 && <section className="section-card">
            <div className="section-heading">
              <div><span className="eyebrow">Actividad</span><h2>Últimos movimientos</h2></div>
              <button className="text-button" onClick={onOpenMovements}>Ver todos <ChevronRight size={16} /></button>
            </div>
            <div className="movement-list compact">
              {monthlyMovements.slice(0, 4).map((movement) => <MovementRow key={movement.id} movement={movement} categories={data.categories} onClick={() => onEdit(movement)} />)}
            </div>
      </section>}

      {show("categoryChart") && <section className="section-card chart-card home-chart-card">
        <div className="section-heading"><div><span className="eyebrow">Gráfico del mes</span><h2>Gastos por categoría</h2></div><button className="text-button" onClick={onOpenAnalysis}>Ver análisis <ChevronRight size={16} /></button></div>
        {monthCategories.length === 0 ? <ChartEmpty /> : <div className="donut-wrap">
          <div className="donut-chart">{mounted && <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={monthCategories} dataKey="value" innerRadius={54} outerRadius={76} paddingAngle={2} stroke="none">{monthCategories.map((item) => <Cell key={item.id} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formatMoney(Number(value))} /></PieChart></ResponsiveContainer>}<div className="donut-center"><span>Total</span><strong>{formatShortMoney(current.expenseCents)}</strong></div></div>
          <div className="legend-list">{monthCategories.slice(0, 5).map((item) => <div key={item.id}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{current.expenseCents > 0 ? Math.round((item.value / current.expenseCents) * 100) : 0}%</strong></div>)}</div>
        </div>}
      </section>}

      {show("annualChart") && <section className="section-card chart-card home-chart-card">
        <div className="section-heading"><div><span className="eyebrow">Gráfico anual</span><h2>Evolución acumulada</h2></div><button className="text-button" onClick={onOpenAnalysis}>Ver análisis <ChevronRight size={16} /></button></div>
        {cumulative.every((item) => item.ingresosAcumulados === 0 && item.gastosAcumulados === 0) ? <ChartEmpty /> : mounted && <ResponsiveContainer width="100%" height={220}><LineChart data={cumulative} margin={{ top: 8, right: 7, left: -25, bottom: 0 }}><CartesianGrid stroke="#e9edf3" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#778197", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#778197", fontSize: 9 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => formatMoney(Number(value) * 100)} contentStyle={{ borderRadius: 14, border: "1px solid #e1e6ee" }} /><Line type="monotone" dataKey="ingresosAcumulados" name="Ingresos" stroke="#129775" strokeWidth={2.3} dot={false} /><Line type="monotone" dataKey="gastosAcumulados" name="Gastos" stroke="#ef6c67" strokeWidth={2.3} dot={false} /><Line type="monotone" dataKey="disponibleAcumulado" name="Disponible" stroke="#5977cf" strokeWidth={2.6} dot={false} /></LineChart></ResponsiveContainer>}
        <div className="chart-key"><span><i className="income" />Ingresos</span><span><i className="expense" />Gastos</span><span><i className="saving" />Disponible</span></div>
      </section>}

      <section className={`close-card ${closing ? "closed" : ""}`}>
        <div className="close-icon">{closing ? <Check size={22} /> : <CalendarDays size={22} />}</div>
        <div>
          <h2>{closing ? "Mes cerrado" : "Cierra el mes cuando termines"}</h2>
          <p>{closing ? `Guardaste esta fotografía el ${dayLabel(closing.closedAt.slice(0, 10))}.` : "Guarda el resultado y una nota para poder comparar tu evolución."}</p>
        </div>
        <button onClick={onCloseMonth}>{closing ? "Ver" : "Cerrar mes"}</button>
      </section>
    </div>
  );
}

const homeWidgetCatalog: Array<{ id: HomeWidgetId; label: string; description: string }> = [
  { id: "balance", label: "Balance del mes", description: "Disponible, ingresos, gastos y ahorro" },
  { id: "projection", label: "Previsión de cierre", description: "Cómo terminaría el mes" },
  { id: "fundingGoals", label: "Gastos fraccionados", description: "Progreso de tus ahorros anticipados" },
  { id: "progress", label: "Ritmo de gasto", description: "Presupuesto y objetivo de ahorro" },
  { id: "forecasts", label: "Previsiones", description: "Ingresos y salidas pendientes" },
  { id: "recent", label: "Últimos movimientos", description: "Actividad reciente del mes" },
  { id: "categoryChart", label: "Gráfico por categorías", description: "Distribución de gastos del mes" },
  { id: "annualChart", label: "Gráfico anual", description: "Evolución acumulada del año" },
];

function HomeWidgetEditor({ selected, onToggle, onSave }: {
  selected: HomeWidgetId[];
  onToggle: (widget: HomeWidgetId) => void;
  onSave: () => void;
}) {
  const ordered = [
    ...selected.map((id) => homeWidgetCatalog.find((item) => item.id === id)).filter(Boolean),
    ...homeWidgetCatalog.filter((item) => !selected.includes(item.id)),
  ] as typeof homeWidgetCatalog;
  return <section className="section-card widget-editor">
    <div className="section-heading"><div><span className="eyebrow">Tu portada</span><h2>Elige qué quieres ver</h2></div><span className="forecast-count">{selected.length}</span></div>
    <div className="widget-option-list">{ordered.map((widget) => {
      const active = selected.includes(widget.id);
      return <div className={`widget-option ${active ? "active" : ""}`} key={widget.id}>
        <button type="button" className="widget-toggle" onClick={() => onToggle(widget.id)} aria-pressed={active}><span><strong>{widget.label}</strong><small>{widget.description}</small></span><i>{active ? <Check size={15} /> : <Plus size={15} />}</i></button>
      </div>;
    })}</div>
    <button className="primary-button full" type="button" onClick={onSave}>Guardar mi Inicio</button>
  </section>;
}

function ProgressRow({ label, value, detail, tone }: { label: string; value: number; detail: string; tone: "expense" | "saving" }) {
  return (
    <div className="progress-row">
      <div><strong>{label}</strong><span>{detail}</span></div>
      <div className="progress-track"><span className={tone} style={{ width: `${value}%` }} /></div>
      <small>{Math.round(value)}%</small>
    </div>
  );
}

function ForecastRow({ item, categories, onClick }: {
  item: ReturnType<typeof forecastsForMonth>[number];
  categories: Category[];
  onClick: () => void;
}) {
  const category = categories.find((entry) => entry.id === item.forecast.categoryId);
  const appliedLabel = item.forecast.kind === "expense" ? "Gastado" : item.forecast.kind === "income" ? "Cobrado" : "Apartado";
  const remainingLabel = item.forecast.kind === "income" ? "Por cobrar" : item.forecast.kind === "saving" ? "Por apartar" : "Queda";
  return (
    <button className="forecast-row" onClick={onClick}>
      <span className="movement-icon" style={{ color: category?.color, backgroundColor: `${category?.color ?? "#8190a5"}18` }}><CategoryIcon category={category} /></span>
      <span className="forecast-copy">
        <span><strong>{item.forecast.concept}</strong><b>{formatMoney(item.forecast.amountCents)}</b></span>
        <small>{appliedLabel}: {formatMoney(item.appliedCents)} · {remainingLabel}: {formatMoney(item.remainingCents)}</small>
        <i><em style={{ width: `${Math.min(100, item.progress)}%`, backgroundColor: category?.color }} /></i>
        {item.overrunCents > 0 && <small className="forecast-overrun">Superada en {formatMoney(item.overrunCents)}; el gasto extra sigue descontando.</small>}
      </span>
      <ChevronRight size={17} />
    </button>
  );
}

function MovementsView({ data, month, onMonthChange, onAdd, onEdit }: {
  data: AppData;
  month: string;
  onMonthChange: (month: string) => void;
  onAdd: () => void;
  onEdit: (movement: Movement) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "expense" | "income" | "saving" | "planned">("all");
  const [grouping, setGrouping] = useState<"date" | "category">("date");
  const visible = movementsForMonth(data.movements, month).filter((movement) => {
    const category = data.categories.find((item) => item.id === movement.categoryId);
    const matchesText = `${movement.concept} ${category?.name ?? ""}`.toLowerCase().includes(query.toLowerCase());
    const matchesFilter = filter === "all" || (filter === "planned" ? movement.status === "planned" : movement.kind === filter);
    return matchesText && matchesFilter;
  });
  const grouped = visible.reduce<Record<string, Movement[]>>((groups, movement) => {
    const groupKey = grouping === "date" ? movement.date : movement.categoryId;
    (groups[groupKey] ??= []).push(movement);
    return groups;
  }, {});
  const groupedEntries = Object.entries(grouped).sort(([first], [second]) => {
    if (grouping === "date") return second.localeCompare(first);
    const firstName = data.categories.find((category) => category.id === first)?.name ?? "Sin categoría";
    const secondName = data.categories.find((category) => category.id === second)?.name ?? "Sin categoría";
    return firstName.localeCompare(secondName, "es");
  });

  return (
    <div className="view-stack">
      <div className="page-intro"><span className="eyebrow">Registro manual</span><h1>Movimientos</h1><p>Todo lo que entra, sale o apartas para ahorrar.</p></div>
      <MonthSwitcher month={month} onChange={onMonthChange} />
      <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por concepto o categoría" /></label>
      <div className="filter-scroll">
        {([['all','Todos'],['expense','Gastos'],['income','Ingresos'],['saving','Ahorro'],['planned','Previstos']] as const).map(([value, label]) => (
          <button key={value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>
        ))}
      </div>
      <div className="movement-grouping">
        <span>Organizar por</span>
        <div role="group" aria-label="Organizar movimientos"><button type="button" className={grouping === "date" ? "active" : ""} onClick={() => setGrouping("date")}>Fecha</button><button type="button" className={grouping === "category" ? "active" : ""} onClick={() => setGrouping("category")}>Grupo</button></div>
      </div>
      {visible.length === 0 ? (
        <section className="empty-card slim"><div className="empty-icon"><Search size={25} /></div><h2>No hay movimientos</h2><p>Cambia el filtro o añade un movimiento para {monthLabel(month).toLowerCase()}.</p><button className="primary-button" onClick={onAdd}><Plus size={18} /> Añadir</button></section>
      ) : (
        <div className="dated-list">
          {groupedEntries.map(([groupKey, movements]) => (
            <section key={groupKey}>
              <h2>{grouping === "date" ? dayLabel(groupKey) : data.categories.find((category) => category.id === groupKey)?.name ?? "Sin categoría"}<span>{formatMoney(movements.reduce((sum, movement) => sum + (movement.kind === "income" ? movement.amountCents : -movement.amountCents), 0))}</span></h2>
              <div className="movement-list">{movements.map((movement) => <MovementRow key={movement.id} movement={movement} categories={data.categories} onClick={() => onEdit(movement)} />)}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function MovementRow({ movement, categories, onClick }: { movement: Movement; categories: Category[]; onClick: () => void }) {
  const category = categories.find((item) => item.id === movement.categoryId);
  const sign = movement.kind === "income" ? "+" : "−";
  return (
    <button className="movement-row" onClick={onClick}>
      <span className="movement-icon" style={{ color: category?.color, backgroundColor: `${category?.color ?? "#8190a5"}18` }}><CategoryIcon category={category} /></span>
      <span className="movement-copy"><strong>{movement.concept}</strong><small>{category?.name ?? "Sin categoría"}{movement.status === "planned" && <em>Previsto</em>}</small></span>
      <span className={`movement-amount ${movement.kind}`}><strong>{sign}{formatMoney(movement.amountCents)}</strong><small>{dayLabel(movement.date)}</small></span>
    </button>
  );
}

function AnalysisView({ data, month, onMonthChange, mounted }: { data: AppData; month: string; onMonthChange: (month: string) => void; mounted: boolean }) {
  const [period, setPeriod] = useState<AnalysisPeriod>("month");
  const [savingCut, setSavingCut] = useState(15);
  const snapshot = snapshotForMonth(data.movements, month);
  const projected = projectionForMonth(data.movements, month);
  const previous = snapshotForMonth(data.movements, moveMonth(month, -1));
  const categories = categoryBreakdown(data.movements, data.categories, month);
  const nonEssential = categories.filter((item) => !item.essential);
  const reducible = nonEssential.reduce((sum, item) => sum + item.value, 0);
  const opportunity = Math.round((reducible * savingCut) / 100);
  const year = Number(month.slice(0, 4));
  const series = annualSeries(data.movements, year);
  const projectionSeries = annualProjectionSeries(data.movements, data.closings, year);
  const cumulativeSeries = annualCumulativeProjectionSeries(data.movements, data.closings, year);
  const finalCumulative = cumulativeSeries[cumulativeSeries.length - 1];
  const yearTotals = series.reduce((totals, item) => ({ income: totals.income + item.ingresos, expense: totals.expense + item.gastos, saving: totals.saving + item.ahorro, result: totals.result + item.resultado }), { income: 0, expense: 0, saving: 0, result: 0 });
  const yearProjectionTotals = projectionSeries.reduce(
    (totals, item) => ({
      income: totals.income + item.ingresosPrevistos,
      expense: totals.expense + item.gastosPrevistos,
      saving: totals.saving + item.ahorroPrevisto,
      result: totals.result + item.resultadoPrevisto,
    }),
    { income: 0, expense: 0, saving: 0, result: 0 },
  );
  const forecastComparison = [
    { name: "Ingresos", real: snapshot.incomeCents / 100, cierre: projected.incomeCents / 100 },
    { name: "Gastos", real: snapshot.expenseCents / 100, cierre: projected.expenseCents / 100 },
    { name: "Ahorro", real: snapshot.savingCents / 100, cierre: projected.savingCents / 100 },
  ];
  const expenseChange = previous.expenseCents > 0 ? ((snapshot.expenseCents - previous.expenseCents) / previous.expenseCents) * 100 : 0;

  return (
    <div className="view-stack">
      <div className="page-intro"><span className="eyebrow">Entender para decidir</span><h1>Análisis</h1><p>Una lectura sencilla de tu mes y de todo el año.</p></div>
      <div className="segmented"><button className={period === "month" ? "active" : ""} onClick={() => setPeriod("month")}>Mes</button><button className={period === "year" ? "active" : ""} onClick={() => setPeriod("year")}>Año</button></div>
      {period === "month" ? (
        <>
          <MonthSwitcher month={month} onChange={onMonthChange} />
          <div className="metric-grid triple">
            <MetricCard label="Gastos" value={formatMoney(snapshot.expenseCents)} foot={previous.expenseCents > 0 ? `${Math.abs(expenseChange).toFixed(0)}% ${expenseChange <= 0 ? "menos" : "más"} que el mes anterior` : "Sin comparación anterior"} tone={expenseChange <= 0 ? "good" : "warn"} />
            <MetricCard label="Tasa de ahorro" value={snapshot.incomeCents > 0 ? `${Math.round((snapshot.savingCents / snapshot.incomeCents) * 100)}%` : "0%"} foot={`Has apartado ${formatMoney(snapshot.savingCents)}`} tone="good" />
            <MetricCard label="Cierre previsto" value={formatMoney(projected.resultCents)} foot={`Hoy tienes ${formatMoney(snapshot.resultCents)}`} tone={projected.resultCents >= 0 ? "good" : "warn"} />
          </div>
          <section className="section-card chart-card">
            <div className="section-heading"><div><span className="eyebrow">Real + pendiente</span><h2>Cómo puede terminar el mes</h2></div></div>
            {mounted && <ResponsiveContainer width="100%" height={220}><BarChart data={forecastComparison} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}><CartesianGrid stroke="#e9edf3" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#778197", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#778197", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => formatMoney(Number(value) * 100)} contentStyle={{ borderRadius: 14, border: "1px solid #e1e6ee" }} /><Bar dataKey="real" name="Realizado" fill="#a8b1c1" radius={[5, 5, 0, 0]} /><Bar dataKey="cierre" name="Cierre estimado" fill="#5b6ee1" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer>}
            <div className="chart-key"><span><i className="actual" />Realizado</span><span><i className="forecast" />Cierre estimado</span></div>
          </section>
          <section className="section-card chart-card">
            <div className="section-heading"><div><span className="eyebrow">Distribución</span><h2>¿Dónde se va el dinero?</h2></div></div>
            {categories.length === 0 ? <ChartEmpty /> : (
              <>
                <div className="donut-wrap">
                  <div className="donut-chart">
                    {mounted && <ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={categories} dataKey="value" innerRadius={54} outerRadius={76} paddingAngle={2} stroke="none">{categories.map((item) => <Cell key={item.id} fill={item.color} />)}</Pie><Tooltip formatter={(value) => formatMoney(Number(value))} /></PieChart></ResponsiveContainer>}
                    <div className="donut-center"><span>Total</span><strong>{formatShortMoney(snapshot.expenseCents)}</strong></div>
                  </div>
                  <div className="legend-list">{categories.slice(0, 5).map((item) => <div key={item.id}><i style={{ background: item.color }} /><span>{item.name}</span><strong>{snapshot.expenseCents > 0 ? Math.round((item.value / snapshot.expenseCents) * 100) : 0}%</strong></div>)}</div>
                </div>
              </>
            )}
          </section>
          <section className="saving-lab">
            <div className="saving-lab-icon"><PiggyBank size={24} /></div>
            <div className="saving-copy"><span className="eyebrow">Simulador sencillo</span><h2>Libera {formatMoney(opportunity)} al mes</h2><p>Reduciendo un {savingCut}% los gastos no esenciales{nonEssential[0] ? `, empezando por ${nonEssential[0].name.toLowerCase()}` : ""}.</p></div>
            <label><span>Ajuste</span><strong>{savingCut}%</strong><input type="range" min="5" max="35" step="5" value={savingCut} onChange={(event) => setSavingCut(Number(event.target.value))} /></label>
            <div className="year-impact"><span>En 12 meses podrías sumar</span><strong>{formatMoney(opportunity * 12)}</strong></div>
          </section>
        </>
      ) : (
        <>
          <div className="year-heading"><button onClick={() => onMonthChange(`${year - 1}-${month.slice(5)}`)}><ArrowLeft size={18} /></button><strong>{year}</strong><button onClick={() => onMonthChange(`${year + 1}-${month.slice(5)}`)}><ArrowRight size={18} /></button></div>
          <div className="metric-grid triple">
            <MetricCard label="Resultado previsto" value={formatMoney(yearProjectionTotals.result * 100)} foot={`Real hasta hoy: ${formatMoney(yearTotals.result * 100)}`} tone={yearProjectionTotals.result >= 0 ? "good" : "warn"} />
            <MetricCard label="Ingresos previstos" value={formatMoney(yearProjectionTotals.income * 100)} foot={`Realizados: ${formatMoney(yearTotals.income * 100)}`} tone="good" />
            <MetricCard label="Gastos previstos" value={formatMoney(yearProjectionTotals.expense * 100)} foot={`Realizados: ${formatMoney(yearTotals.expense * 100)}`} tone="neutral" />
          </div>
          <section className="section-card chart-card annual-chart">
            <div className="section-heading"><div><span className="eyebrow">Real + previsto</span><h2>Evolución acumulada del año</h2></div><span className={`chart-result ${finalCumulative.disponibleAcumulado >= 0 ? "positive" : "negative"}`}>Final {formatMoney(finalCumulative.disponibleAcumulado * 100)}</span></div>
            {cumulativeSeries.every((item) => item.ingresosAcumulados === 0 && item.gastosAcumulados === 0) ? <ChartEmpty /> : mounted && (
              <ResponsiveContainer width="100%" height={255}><LineChart data={cumulativeSeries} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}><CartesianGrid stroke="#e9edf3" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#778197", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#778197", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => formatMoney(Number(value) * 100)} contentStyle={{ borderRadius: 14, border: "1px solid #e1e6ee" }} /><Line type="monotone" dataKey="ingresosAcumulados" name="Ingresos acumulados" stroke="#129775" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="gastosAcumulados" name="Gastos acumulados" stroke="#ef6c67" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="disponibleAcumulado" name="Disponible acumulado" stroke="#5977cf" strokeWidth={2.8} dot={false} /></LineChart></ResponsiveContainer>
            )}
            <div className="chart-key"><span><i className="income" />Ingresos</span><span><i className="expense" />Gastos</span><span><i className="saving" />Disponible</span></div>
          </section>
          <section className="section-card chart-card annual-chart">
            <div className="section-heading"><div><span className="eyebrow">Plan anual</span><h2>Cierre estimado por mes</h2></div></div>
            {projectionSeries.every((item) => item.ingresosPrevistos === 0 && item.gastosPrevistos === 0 && item.ahorroPrevisto === 0) ? <ChartEmpty /> : mounted && (
              <ResponsiveContainer width="100%" height={245}><LineChart data={projectionSeries} margin={{ top: 10, right: 8, left: -22, bottom: 0 }}><CartesianGrid stroke="#e9edf3" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#778197", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#778197", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => formatMoney(Number(value) * 100)} contentStyle={{ borderRadius: 14, border: "1px solid #e1e6ee" }} /><Line type="monotone" dataKey="ingresosPrevistos" name="Ingresos" stroke="#129775" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="gastosPrevistos" name="Gastos" stroke="#ef6c67" strokeWidth={2.5} dot={false} /><Line type="monotone" dataKey="ahorroPrevisto" name="Ahorro" stroke="#5977cf" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer>
            )}
            <div className="chart-key"><span><i className="income" />Ingresos</span><span><i className="expense" />Gastos</span><span><i className="saving" />Ahorro</span></div>
          </section>
          <section className="section-card chart-card">
            <div className="section-heading"><div><span className="eyebrow">Real frente a plan</span><h2>Resultado mensual</h2></div></div>
            {mounted && <ResponsiveContainer width="100%" height={220}><BarChart data={projectionSeries} margin={{ top: 8, right: 4, left: -24, bottom: 0 }}><CartesianGrid stroke="#e9edf3" vertical={false} /><XAxis dataKey="name" tick={{ fill: "#778197", fontSize: 11 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: "#778197", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip formatter={(value) => formatMoney(Number(value) * 100)} contentStyle={{ borderRadius: 14, border: "1px solid #e1e6ee" }} /><Bar dataKey="resultado" name="Real" fill="#a8b1c1" radius={[5, 5, 0, 0]} /><Bar dataKey="resultadoPrevisto" name="Previsto" fill="#5b6ee1" radius={[5, 5, 0, 0]} /></BarChart></ResponsiveContainer>}
            <div className="chart-key"><span><i className="actual" />Realizado</span><span><i className="forecast" />Previsto</span></div>
          </section>
        </>
      )}
    </div>
  );
}

function MetricCard({ label, value, foot, tone }: { label: string; value: string; foot: string; tone: "good" | "warn" | "neutral" }) {
  return <div className={`metric-card ${tone}`}><span>{label}</span><strong>{value}</strong><small>{foot}</small></div>;
}

function ChartEmpty() {
  return <div className="chart-empty"><BarChart3 size={27} /><strong>Aún no hay datos suficientes</strong><span>Los gráficos aparecerán cuando registres movimientos.</span></div>;
}

function SettingsView({ data, cloud, onSave, onClear, onCloudConnect, onCloudVerify, onCloudSync, onCloudDisconnect }: {
  data: AppData;
  cloud: CloudState;
  onSave: (settings: AppSettings) => void;
  onClear: () => void;
  onCloudConnect: (email: string) => Promise<void>;
  onCloudVerify: (email: string, code: string) => Promise<void>;
  onCloudSync: () => void;
  onCloudDisconnect: () => void;
}) {
  const [name, setName] = useState(data.settings.displayName);
  const [budget, setBudget] = useState(String(data.settings.monthlyBudgetCents / 100).replace(".", ","));
  const [goal, setGoal] = useState(String(data.settings.monthlySavingGoalCents / 100).replace(".", ","));
  const [email, setEmail] = useState(cloud.email ?? "");
  const [code, setCode] = useState("");
  const [resendSeconds, setResendSeconds] = useState(0);
  const [confirmClear, setConfirmClear] = useState(false);
  const standalone = typeof window !== "undefined" && window.matchMedia("(display-mode: standalone)").matches;
  const cloudLabel = cloud.mode === "synced" ? "Sincronizado con Supabase" : cloud.mode === "syncing" ? "Sincronizando…" : cloud.mode === "offline" ? "Sin conexión · cambios guardados" : cloud.mode === "codeSent" ? "Introduce el código del correo" : cloud.mode === "error" ? "Requiere atención" : cloud.mode === "signedOut" ? "Conecta tus dispositivos" : "Guardados solo en este dispositivo";

  useEffect(() => {
    if (resendSeconds <= 0) return;
    const timer = window.setTimeout(() => setResendSeconds((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [resendSeconds]);

  function requestCode() {
    const value = email.trim();
    if (!value || resendSeconds > 0) return;
    setResendSeconds(60);
    void onCloudConnect(value);
  }

  return (
    <div className="view-stack">
      <div className="page-intro"><span className="eyebrow">A tu medida</span><h1>Ajustes</h1><p>Configura tus objetivos y cómo quieres usar la aplicación.</p></div>
      <section className="section-card settings-card">
        <div className="section-heading"><div><span className="eyebrow">Preferencias</span><h2>Objetivos mensuales</h2></div></div>
        <label className="field"><span>Tu nombre</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" /></label>
        <div className="field-pair">
          <label className="field"><span>Presupuesto de gasto</span><div className="money-input"><input inputMode="decimal" value={budget} onChange={(event) => setBudget(event.target.value)} /><b>€</b></div></label>
          <label className="field"><span>Objetivo de ahorro</span><div className="money-input"><input inputMode="decimal" value={goal} onChange={(event) => setGoal(event.target.value)} /><b>€</b></div></label>
        </div>
        <button className="primary-button full" onClick={() => onSave({ ...data.settings, displayName: name.trim() || "Usuario", monthlyBudgetCents: parseAmount(budget), monthlySavingGoalCents: parseAmount(goal), currency: "EUR", updatedAt: new Date().toISOString() })}>Guardar preferencias</button>
      </section>

      <section className="section-card cloud-card">
        <div className="settings-row"><span className="settings-icon cloud">{cloud.mode === "offline" ? <WifiOff size={21} /> : <Cloud size={21} />}</span><div><strong>Datos y sincronización</strong><small>{cloudLabel}</small></div><span className={`connection-dot ${cloud.mode === "synced" ? "online" : cloud.mode === "syncing" ? "working" : ""}`} /></div>
        {cloud.mode === "disabled" ? (
          <p>Supabase no está configurado en esta versión. Tus datos continúan seguros en este dispositivo.</p>
        ) : cloud.mode === "signedOut" ? (
          <form className="cloud-connect" onSubmit={(event) => { event.preventDefault(); requestCode(); }}>
            <p>Introduce tu correo. Recibirás un código numérico para activar la sincronización sin salir de la aplicación.</p>
            <label className="field"><span>Correo electrónico</span><input type="email" inputMode="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="tu@email.com" required /></label>
            <button className="primary-button full" type="submit" disabled={resendSeconds > 0}>{resendSeconds > 0 ? `Espera ${resendSeconds} s` : "Enviar código seguro"}</button>
          </form>
        ) : cloud.mode === "codeSent" ? (
          <form className="cloud-connect code-form" onSubmit={(event) => { event.preventDefault(); if (cloud.email && code.length >= 6) { const value = code; setCode(""); void onCloudVerify(cloud.email, value); } }}>
            <div className="cloud-message"><Check size={19} /><span>Hemos enviado un código a <strong>{cloud.email}</strong>. Introdúcelo aquí para guardar la sesión en esta aplicación.</span></div>
            <label className="field"><span>Código recibido</span><input className="otp-input" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 10))} placeholder="00000000" minLength={6} maxLength={10} required /></label>
            {cloud.message && <span className="cloud-error">{cloud.message}</span>}
            <button className="primary-button full" type="submit" disabled={code.length < 6}>Verificar y sincronizar</button>
            <button className="quiet-button full" type="button" disabled={resendSeconds > 0} onClick={requestCode}>{resendSeconds > 0 ? `Reenviar en ${resendSeconds} s` : "Reenviar código"}</button>
          </form>
        ) : (
          <div className="cloud-actions">
            <p>{cloud.mode === "offline" ? "Puedes seguir trabajando. Los cambios se subirán cuando vuelva la conexión." : `Tus movimientos están vinculados a ${cloud.email ?? "tu cuenta"}.`}</p>
            {cloud.mode === "error" && cloud.message && <span className="cloud-error">{cloud.message}</span>}
            <div><button className="secondary-button" onClick={onCloudSync} disabled={cloud.mode === "syncing"}><RefreshCw size={15} className={cloud.mode === "syncing" ? "spin" : ""} /> Sincronizar</button><button className="quiet-button" onClick={onCloudDisconnect}>Desconectar</button></div>
          </div>
        )}
      </section>

      <section className="section-card install-card">
        <div className="settings-row"><span className="settings-icon install"><Download size={21} /></span><div><strong>{standalone ? "Aplicación instalada" : "Instalar en el iPhone"}</strong><small>{standalone ? "La estás usando como una app" : "No necesitas App Store"}</small></div>{standalone && <Check size={20} className="green" />}</div>
        {!standalone && <ol><li>Abre esta página en <strong>Safari</strong>.</li><li>Pulsa <strong>Compartir</strong>.</li><li>Elige <strong>Añadir a pantalla de inicio</strong>.</li></ol>}
      </section>

      <section className="section-card data-card">
        <div className="section-heading"><div><span className="eyebrow">Privacidad</span><h2>Datos de la aplicación</h2></div></div>
        {!confirmClear ? <button className="danger-link" onClick={() => setConfirmClear(true)}>Borrar movimientos y cierres</button> : <div className="confirm-delete"><span>¿Seguro? Esta acción no se puede deshacer.</span><button onClick={() => { onClear(); setConfirmClear(false); }}>Sí, borrar</button><button onClick={() => setConfirmClear(false)}>Cancelar</button></div>}
      </section>
      <p className="version-note">Mi balance · PWA con sincronización segura</p>
    </div>
  );
}

function MovementSheet({ movement, categories, movements, selectedMonth, onClose, onSave, onCopy, onCreateFundingPlan, onDelete }: {
  movement: Movement | null;
  categories: Category[];
  movements: Movement[];
  selectedMonth: string;
  onClose: () => void;
  onSave: (movement: Movement) => void;
  onCopy: (movements: Movement[]) => void;
  onCreateFundingPlan: (movements: Movement[]) => void;
  onDelete: (id: string) => void;
}) {
  const initialKind = movement?.kind ?? "expense";
  const initialDate = movement?.date ?? dateInputForMonth(selectedMonth);
  const initialCategoryId = movement?.categoryId ?? categories.find((category) => category.kind === initialKind)?.id ?? "";
  const initialForecastCandidates = movements.filter(
    (item) => item.status === "planned" && item.kind === initialKind && item.categoryId === initialCategoryId && item.date.startsWith(initialDate.slice(0, 7)),
  );
  const [kind, setKind] = useState<MovementKind>(initialKind);
  const [amount, setAmount] = useState(movement ? String(movement.amountCents / 100).replace(".", ",") : "");
  const [concept, setConcept] = useState(movement?.concept ?? "");
  const [date, setDate] = useState(initialDate);
  const [categoryId, setCategoryId] = useState(initialCategoryId);
  const [planned, setPlanned] = useState(movement?.status === "planned");
  const [forecastId, setForecastId] = useState(movement?.forecastId ?? (movement === null && initialForecastCandidates.length === 1 ? initialForecastCandidates[0].id : ""));
  const [notes, setNotes] = useState(movement?.notes ?? "");
  const [copyOpen, setCopyOpen] = useState(false);
  const [copyYear, setCopyYear] = useState(Number(moveMonth(initialDate.slice(0, 7), 1).slice(0, 4)));
  const [copyMonths, setCopyMonths] = useState<string[]>([]);
  const [fractionExpense, setFractionExpense] = useState(false);
  const [installments, setInstallments] = useState(6);
  const [error, setError] = useState("");
  const availableCategories = categories.filter((category) => category.kind === kind);
  const availableForecasts = movements.filter(
    (item) => item.id !== movement?.id && item.status === "planned" && item.kind === kind && item.date.startsWith(date.slice(0, 7)),
  );
  const currentUsage = movement?.status === "planned" ? forecastUsage(movements, movement) : null;
  const lockedForecast = Boolean(currentUsage && currentUsage.appliedCents > 0);
  const sourceMonth = date.slice(0, 7);
  const copyYearMonths = Array.from({ length: 12 }, (_, index) => `${copyYear}-${String(index + 1).padStart(2, "0")}`);
  const linkedForecast = availableForecasts.find((item) => item.id === forecastId);
  const isFundingTarget = movement?.fundingRole === "target" && Boolean(movement.fundingPlanId);
  const fractionAmountCents = parseAmount(amount);
  const estimatedInstallmentCents = installments > 0 ? Math.ceil(fractionAmountCents / installments) : 0;
  const firstContributionMonth = date ? moveMonth(date.slice(0, 7), -installments) : selectedMonth;

  function selectKind(value: MovementKind) {
    if (lockedForecast) return;
    setKind(value);
    setCategoryId(categories.find((category) => category.kind === value)?.id ?? "");
    setForecastId("");
  }

  function submit(statusOverride?: "confirmed") {
    const amountCents = parseAmount(amount);
    if (!concept.trim() || amountCents <= 0 || !date || !categoryId) {
      setError("Completa el importe, el concepto, la fecha y la categoría.");
      return;
    }
    const now = new Date().toISOString();
    const status = statusOverride ?? (planned ? "planned" : "confirmed");
    if (fractionExpense && movement === null) {
      createFundingPlan(amountCents);
      return;
    }
    onSave({
      id: movement?.id ?? crypto.randomUUID(),
      concept: concept.trim(),
      amountCents,
      date,
      categoryId,
      kind,
      status,
      forecastId: status === "confirmed" && availableForecasts.some((item) => item.id === forecastId) ? forecastId : undefined,
      fundingPlanId: movement?.fundingPlanId ?? linkedForecast?.fundingPlanId,
      fundingRole: movement?.fundingRole ?? (linkedForecast?.fundingRole === "contribution" ? "contribution" : undefined),
      fundingInstallments: movement?.fundingInstallments,
      notes: notes.trim(),
      createdAt: movement?.createdAt ?? now,
      updatedAt: movement ? now : now,
    });
  }

  function createFundingPlan(amountCents: number) {
    if (kind !== "expense" || !planned || installments < 2 || installments > 120) {
      setError("El gasto fraccionado debe ser una previsión dividida entre 2 y 120 meses.");
      return;
    }
    const currentMonth = monthKey(new Date());
    if (firstContributionMonth < currentMonth) {
      setError("No hay suficientes meses hasta la fecha del gasto. Reduce las mensualidades o mueve el gasto a una fecha posterior.");
      return;
    }
    const planId = crypto.randomUUID();
    const now = Date.now();
    const baseAmount = Math.floor(amountCents / installments);
    const remainder = amountCents - baseAmount * installments;
    const target: Movement = {
      id: crypto.randomUUID(), concept: concept.trim(), amountCents, date, categoryId, kind: "expense", status: "planned",
      fundingPlanId: planId, fundingRole: "target", fundingInstallments: installments, notes: notes.trim(),
      createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
    };
    const savingCategoryId = categories.find((category) => category.id === "goals")?.id
      ?? categories.find((category) => category.kind === "saving")?.id ?? "goals";
    const contributions = Array.from({ length: installments }, (_, index): Movement => {
      const contributionMonth = moveMonth(date.slice(0, 7), -(installments - index));
      const timestamp = new Date(now + index + 1).toISOString();
      return {
        id: crypto.randomUUID(),
        concept: `Ahorro para ${concept.trim()}`,
        amountCents: baseAmount + (index < remainder ? 1 : 0),
        date: dateForMonth(date, contributionMonth),
        categoryId: savingCategoryId,
        kind: "saving",
        status: "planned",
        fundingPlanId: planId,
        fundingRole: "contribution",
        notes: `Aportación ${index + 1} de ${installments} para ${concept.trim()}`,
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
    onCreateFundingPlan([target, ...contributions]);
  }

  function createCopies() {
    const amountCents = parseAmount(amount);
    const targetMonths = copyMonths.filter((targetMonth) => targetMonth !== sourceMonth);
    if (!movement || !concept.trim() || amountCents <= 0 || !date || !categoryId) {
      setError("Completa el importe, el concepto, la fecha y la categoría antes de copiar.");
      return;
    }
    if (targetMonths.length === 0) {
      setError("Selecciona al menos un mes para crear la copia.");
      return;
    }
    const copies = targetMonths.sort().map((targetMonth, index) => {
      const timestamp = new Date(Date.now() + index).toISOString();
      return {
        id: crypto.randomUUID(),
        concept: concept.trim(),
        amountCents,
        date: dateForMonth(date, targetMonth),
        categoryId,
        kind,
        status: "planned" as const,
        notes: notes.trim(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
    });
    onCopy(copies);
  }

  function toggleCopyMonth(targetMonth: string) {
    if (targetMonth === sourceMonth) return;
    setError("");
    setCopyMonths((selected) => selected.includes(targetMonth) ? selected.filter((month) => month !== targetMonth) : [...selected, targetMonth].sort());
  }

  function useQuarterlySchedule() {
    const months = Array.from({ length: 4 }, (_, index) => moveMonth(sourceMonth, (index + 1) * 3));
    setCopyMonths(months);
    setCopyYear(Number(months[0].slice(0, 4)));
    setError("");
  }

  function useAnnualSchedule() {
    const targetMonth = moveMonth(sourceMonth, 12);
    setCopyMonths([targetMonth]);
    setCopyYear(Number(targetMonth.slice(0, 4)));
    setError("");
  }

  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label={movement ? "Editar movimiento" : "Nuevo movimiento"}>
        <div className="sheet-handle" />
        <div className="sheet-heading"><div><span className="eyebrow">{movement ? "Editar" : "Registro manual"}</span><h2>{movement ? "Movimiento" : "Nuevo movimiento"}</h2></div><button onClick={onClose} aria-label="Cerrar"><X size={22} /></button></div>
        <div className="kind-selector">
          {([['expense','Gasto'],['income','Ingreso'],['saving','Ahorro']] as const).map(([value, label]) => <button key={value} className={kind === value ? "active" : ""} onClick={() => selectKind(value)} disabled={lockedForecast}>{label}</button>)}
        </div>
        <label className="amount-field"><span>Importe</span><div><input autoFocus inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0,00" /><b>€</b></div></label>
        <label className="field"><span>Concepto</span><input value={concept} onChange={(event) => setConcept(event.target.value)} placeholder={kind === "expense" ? "Ej. Supermercado" : kind === "income" ? "Ej. Nómina" : "Ej. Fondo de emergencia"} /></label>
        <div className="field-pair">
          <label className="field"><span>Fecha</span><input type="date" value={date} onChange={(event) => { setDate(event.target.value); setForecastId(""); }} disabled={lockedForecast} /></label>
          <label className="field"><span>Categoría</span><select value={categoryId} onChange={(event) => setCategoryId(event.target.value)}>{availableCategories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
        </div>
        <label className="toggle-row"><span><strong>Es una previsión</strong><small>Aún no se ha producido</small></span><input type="checkbox" checked={planned} onChange={(event) => { setPlanned(event.target.checked); if (event.target.checked) setForecastId(""); }} disabled={lockedForecast} /><i /></label>
        {kind === "expense" && movement === null && <label className="toggle-row funding-toggle"><span><strong>Ahorrar este gasto poco a poco</strong><small>Crea aportaciones mensuales antes de pagarlo</small></span><input type="checkbox" checked={fractionExpense} onChange={(event) => { setFractionExpense(event.target.checked); if (event.target.checked) { setPlanned(true); setForecastId(""); } }} /><i /></label>}
        {fractionExpense && movement === null && <div className="fraction-panel">
          <div className="fraction-heading"><span className="funding-goal-icon"><PiggyBank size={19} /></span><div><strong>Plan de ahorro para este gasto</strong><small>Las aportaciones terminan el mes anterior al pago.</small></div></div>
          <label className="field"><span>Número de mensualidades</span><input type="number" inputMode="numeric" min="2" max="120" value={installments} onChange={(event) => setInstallments(Math.max(2, Math.min(120, Number(event.target.value) || 2)))} /></label>
          <div className="fraction-summary"><span>Aportación aproximada<strong>{formatMoney(estimatedInstallmentCents)} al mes</strong></span><span>Primera aportación<strong>{monthLabel(firstContributionMonth, "short")}</strong></span></div>
        </div>}
        {isFundingTarget && <div className="funding-plan-note"><Target size={18} /><span>Este gasto está fraccionado en <strong>{movement?.fundingInstallments ?? 0} mensualidades</strong>. Las aportaciones asociadas aparecen como previsiones de ahorro.</span></div>}
        {!planned && availableForecasts.length > 0 && (
          <label className="field forecast-link-field">
            <span>{kind === "expense" ? "Restar de una previsión" : "Aplicar a una previsión"}</span>
            <select value={forecastId} onChange={(event) => setForecastId(event.target.value)}>
              <option value="">No aplicar a ninguna</option>
              {availableForecasts.map((item) => {
                const usage = forecastUsage(movements, item);
                return <option key={item.id} value={item.id}>{item.concept} · quedan {formatMoney(usage.remainingCents)}</option>;
              })}
            </select>
            <small>El importe real consumirá la previsión; si la supera, el exceso seguirá contando.</small>
          </label>
        )}
        <label className="field"><span>Nota <em>opcional</em></span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Añade un detalle si te ayuda" rows={2} /></label>
        {lockedForecast && <p className="forecast-lock-note">Esta previsión ya tiene {formatMoney(currentUsage?.appliedCents ?? 0)} aplicado. Puedes ajustar su importe, pero no convertirla ni moverla de mes.</p>}
        {error && <p className="form-error">{error}</p>}
        <button className="primary-button full large" onClick={() => submit()}>{movement ? <Pencil size={18} /> : fractionExpense ? <PiggyBank size={18} /> : <Plus size={18} />}{movement ? "Guardar cambios" : fractionExpense ? `Crear plan de ${installments} meses` : "Añadir movimiento"}</button>
        {movement?.status === "planned" && <button className="secondary-button full convert-button" onClick={() => submit("confirmed")} disabled={lockedForecast}><Check size={17} /> Convertir en {kind === "expense" ? "gasto" : kind === "income" ? "ingreso" : "ahorro"} real</button>}
        {movement && (
          <div className="copy-section">
            <button className="secondary-button full copy-toggle" type="button" aria-expanded={copyOpen} onClick={() => setCopyOpen((open) => !open)}><Copy size={17} /> Copiar a otros meses</button>
            {copyOpen && (
              <div className="copy-panel">
                <div className="copy-panel-heading">
                  <div><strong>Elige los meses</strong><span>Puedes combinar meses de distintos años.</span></div>
                  <b>{copyMonths.length}</b>
                </div>
                <div className="copy-presets" aria-label="Atajos de repetición"><button type="button" onClick={useQuarterlySchedule}>Trimestral</button><button type="button" onClick={useAnnualSchedule}>Anual</button><button type="button" onClick={() => setCopyMonths([])} disabled={copyMonths.length === 0}>Limpiar</button></div>
                <div className="copy-calendar-heading"><button type="button" onClick={() => setCopyYear((year) => year - 1)} aria-label="Año anterior"><ArrowLeft size={17} /></button><strong>{copyYear}</strong><button type="button" onClick={() => setCopyYear((year) => year + 1)} aria-label="Año siguiente"><ArrowRight size={17} /></button></div>
                <div className="copy-month-grid">
                  {copyYearMonths.map((targetMonth) => <button key={targetMonth} type="button" className={copyMonths.includes(targetMonth) ? "selected" : ""} disabled={targetMonth === sourceMonth} aria-pressed={copyMonths.includes(targetMonth)} onClick={() => toggleCopyMonth(targetMonth)}>{monthLabel(targetMonth, "short")}</button>)}
                </div>
                {copyMonths.length > 0 && <div className="copy-selected-months">{copyMonths.map((targetMonth) => <button key={targetMonth} type="button" onClick={() => toggleCopyMonth(targetMonth)} aria-label={`Quitar ${monthLabel(targetMonth)}`}>{monthLabel(targetMonth, "short")} {targetMonth.slice(0, 4)} <X size={12} /></button>)}</div>}
                <p>Las copias se crearán como previsiones manteniendo el día y el importe. Después podrás modificar cada una por separado.</p>
                <button className="secondary-button full" type="button" onClick={createCopies} disabled={copyMonths.length === 0}><Copy size={17} />{copyMonths.length === 1 ? "Crear 1 previsión" : `Crear ${copyMonths.length} previsiones`}</button>
              </div>
            )}
          </div>
        )}
        {movement && <button className="delete-button" onClick={() => onDelete(movement.id)}><Trash2 size={17} /> Eliminar movimiento</button>}
      </section>
    </div>
  );
}

function CloseMonthSheet({ month, movements, existing, onClose, onSave }: {
  month: string;
  movements: Movement[];
  existing?: MonthlyClose;
  onClose: () => void;
  onSave: (close: MonthlyClose) => void;
}) {
  const snapshot = snapshotForMonth(movements, month);
  const [notes, setNotes] = useState(existing?.notes ?? "");
  return (
    <div className="sheet-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sheet close-sheet" role="dialog" aria-modal="true" aria-label="Cerrar mes">
        <div className="sheet-handle" />
        <div className="sheet-heading"><div><span className="eyebrow">Fotografía mensual</span><h2>{monthLabel(month)}</h2></div><button onClick={onClose} aria-label="Cerrar"><X size={22} /></button></div>
        <div className="close-summary"><div><span>Ingresos</span><strong>{formatMoney(snapshot.incomeCents)}</strong></div><div><span>Gastos</span><strong>{formatMoney(snapshot.expenseCents)}</strong></div><div><span>Ahorro</span><strong>{formatMoney(snapshot.savingCents)}</strong></div><div className="result"><span>Disponible</span><strong>{formatMoney(snapshot.resultCents)}</strong></div></div>
        <label className="field"><span>¿Cómo ha ido el mes?</span><textarea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Ej. Gasté más en ocio por las vacaciones, pero mantuve el objetivo de ahorro." /></label>
        <div className="snapshot-note"><ShieldCheck size={18} /><span>Se guardará este resumen para que puedas compararlo más adelante.</span></div>
        <button className="primary-button full large" onClick={() => onSave({ id: existing?.id ?? crypto.randomUUID(), month, closedAt: new Date().toISOString(), notes: notes.trim(), snapshot })}><Check size={18} />{existing ? "Actualizar cierre" : "Guardar y cerrar el mes"}</button>
      </section>
    </div>
  );
}

function LoadingState() {
  return <div className="loading-state"><div className="loading-logo"><AppLogo /></div><strong>Preparando tu balance…</strong></div>;
}
