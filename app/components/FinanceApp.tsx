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
    return "Espera 60 segundos antes de solicitar otro cÃ³digo.";
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
        setCloud({ mode: "error", message: "No se pudo comprobar la sesiÃ³n" });
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
    notify(movement.createdAt === movement.updatedAt ? "Movimiento aÃ±adido" : "Movimiento actualizado");
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
    notify(copies.length === 1 ? "PrevisiÃ³n copiada a otro mes" : `${copies.length} previsiones creadas`);
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
      setCloud({ mode: "error", email, message: cloudErrorMessage(error, "No se pudo enviar el cÃ³digo") });
    }
  }

  async function handleCloudVerify(email: string, credential: string) {
    setCloud({ mode: "syncing", email });
    try {
      await verifyEmailAccess(email, credential);
    } catch (error) {
      setCloud({ mode: "codeSent", email, message: cloudErrorMessage(error, "El cÃ³digo no es vÃ¡lido") });
    }
  }

  async function handlePasswordAccess(email: string, password: string) {
    setCloud({ mode: "syncing", email });
    try {
      await signInWithPasswordAccess(email, password);
    } catch (error) {
      setCloud({ mode: "error", email, message: cloudErrorMessage(error, "Correo o contraseÃ±a incorrectos") });
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

        <nav className="bottom-nav" aria-label="NavegaciÃ³n principal">
          <NavButton active={tab === "home"} label="Inicio" icon={LayoutDashboard} onClick={() => setTab("home")} />
          <NavButton active={tab === "movements"} label="Movimientos" icon={ListChecks} onClick={() => setTab("movements")} />
          <button className="add-main" onClick={() => setEditingMovement(null)} aria-label="AÃ±adir movimiento">
            <Plus size={28} strokeWidth={2.3} />
          </button>
          <NavButton active={tab === "analysis"} label="AnÃ¡lisis" icon={BarChart3} onClick={() => setTab("analysis")} />
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
        {clos×­úâÚ$z{-®éÜj×6FVv÷,:Öâ"“°¢&WGW&ã°¢Ğ¢6öç7Bæ÷rÒæWrFFR‚’çFô•4õ7G&–ær‚“°¢6öç7B7FGW2Ò7FGW4÷fW'&–FRóò‡ÆææVBò'ÆææVB"¢&6öæf—&ÖVB"“°¢–b†g&7F–öäW‡Vç6RbbÖ÷fVÖVçBÓÓÒçVÆÂ’°¢7&VFTgVæF–æuÆâ†Ö÷VçD6VçG2“°¢&WGW&ã°¢Ğ¢öå6fR‡°¢–C¢Ö÷fVÖVçCòæ–Bóò7'—Fòç&æFöÕUT”B‚’À¢6öæ6WC¢6öæ6WBçG&–Ò‚’À¢Ö÷VçD6VçG2À¢FFRÀ¢6FVv÷'”–BÀ¢¶–æBÀ¢7FGW2À¢f÷&V67D–C¢7FGW2ÓÓÒ&6öæf—&ÖVB"bbf–Æ&ÆTf÷&V67G2ç6öÖR‚†—FVÒ’Óâ—FVÒæ–BÓÓÒf÷&V67D–B’òf÷&V67D–B¢VæFVf–æVBÀ¢gVæF–æuÆä–C¢Ö÷fVÖVçCòægVæF–æuÆä–BóòÆ–æ¶VDf÷&V67CòægVæF–æuÆä–BÀ¢gVæF–æu&öÆS¢Ö÷fVÖVçCòægVæF–æu&öÆRóò†Æ–æ¶VDf÷&V67CòægVæF–æu&öÆRÓÓÒ&6öçG&–'WF–öâ"ò&6öçG&–'WF–öâ"¢VæFVf–æVB’À¢gVæF–æt–ç7FÆÆÖVçG3¢Ö÷fVÖVçCòægVæF–æt–ç7FÆÆÖVçG2À¢æ÷FW3¢æ÷FW2çG&–Ò‚’À¢7&VFVDC¢Ö÷fVÖVçCòæ7&VFVDBóòæ÷rÀ¢WFFVDC¢Ö÷fVÖVçBòæ÷r¢æ÷rÀ¢Ò“°¢Ğ ¢gVæ7F–öâ7&VFTgVæF–æuÆâ†Ö÷VçD6VçG3¢çVÖ&W"’°¢–b†¶–æBÓÒ&W‡Vç6R"ÇÂÆææVBÇÂ–ç7FÆÆÖVçG2Â"ÇÂ–ç7FÆÆÖVçG2â#’°¢6WDW'&÷"‚$VÂv7Fòg&66–öæFòFV&R6W"Væ&Wf—6œ;6âF—f–F–FVçG&R"’#ÖW6W2â"“°¢&WGW&ã°¢Ğ¢6öç7B7W'&VçDÖöçF‚ÒÖöçF„¶W’†æWrFFR‚’“°¢–b†f—'7D6öçG&–'WF–öäÖöçF‚Â7W'&VçDÖöçF‚’°¢6WDW'&÷"‚$æò†’7Vf–6–VçFW2ÖW6W2†7FÆfV6†FVÂv7Fòâ&VGV6RÆ2ÖVç7VÆ–FFW2ò×VWfRVÂv7FòVæfV6†÷7FW&–÷"â"“°¢&WGW&ã°¢Ğ¢6öç7BÆä–BÒ7'—Fòç&æFöÕUT”B‚“°¢6öç7Bæ÷rÒFFRææ÷r‚“°¢6öç7B&6TÖ÷VçBÒÖF‚æfÆö÷"†Ö÷VçD6VçG2ò–ç7FÆÆÖVçG2“°¢6öç7B&VÖ–æFW"ÒÖ÷VçD6VçG2Ò&6TÖ÷VçB¢–ç7FÆÆÖVçG3°¢6öç7BF&vWC¢Ö÷fVÖVçBÒ°¢–C¢7'—Fòç&æFöÕUT”B‚’Â6öæ6WC¢6öæ6WBçG&–Ò‚’ÂÖ÷VçD6VçG2ÂFFRÂ6FVv÷'”–BÂ¶–æC¢&W‡Vç6R"Â7FGW3¢'ÆææVB"À¢gVæF–æuÆä–C¢Æä–BÂgVæF–æu&öÆS¢'F&vWB"ÂgVæF–æt–ç7FÆÆÖVçG3¢–ç7FÆÆÖVçG2Âæ÷FW3¢æ÷FW2çG&–Ò‚’À¢7&VFVDC¢æWrFFR†æ÷r’çFô•4õ7G&–ær‚’ÂWFFVDC¢æWrFFR†æ÷r’çFô•4õ7G&–ær‚’À¢Ó°¢6öç7B6f–æt6FVv÷'”–BÒ6FVv÷&–W2æf–æB‚†6FVv÷'’’Óâ6FVv÷'’æ–BÓÓÒ&vöÇ2"“òæ–@¢óò6FVv÷&–W2æf–æB‚†6FVv÷'’’Óâ6FVv÷'’æ¶–æBÓÓÒ'6f–ær"“òæ–Bóò&vöÇ2#°¢6öç7B6öçG&–'WF–öç2Ò'&’æg&öÒ‡²ÆVæwFƒ¢–ç7FÆÆÖVçG2ÒÂ…òÂ–æFW‚“¢Ö÷fVÖVçBÓâ°¢6öç7B6öçG&–'WF–öäÖöçF‚ÒÖ÷fTÖöçF‚†FFRç6Æ–6RƒÂr’ÂÒ†–ç7FÆÆÖVçG2Ò–æFW‚’“°¢6öç7BF–ÖW7F×ÒæWrFFR†æ÷r²–æFW‚²’çFô•4õ7G&–ær‚“°¢&WGW&â°¢–C¢7'—Fòç&æFöÕUT”B‚’À¢6öæ6WC¢†÷'&ò&G¶6öæ6WBçG&–Ò‚—ÖÀ¢Ö÷VçD6VçG3¢&6TÖ÷VçB²†–æFW‚Â&VÖ–æFW"ò¢’À¢FFS¢FFTf÷$ÖöçF‚†FFRÂ6öçG&–'WF–öäÖöçF‚’À¢6FVv÷'”–C¢6f–æt6FVv÷'”–BÀ¢¶–æC¢'6f–ær"À¢7FGW3¢'ÆææVB"À¢gVæF–æuÆä–C¢Æä–BÀ¢gVæF–æu&öÆS¢&6öçG&–'WF–öâ"À¢æ÷FW3¢÷'F6œ;6âG¶–æFW‚²ÒFRG¶–ç7FÆÆÖVçG7Ò&G¶6öæ6WBçG&–Ò‚—ÖÀ¢7&VFVDC¢F–ÖW7F×À¢WFFVDC¢F–ÖW7F×À¢Ó°¢Ò“°¢öä7&VFTgVæF–æuÆâ…·F&vWBÂââæ6öçG&–'WF–öç5Ò“°¢Ğ ¢gVæ7F–öâ7&VFT6÷–W2‚’°¢6öç7BÖ÷VçD6VçG2Ò'6TÖ÷VçB†Ö÷VçB“°¢6öç7BF&vWDÖöçF‡2Ò6÷”ÖöçF‡2æf–ÇFW"‚‡F&vWDÖöçF‚’ÓâF&vWDÖöçF‚ÓÒ6÷W&6TÖöçF‚“°¢–b‚Ö÷fVÖVçBÇÂ6öæ6WBçG&–Ò‚’ÇÂÖ÷VçD6VçG2ÃÒÇÂFFRÇÂ6FVv÷'”–B’°¢6WDW'&÷"‚$6ö×ÆWFVÂ–×÷'FRÂVÂ6öæ6WFòÂÆfV6†’Æ6FVv÷,:ÖçFW2FR6÷–"â"“°¢&WGW&ã°¢Ğ¢–b‡F&vWDÖöçF‡2æÆVæwF‚ÓÓÒ’°¢6WDW'&÷"‚%6VÆV66–öæÂÖVæ÷2VâÖW2&7&V"Æ6÷–â"“°¢&WGW&ã°¢Ğ¢6öç7B6÷–W2ÒF&vWDÖöçF‡2ç6÷'B‚’æÖ‚‡F&vWDÖöçF‚Â–æFW‚’Óâ°¢6öç7BF–ÖW7F×ÒæWrFFR„FFRææ÷r‚’²–æFW‚’çFô•4õ7G&–ær‚“°¢&WGW&â°¢–C¢7'—Fòç&æFöÕUT”B‚’À¢6öæ6WC¢6öæ6WBçG&–Ò‚’À¢Ö÷VçD6VçG2À¢FFS¢FFTf÷$ÖöçF‚†FFRÂF&vWDÖöçF‚’À¢6FVv÷'”–BÀ¢¶–æBÀ¢7FGW3¢'ÆææVB"26öç7BÀ¢æ÷FW3¢æ÷FW2çG&–Ò‚’À¢7&VFVDC¢F–ÖW7F×À¢WFFVDC¢F–ÖW7F×À¢Ó°¢Ò“°¢öä6÷’†6÷–W2“°¢Ğ ¢gVæ7F–öâFövvÆT6÷”ÖöçF‚‡F&vWDÖöçFƒ¢7G&–ær’°¢–b‡F&vWDÖöçF‚ÓÓÒ6÷W&6TÖöçF‚’&WGW&ã°¢6WDW'&÷"‚""“°¢6WD6÷”ÖöçF‡2‚‡6VÆV7FVB’Óâ6VÆV7FVBæ–æ6ÇVFW2‡F&vWDÖöçF‚’ò6VÆV7FVBæf–ÇFW"‚†ÖöçF‚’ÓâÖöçF‚ÓÒF&vWDÖöçF‚’¢²ââç6VÆV7FVBÂF&vWDÖöçF…Òç6÷'B‚’“°¢Ğ ¢gVæ7F–öâW6UV'FW&Ç•66†VGVÆR‚’°¢6öç7BÖöçF‡2Ò'&’æg&öÒ‡²ÆVæwFƒ¢BÒÂ…òÂ–æFW‚’ÓâÖ÷fTÖöçF‚‡6÷W&6TÖöçF‚Â†–æFW‚²’¢2’“°¢6WD6÷”ÖöçF‡2†ÖöçF‡2“°¢6WD6÷•–V"„çVÖ&W"†ÖöçF‡5³Òç6Æ–6RƒÂB’’“°¢6WDW'&÷"‚""“°¢Ğ ¢gVæ7F–öâW6TæçVÅ66†VGVÆR‚’°¢6öç7BF&vWDÖöçF‚ÒÖ÷fTÖöçF‚‡6÷W&6TÖöçF‚Â"“°¢6WD6÷”ÖöçF‡2…·F&vWDÖöçF…Ò“°¢6WD6÷•–V"„çVÖ&W"‡F&vWDÖöçF‚ç6Æ–6RƒÂB’’“°¢6WDW'&÷"‚""“°¢Ğ ¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'6†VWBÖ&6¶G&÷"&öÆSÒ'&W6VçFF–öâ"öäÖ÷W6TF÷vã×²†WfVçB’Óâ²–b†WfVçBçF&vWBÓÓÒWfVçBæ7W'&VçEF&vWB’öä6Æ÷6R‚“²×Óà¢Ç6V7F–öâ6Æ74æÖSÒ'6†VWB"&öÆSÒ&F–Æör"&–ÖÖöFÃÒ'G'VR"&–ÖÆ&VÃ×¶Ö÷fVÖVçBò$VF—F"Ö÷f–Ö–VçFò"¢$çVWfòÖ÷f–Ö–VçFò'Óà¢ÆF—b6Æ74æÖSÒ'6†VWBÖ†æFÆR"óà¢ÆF—b6Æ74æÖSÒ'6†VWBÖ†VF–ær#ãÆF—cãÇ7â6Æ74æÖSÒ&W–V'&÷r#ç¶Ö÷fVÖVçBò$VF—F""¢%&Vv—7G&òÖçVÂ'ÓÂ÷7ããÆƒ#ç¶Ö÷fVÖVçBò$Ö÷f–Ö–VçFò"¢$çVWfòÖ÷f–Ö–VçFò'ÓÂöƒ#ãÂöF—cãÆ'WGFöâöä6Æ–6³×¶öä6Æ÷6WÒ&–ÖÆ&VÃÒ$6W'&"#ãÅ‚6—¦S×³#'ÒóãÂö'WGFöããÂöF—cà¢ÆF—b6Æ74æÖSÒ&¶–æB×6VÆV7F÷"#à¢²…µ²vW‡Vç6RrÂtv7FòuÒÅ²v–æ6öÖRrÂt–æw&W6òuÒÅ²w6f–ærrÂt†÷'&òuÕÒ26öç7B’æÖ‚…·fÇVRÂÆ&VÅÒ’ÓâÆ'WGFöâ¶W“×·fÇVWÒ6Æ74æÖS×¶¶–æBÓÓÒfÇVRò&7F—fR"¢"'Òöä6Æ–6³×²‚’Óâ6VÆV7D¶–æB‡fÇVR—ÒF—6&ÆVC×¶Æö6¶VDf÷&V67GÓç¶Æ&VÇÓÂö'WGFöãâ—Ğ¢ÂöF—cà¢ÆÆ&VÂ6Æ74æÖSÒ&Ö÷VçBÖf–VÆB#ãÇ7ãä–×÷'FSÂ÷7ããÆF—cãÆ–çWBWFôfö7W2–çWDÖöFSÒ&FV6–ÖÂ"fÇVS×¶Ö÷VçGÒöä6†ævS×²†WfVçB’Óâ6WDÖ÷VçB†WfVçBçF&vWBçfÇVR—ÒÆ6V†öÆFW#Ò#Ã"óãÆ#î(*ÃÂö#ãÂöF—cãÂöÆ&VÃà¢ÆÆ&VÂ6Æ74æÖSÒ&f–VÆB#ãÇ7ãä6öæ6WFóÂ÷7ããÆ–çWBfÇVS×¶6öæ6WGÒöä6†ævS×²†WfVçB’Óâ6WD6öæ6WB†WfVçBçF&vWBçfÇVR—ÒÆ6V†öÆFW#×¶¶–æBÓÓÒ&W‡Vç6R"ò$V¢â7WW&ÖW&6Fò"¢¶–æBÓÓÒ&–æ6öÖR"ò$V¢âì;6Ö–æ"¢$V¢âföæFòFRVÖW&vVæ6–'ÒóãÂöÆ&VÃà¢ÆF—b6Æ74æÖSÒ&f–VÆB×—"#à¢ÆÆ&VÂ6Æ74æÖSÒ&f–VÆB#ãÇ7ãäfV6†Â÷7ããÆ–çWBG—SÒ&FFR"fÇVS×¶FFWÒöä6†ævS×²†WfVçB’Óâ²6WDFFR†WfVçBçF&vWBçfÇVR“²6WDf÷&V67D–B‚""“²×ÒF—6&ÆVC×¶Æö6¶VDf÷&V67GÒóãÂöÆ&VÃà¢ÆÆ&VÂ6Æ74æÖSÒ&f–VÆB#ãÇ7ãä6FVv÷,:ÖÂ÷7ããÇ6VÆV7BfÇVS×¶6FVv÷'”–GÒöä6†ævS×²†WfVçB’Óâ6WD6FVv÷'”–B†WfVçBçF&vWBçfÇVR—Óç¶f–Æ&ÆT6FVv÷&–W2æÖ‚†6FVv÷'’’ÓâÆ÷F–öâ¶W“×¶6FVv÷'’æ–GÒfÇVS×¶6FVv÷'’æ–GÓç¶6FVv÷'’ææÖWÓÂö÷F–öãâ—ÓÂ÷6VÆV7CãÂöÆ&VÃà¢ÂöF—cà¢ÆÆ&VÂ6Æ74æÖSÒ'FövvÆR×&÷r#ãÇ7ããÇ7G&öæsäW2Væ&Wf—6œ;6ãÂ÷7G&öæsãÇ6ÖÆÃä;¦âæò6R†&öGV6–FóÂ÷6ÖÆÃãÂ÷7ããÆ–çWBG—SÒ&6†V6¶&÷‚"6†V6¶VC×·ÆææVGÒöä6†ævS×²†WfVçB’Óâ²6WEÆææVB†WfVçBçF&vWBæ6†V6¶VB“²–b†WfVçBçF&vWBæ6†V6¶VB’6WDf÷&V67D–B‚""“²×ÒF—6&ÆVC×¶Æö6¶VDf÷&V67GÒóãÆ’óãÂöÆ&VÃà¢¶¶–æBÓÓÒ&W‡Vç6R"bbÖ÷fVÖVçBÓÓÒçVÆÂbbÆÆ&VÂ6Æ74æÖSÒ'FövvÆR×&÷rgVæF–ær×FövvÆR#ãÇ7ããÇ7G&öæsä†÷'&"W7FRv7Fòö6òö6óÂ÷7G&öæsãÇ6ÖÆÃä7&V÷'F6–öæW2ÖVç7VÆW2çFW2FRv&ÆóÂ÷6ÖÆÃãÂ÷7ããÆ–çWBG—SÒ&6†V6¶&÷‚"6†V6¶VC×¶g&7F–öäW‡Vç6WÒöä6†ævS×²†WfVçB’Óâ²6WDg&7F–öäW‡Vç6R†WfVçBçF&vWBæ6†V6¶VB“²–b†WfVçBçF&vWBæ6†V6¶VB’²6WEÆææVB‡G'VR“²6WDf÷&V67D–B‚""“²Ò×ÒóãÆ’óãÂöÆ&VÃçĞ¢¶g&7F–öäW‡Vç6RbbÖ÷fVÖVçBÓÓÒçVÆÂbbÆF—b6Æ74æÖSÒ&g&7F–öâ×æVÂ#à¢ÆF—b6Æ74æÖSÒ&g&7F–öâÖ†VF–ær#ãÇ7â6Æ74æÖSÒ&gVæF–ærÖvöÂÖ–6öâ#ãÅ–vw”&æ²6—¦S×³—ÒóãÂ÷7ããÆF—cãÇ7G&öæsåÆâFR†÷'&ò&W7FRv7FóÂ÷7G&öæsãÇ6ÖÆÃäÆ2÷'F6–öæW2FW&Ö–æâVÂÖW2çFW&–÷"ÂvòãÂ÷6ÖÆÃãÂöF—cãÂöF—cà¢ÆÆ&VÂ6Æ74æÖSÒ&f–VÆB#ãÇ7ãäì;¦ÖW&òFRÖVç7VÆ–FFW3Â÷7ããÆ–çWBG—SÒ&çVÖ&W""–çWDÖöFSÒ&çVÖW&–2"Ö–ãÒ#""ÖƒÒ##"fÇVS×¶–ç7FÆÆÖVçG7Òöä6†ævS×²†WfVçB’Óâ6WD–ç7FÆÆÖVçG2„ÖF‚æÖ‚ƒ"ÂÖF‚æÖ–âƒ#ÂçVÖ&W"†WfVçBçF&vWBçfÇVR’ÇÂ"’’—ÒóãÂöÆ&VÃà¢ÆF—b6Æ74æÖSÒ&g&7F–öâ×7VÖÖ'’#ãÇ7ãä÷'F6œ;6â&÷†–ÖFÇ7G&öæsç¶f÷&ÖDÖöæW’†W7F–ÖFVD–ç7FÆÆÖVçD6VçG2—ÒÂÖW3Â÷7G&öæsãÂ÷7ããÇ7ãå&–ÖW&÷'F6œ;6ãÇ7G&öæsç¶ÖöçF„Æ&VÂ†f—'7D6öçG&–'WF–öäÖöçF‚Â'6†÷'B"—ÓÂ÷7G&öæsãÂ÷7ããÂöF—cà¢ÂöF—cçĞ¢¶—4gVæF–æuF&vWBbbÆF—b6Æ74æÖSÒ&gVæF–ær×ÆâÖæ÷FR#ãÅF&vWB6—¦S×³‡ÒóãÇ7ãäW7FRv7FòW7L:g&66–öæFòVâÇ7G&öæsç¶Ö÷fVÖVçCòægVæF–æt–ç7FÆÆÖVçG2óòÒÖVç7VÆ–FFW3Â÷7G&öæsââÆ2÷'F6–öæW26ö6–F2&V6Vâ6öÖò&Wf—6–öæW2FR†÷'&òãÂ÷7ããÂöF—cçĞ¢²ÆææVBbbf–Æ&ÆTf÷&V67G2æÆVæwF‚âbb€¢ÆÆ&VÂ6Æ74æÖSÒ&f–VÆBf÷&V67BÖÆ–æ²Öf–VÆB#à¢Ç7ãç¶¶–æBÓÓÒ&W‡Vç6R"ò%&W7F"FRVæ&Wf—6œ;6â"¢$Æ–6"Væ&Wf—6œ;6â'ÓÂ÷7ãà¢Ç6VÆV7BfÇVS×¶f÷&V67D–GÒöä6†ævS×²†WfVçB’Óâ6WDf÷&V67D–B†WfVçBçF&vWBçfÇVR—Óà¢Æ÷F–öâfÇVSÒ"#äæòÆ–6"æ–æwVæÂö÷F–öãà¢¶f–Æ&ÆTf÷&V67G2æÖ‚†—FVÒ’Óâ°¢6öç7BW6vRÒf÷&V67EW6vR†Ö÷fVÖVçG2Â—FVÒ“°¢&WGW&âÆ÷F–öâ¶W“×¶—FVÒæ–GÒfÇVS×¶—FVÒæ–GÓç¶—FVÒæ6öæ6WGÒ+rVVFâ¶f÷&ÖDÖöæW’‡W6vRç&VÖ–æ–æt6VçG2—ÓÂö÷F–öãã°¢Ò—Ğ¢Â÷6VÆV7Cà¢Ç6ÖÆÃäVÂ–×÷'FR&VÂ6öç7VÖ—,:Æ&Wf—6œ;6ã²6’Æ7WW&ÂVÂW†6W6ò6VwV—,:6öçFæFòãÂ÷6ÖÆÃà¢ÂöÆ&VÃà¢—Ğ¢ÆÆ&VÂ6Æ74æÖSÒ&f–VÆB#ãÇ7ãäæ÷FÆVÓæ÷6–öæÃÂöVÓãÂ÷7ããÇFW‡F&VfÇVS×¶æ÷FW7Òöä6†ævS×²†WfVçB’Óâ6WDæ÷FW2†WfVçBçF&vWBçfÇVR—ÒÆ6V†öÆFW#Ò$;FRVâFWFÆÆR6’FR—VF"&÷w3×³'ÒóãÂöÆ&VÃà¢¶Æö6¶VDf÷&V67BbbÇ6Æ74æÖSÒ&f÷&V67BÖÆö6²Öæ÷FR#äW7F&Wf—6œ;6â–F–VæR¶f÷&ÖDÖöæW’†7W'&VçEW6vSòæÆ–VD6VçG2óò—ÒÆ–6FòâVVFW2§W7F"7R–×÷'FRÂW&òæò6öçfW'F—&Ææ’Ö÷fW&ÆFRÖW2ãÂ÷çĞ¢¶W'&÷"bbÇ6Æ74æÖSÒ&f÷&ÒÖW'&÷"#ç¶W'&÷'ÓÂ÷çĞ¢Æ'WGFöâ6Æ74æÖSÒ'&–Ö'’Ö'WGFöâgVÆÂÆ&vR"öä6Æ–6³×²‚’Óâ7V&Ö—B‚—Óç¶Ö÷fVÖVçBòÅVæ6–Â6—¦S×³‡Òóâ¢g&7F–öäW‡Vç6RòÅ–vw”&æ²6—¦S×³‡Òóâ¢ÅÇW26—¦S×³‡Òóç×¶Ö÷fVÖVçBò$wV&F"6Ö&–÷2"¢g&7F–öäW‡Vç6Rò7&V"ÆâFRG¶–ç7FÆÆÖVçG7ÒÖW6W6¢$;F—"Ö÷f–Ö–VçFò'ÓÂö'WGFöãà¢¶Ö÷fVÖVçCòç7FGW2ÓÓÒ'ÆææVB"bbÆ'WGFöâ6Æ74æÖSÒ'6V6öæF'’Ö'WGFöâgVÆÂ6öçfW'BÖ'WGFöâ"öä6Æ–6³×²‚’Óâ7V&Ö—B‚&6öæf—&ÖVB"—ÒF—6&ÆVC×¶Æö6¶VDf÷&V67GÓãÄ6†V6²6—¦S×³wÒóâ6öçfW'F—"Vâ¶¶–æBÓÓÒ&W‡Vç6R"ò&v7Fò"¢¶–æBÓÓÒ&–æ6öÖR"ò&–æw&W6ò"¢&†÷'&ò'Ò&VÃÂö'WGFöãçĞ¢¶Ö÷fVÖVçBbb€¢ÆF—b6Æ74æÖSÒ&6÷’×6V7F–öâ#à¢Æ'WGFöâ6Æ74æÖSÒ'6V6öæF'’Ö'WGFöâgVÆÂ6÷’×FövvÆR"G—SÒ&'WGFöâ"&–ÖW‡æFVC×¶6÷”÷VçÒöä6Æ–6³×²‚’Óâ6WD6÷”÷Vâ‚†÷Vâ’Óâ÷Vâ—ÓãÄ6÷’6—¦S×³wÒóâ6÷–"÷G&÷2ÖW6W3Âö'WGFöãà¢¶6÷”÷Vâbb€¢ÆF—b6Æ74æÖSÒ&6÷’×æVÂ#à¢ÆF—b6Æ74æÖSÒ&6÷’×æVÂÖ†VF–ær#à¢ÆF—cãÇ7G&öæsäVÆ–vRÆ÷2ÖW6W3Â÷7G&öæsãÇ7ãåVVFW26öÖ&–æ"ÖW6W2FRF—7F–çF÷2;÷2ãÂ÷7ããÂöF—cà¢Æ#ç¶6÷”ÖöçF‡2æÆVæwF‡ÓÂö#à¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&6÷’×&W6WG2"&–ÖÆ&VÃÒ$F¦÷2FR&WWF–6œ;6â#ãÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×·W6UV'FW&Ç•66†VGVÆWÓåG&–ÖW7G&ÃÂö'WGFöããÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×·W6TæçVÅ66†VGVÆWÓäçVÃÂö'WGFöããÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚’Óâ6WD6÷”ÖöçF‡2…µÒ—ÒF—6&ÆVC×¶6÷”ÖöçF‡2æÆVæwF‚ÓÓÒÓäÆ–×–#Âö'WGFöããÂöF—cà¢ÆF—b6Æ74æÖSÒ&6÷’Ö6ÆVæF"Ö†VF–ær#ãÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚’Óâ6WD6÷•–V"‚‡–V"’Óâ–V"Ò—Ò&–ÖÆ&VÃÒ$;òçFW&–÷"#ãÄ'&÷tÆVgB6—¦S×³wÒóãÂö'WGFöããÇ7G&öæsç¶6÷•–V'ÓÂ÷7G&öæsãÆ'WGFöâG—SÒ&'WGFöâ"öä6Æ–6³×²‚’Óâ6WD6÷•–V"‚‡–V"’Óâ–V"²—Ò&–ÖÆ&VÃÒ$;ò6–wV–VçFR#ãÄ'&÷u&–v‡B6—¦S×³wÒóãÂö'WGFöããÂöF—cà¢ÆF—b6Æ74æÖSÒ&6÷’ÖÖöçF‚Öw&–B#à¢¶6÷•–V$ÖöçF‡2æÖ‚‡F&vWDÖöçF‚’ÓâÆ'WGFöâ¶W“×·F&vWDÖöçF‡ÒG—SÒ&'WGFöâ"6Æ74æÖS×¶6÷”ÖöçF‡2æ–æ6ÇVFW2‡F&vWDÖöçF‚’ò'6VÆV7FVB"¢"'ÒF—6&ÆVC×·F&vWDÖöçF‚ÓÓÒ6÷W&6TÖöçF‡Ò&–×&W76VC×¶6÷”ÖöçF‡2æ–æ6ÇVFW2‡F&vWDÖöçF‚—Òöä6Æ–6³×²‚’ÓâFövvÆT6÷”ÖöçF‚‡F&vWDÖöçF‚—Óç¶ÖöçF„Æ&VÂ‡F&vWDÖöçF‚Â'6†÷'B"—ÓÂö'WGFöãâ—Ğ¢ÂöF—cà¢¶6÷”ÖöçF‡2æÆVæwF‚âbbÆF—b6Æ74æÖSÒ&6÷’×6VÆV7FVBÖÖöçF‡2#ç¶6÷”ÖöçF‡2æÖ‚‡F&vWDÖöçF‚’ÓâÆ'WGFöâ¶W“×·F&vWDÖöçF‡ÒG—SÒ&'WGFöâ"öä6Æ–6³×²‚’ÓâFövvÆT6÷”ÖöçF‚‡F&vWDÖöçF‚—Ò&–ÖÆ&VÃ×¶V—F"G¶ÖöçF„Æ&VÂ‡F&vWDÖöçF‚—ÖÓç¶ÖöçF„Æ&VÂ‡F&vWDÖöçF‚Â'6†÷'B"—Ò·F&vWDÖöçF‚ç6Æ–6RƒÂB—ÒÅ‚6—¦S×³'ÒóãÂö'WGFöãâ—ÓÂöF—cçĞ¢ÇäÆ26÷–26R7&V,:â6öÖò&Wf—6–öæW2ÖçFVæ–VæFòVÂL:Ö’VÂ–×÷'FRâFW7\:—2öG,:2ÖöF–f–6"6FVæ÷"6W&FòãÂ÷à¢Æ'WGFöâ6Æ74æÖSÒ'6V6öæF'’Ö'WGFöâgVÆÂ"G—SÒ&'WGFöâ"öä6Æ–6³×¶7&VFT6÷–W7ÒF—6&ÆVC×¶6÷”ÖöçF‡2æÆVæwF‚ÓÓÒÓãÄ6÷’6—¦S×³wÒóç¶6÷”ÖöçF‡2æÆVæwF‚ÓÓÒò$7&V"&Wf—6œ;6â"¢7&V"G¶6÷”ÖöçF‡2æÆVæwF‡Ò&Wf—6–öæW6ÓÂö'WGFöãà¢ÂöF—cà¢—Ğ¢ÂöF—cà¢—Ğ¢¶Ö÷fVÖVçBbbÆ'WGFöâ6Æ74æÖSÒ&FVÆWFRÖ'WGFöâ"öä6Æ–6³×²‚’ÓâöäFVÆWFR†Ö÷fVÖVçBæ–B—ÓãÅG&6ƒ"6—¦S×³wÒóâVÆ–Ö–æ"Ö÷f–Ö–VçFóÂö'WGFöãçĞ¢Â÷6V7F–öãà¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâ6Æ÷6TÖöçF…6†VWB‡²ÖöçF‚ÂÖ÷fVÖVçG2ÂW†—7F–ærÂöä6Æ÷6RÂöå6fRÓ¢°¢ÖöçFƒ¢7G&–æs°¢Ö÷fVÖVçG3¢Ö÷fVÖVçEµÓ°¢W†—7F–æsó¢ÖöçF†Ç”6Æ÷6S°¢öä6Æ÷6S¢‚’Óâfö–C°¢öå6fS¢†6Æ÷6S¢ÖöçF†Ç”6Æ÷6R’Óâfö–C°§Ò’°¢6öç7B6æ6†÷BÒ6æ6†÷Df÷$ÖöçF‚†Ö÷fVÖVçG2ÂÖöçF‚“°¢6öç7B¶æ÷FW2Â6WDæ÷FW5ÒÒW6U7FFR†W†—7F–æsòææ÷FW2óò""“°¢&WGW&â€¢ÆF—b6Æ74æÖSÒ'6†VWBÖ&6¶G&÷"&öÆSÒ'&W6VçFF–öâ"öäÖ÷W6TF÷vã×²†WfVçB’Óâ²–b†WfVçBçF&vWBÓÓÒWfVçBæ7W'&VçEF&vWB’öä6Æ÷6R‚“²×Óà¢Ç6V7F–öâ6Æ74æÖSÒ'6†VWB6Æ÷6R×6†VWB"&öÆSÒ&F–Æör"&–ÖÖöFÃÒ'G'VR"&–ÖÆ&VÃÒ$6W'&"ÖW2#à¢ÆF—b6Æ74æÖSÒ'6†VWBÖ†æFÆR"óà¢ÆF—b6Æ74æÖSÒ'6†VWBÖ†VF–ær#ãÆF—cãÇ7â6Æ74æÖSÒ&W–V'&÷r#äf÷Föw&l:ÖÖVç7VÃÂ÷7ããÆƒ#ç¶ÖöçF„Æ&VÂ†ÖöçF‚—ÓÂöƒ#ãÂöF—cãÆ'WGFöâöä6Æ–6³×¶öä6Æ÷6WÒ&–ÖÆ&VÃÒ$6W'&"#ãÅ‚6—¦S×³#'ÒóãÂö'WGFöããÂöF—cà¢ÆF—b6Æ74æÖSÒ&6Æ÷6R×7VÖÖ'’#ãÆF—cãÇ7ãä–æw&W6÷3Â÷7ããÇ7G&öæsç¶f÷&ÖDÖöæW’‡6æ6†÷Bæ–æ6öÖT6VçG2—ÓÂ÷7G&öæsãÂöF—cãÆF—cãÇ7ãäv7F÷3Â÷7ããÇ7G&öæsç¶f÷&ÖDÖöæW’‡6æ6†÷BæW‡Vç6T6VçG2—ÓÂ÷7G&öæsãÂöF—cãÆF—cãÇ7ãä†÷'&óÂ÷7ããÇ7G&öæsç¶f÷&ÖDÖöæW’‡6æ6†÷Bç6f–æt6VçG2—ÓÂ÷7G&öæsãÂöF—cãÆF—b6Æ74æÖSÒ'&W7VÇB#ãÇ7ãäF—7öæ–&ÆSÂ÷7ããÇ7G&öæsç¶f÷&ÖDÖöæW’‡6æ6†÷Bç&W7VÇD6VçG2—ÓÂ÷7G&öæsãÂöF—cãÂöF—cà¢ÆÆ&VÂ6Æ74æÖSÒ&f–VÆB#ãÇ7ãì+ô<;6Öò†–FòVÂÖW3óÂ÷7ããÇFW‡F&V&÷w3×³GÒfÇVS×¶æ÷FW7Òöä6†ævS×²†WfVçB’Óâ6WDæ÷FW2†WfVçBçF&vWBçfÇVR—ÒÆ6V†öÆFW#Ò$V¢âv7L:’Ü:2Vâö6–ò÷"Æ2f66–öæW2ÂW&òÖçGWfRVÂö&¦WF—fòFR†÷'&òâ"óãÂöÆ&VÃà¢ÆF—b6Æ74æÖSÒ'6æ6†÷BÖæ÷FR#ãÅ6†–VÆD6†V6²6—¦S×³‡ÒóãÇ7ãå6RwV&F,:W7FR&W7VÖVâ&VRVVF26ö×&&ÆòÜ:2FVÆçFRãÂ÷7ããÂöF—cà¢Æ'WGFöâ6Æ74æÖSÒ'&–Ö'’Ö'WGFöâgVÆÂÆ&vR"öä6Æ–6³×²‚’Óâöå6fR‡²–C¢W†—7F–æsòæ–Bóò7'—Fòç&æFöÕUT”B‚’ÂÖöçF‚Â6Æ÷6VDC¢æWrFFR‚’çFô•4õ7G&–ær‚’Âæ÷FW3¢æ÷FW2çG&–Ò‚’Â6æ6†÷BÒ—ÓãÄ6†V6²6—¦S×³‡Òóç¶W†—7F–ærò$7GVÆ—¦"6–W'&R"¢$wV&F"’6W'&"VÂÖW2'ÓÂö'WGFöãà¢Â÷6V7F–öãà¢ÂöF—cà¢“°§Ğ ¦gVæ7F–öâÆöF–æu7FFR‚’°¢&WGW&âÆF—b6Æ74æÖSÒ&ÆöF–ær×7FFR#ãÆF—b6Æ74æÖSÒ&ÆöF–ærÖÆövò#ãÄÆövòóãÂöF—cãÇ7G&öæså&W&æFòGR&Ææ6^(
cÂ÷7G&öæsãÂöF—cã°§Ğ