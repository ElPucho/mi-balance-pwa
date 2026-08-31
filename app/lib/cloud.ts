import { createClient, type AuthChangeEvent, type Session } from "@supabase/supabase-js";
import { defaultHomeWidgets, getMetaValue, listCloudActions, loadAppData, removeCloudAction, replaceCachedData, setMetaValue } from "./storage";
import type { AppData, AppSettings, CloudAction, MonthlyClose, Movement } from "./types";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const cloudConfigured = Boolean(supabaseUrl && supabaseKey);

const supabase = cloudConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

type RemoteData = {
  movements: Movement[];
  closings: MonthlyClose[];
  settings: AppSettings | null;
};

function requireClient() {
  if (!supabase) throw new Error("CLOUD_NOT_CONFIGURED");
  return supabase;
}

export async function getCloudSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export function watchCloudSession(callback: (session: Session | null, event: AuthChangeEvent) => void) {
  if (!supabase) return () => undefined;
  const { data } = supabase.auth.onAuthStateChange((event, session) => callback(session, event));
  return () => data.subscription.unsubscribe();
}

export async function sendEmailCode(email: string) {
  const client = requireClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: typeof window === "undefined" ? undefined : new URL(".", window.location.href).href,
      shouldCreateUser: false,
    },
  });
  if (error) throw error;
}

export async function signInWithPasswordAccess(email: string, password: string) {
  const client = requireClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error("No se pudo iniciar la sesión");
  return data.session;
}

export async function verifyEmailAccess(email: string, credential: string) {
  const client = requireClient();
  const value = credential.trim();
  const isCode = /^\d{6,10}$/.test(value);
  let result;

  if (isCode) {
    result = await client.auth.verifyOtp({ email, token: value, type: "email" });
  } else {
    let accessUrl: URL;
    try {
      accessUrl = new URL(value);
    } catch {
      throw new Error("Pega el enlace completo recibido por correo");
    }

    const tokenHash = accessUrl.searchParams.get("token") ?? accessUrl.searchParams.get("token_hash");
    const type = accessUrl.searchParams.get("type");
    if (!tokenHash || type !== "magiclink") {
      throw new Error("El enlace no es un acceso válido de Supabase");
    }
    result = await client.auth.verifyOtp({ token_hash: tokenHash, type: "magiclink" });
  }

  const { data, error } = result;
  if (error) throw error;
  if (!data.session) throw new Error("No se pudo iniciar la sesión");
  return data.session;
}

export async function disconnectCloud() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function sendAction(action: CloudAction, payload: unknown, userId: string) {
  const client = requireClient();
  if (action === "saveMovement") {
    const movement = payload as Movement;
    const { error } = await client.from("movements").upsert({
      id: movement.id,
      user_id: userId,
      concept: movement.concept,
      amount_cents: movement.amountCents,
      movement_date: movement.date,
      category_id: movement.categoryId,
      kind: movement.kind,
      status: movement.status,
      forecast_id: movement.forecastId ?? null,
      funding_plan_id: movement.fundingPlanId ?? null,
      funding_role: movement.fundingRole ?? null,
      funding_installments: movement.fundingInstallments ?? null,
      notes: movement.notes ?? "",
      created_at: movement.createdAt,
      updated_at: movement.updatedAt,
    });
    if (error) throw error;
    return;
  }

  if (action === "deleteMovement") {
    const { error } = await client.from("movements").delete().eq("id", (payload as { id: string }).id);
    if (error) throw error;
    return;
  }

  if (action === "saveSettings") {
    const settings = payload as AppSettings;
    const { error } = await client.from("profiles").upsert({
      id: userId,
      display_name: settings.displayName,
      monthly_budget_cents: settings.monthlyBudgetCents,
      monthly_saving_goal_cents: settings.monthlySavingGoalCents,
      home_widgets: settings.homeWidgets,
      updated_at: settings.updatedAt,
    });
    if (error) throw error;
    return;
  }

  if (action === "saveClosing") {
    const close = payload as MonthlyClose;
    const { error } = await client.from("monthly_closings").upsert(
      {
        id: close.id,
        user_id: userId,
        month: `${close.month}-01`,
        notes: close.notes,
        snapshot: close.snapshot,
        closed_at: close.closedAt,
      },
      { onConflict: "user_id,month" },
    );
    if (error) throw error;
    return;
  }

  if (action === "deleteClosing") {
    const { error } = await client.from("monthly_closings").delete().eq("id", (payload as { id: string }).id);
    if (error) throw error;
    return;
  }

  const [movements, closings] = await Promise.all([
    client.from("movements").delete().eq("user_id", userId),
    client.from("monthly_closings").delete().eq("user_id", userId),
  ]);
  if (movements.error) throw movements.error;
  if (closings.error) throw closings.error;
}

export async function flushCloudActions(session?: Session | null) {
  const activeSession = session ?? (await getCloudSession());
  if (!activeSession) throw new Error("CLOUD_NOT_SIGNED_IN");
  const actions = await listCloudActions();
  for (const item of actions) {
    await sendAction(item.action, item.payload, activeSession.user.id);
    await removeCloudAction(item.id);
  }
}

async function fetchRemoteData(userId: string): Promise<RemoteData> {
  const client = requireClient();
  const [profileResult, movementResult, closingResult] = await Promise.all([
    client.from("profiles").select("display_name, monthly_budget_cents, monthly_saving_goal_cents, home_widgets, updated_at").eq("id", userId).maybeSingle(),
    client.from("movements").select("id, concept, amount_cents, movement_date, category_id, kind, status, forecast_id, funding_plan_id, funding_role, funding_installments, notes, created_at, updated_at").order("movement_date", { ascending: false }),
    client.from("monthly_closings").select("id, month, notes, snapshot, closed_at").order("month", { ascending: false }),
  ]);
  if (profileResult.error) throw profileResult.error;
  if (movementResult.error) throw movementResult.error;
  if (closingResult.error) throw closingResult.error;

  return {
    settings: profileResult.data
      ? {
          displayName: profileResult.data.display_name,
          monthlyBudgetCents: profileResult.data.monthly_budget_cents,
          monthlySavingGoalCents: profileResult.data.monthly_saving_goal_cents,
          homeWidgets: profileResult.data.home_widgets ?? defaultHomeWidgets,
          currency: "EUR",
          updatedAt: profileResult.data.updated_at,
        }
      : null,
    movements: (movementResult.data ?? []).map((movement) => ({
      id: movement.id,
      concept: movement.concept,
      amountCents: movement.amount_cents,
      date: movement.movement_date,
      categoryId: movement.category_id,
      kind: movement.kind as Movement["kind"],
      status: movement.status as Movement["status"],
      forecastId: movement.forecast_id ?? undefined,
      fundingPlanId: movement.funding_plan_id ?? undefined,
      fundingRole: movement.funding_role ?? undefined,
      fundingInstallments: movement.funding_installments ?? undefined,
      notes: movement.notes,
      createdAt: movement.created_at,
      updatedAt: movement.updated_at,
    })),
    closings: (closingResult.data ?? []).map((close) => ({
      id: close.id,
      month: close.month.slice(0, 7),
      notes: close.notes,
      snapshot: close.snapshot as MonthlyClose["snapshot"],
      closedAt: close.closed_at,
    })),
  };
}

async function uploadFirstDeviceData(local: AppData, remote: RemoteData, session: Session) {
  const remoteMovements = new Map(remote.movements.map((movement) => [movement.id, movement]));
  const orderedMovements = [...local.movements].sort((a, b) => {
    if (a.status === b.status) return a.createdAt.localeCompare(b.createdAt);
    return a.status === "planned" ? -1 : 1;
  });
  for (const movement of orderedMovements) {
    const remoteMovement = remoteMovements.get(movement.id);
    if (!remoteMovement || movement.updatedAt > remoteMovement.updatedAt) await sendAction("saveMovement", movement, session.user.id);
  }

  const remoteClosings = new Map(remote.closings.map((close) => [close.month, close]));
  for (const close of local.closings) {
    const remoteClose = remoteClosings.get(close.month);
    if (!remoteClose || close.closedAt > remoteClose.closedAt) await sendAction("saveClosing", close, session.user.id);
  }

  if (!remote.settings || local.settings.updatedAt > remote.settings.updatedAt) {
    await sendAction("saveSettings", local.settings, session.user.id);
  }
}

export async function synchronizeCloud(localData?: AppData) {
  const session = await getCloudSession();
  if (!session) throw new Error("CLOUD_NOT_SIGNED_IN");
  await flushCloudActions(session);

  const local = localData ?? (await loadAppData());
  const migrationKey = `supabase_migrated:${session.user.id}`;
  const migrated = await getMetaValue<boolean>(migrationKey);
  let remote = await fetchRemoteData(session.user.id);

  if (!migrated) {
    await uploadFirstDeviceData(local, remote, session);
    await setMetaValue(migrationKey, true);
    remote = await fetchRemoteData(session.user.id);
  }

  await replaceCachedData({
    movements: remote.movements,
    closings: remote.closings,
    settings: remote.settings ?? local.settings,
  });
  return loadAppData();
}
