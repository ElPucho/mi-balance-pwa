import { openDB, type DBSchema } from "idb";
import type { AppData, AppSettings, Category, CloudAction, HomeWidgetId, MonthlyClose, Movement, OutboxItem } from "./types";

interface FinanceDB extends DBSchema {
  movements: { key: string; value: Movement };
  categories: { key: string; value: Category };
  closings: { key: string; value: MonthlyClose };
  settings: { key: string; value: AppSettings };
  outbox: { key: string; value: OutboxItem };
  meta: { key: string; value: { key: string; value: unknown } };
}

export const defaultHomeWidgets: HomeWidgetId[] = ["balance", "projection", "fundingGoals", "progress", "forecasts", "recent"];

export const defaultSettings: AppSettings = {
  displayName: "Usuario",
  monthlyBudgetCents: 0,
  monthlySavingGoalCents: 0,
  homeWidgets: defaultHomeWidgets,
  currency: "EUR",
  updatedAt: "1970-01-01T00:00:00.000Z",
};

export const defaultCategories: Category[] = [
  { id: "housing", name: "Vivienda", kind: "expense", color: "#5b6ee1", icon: "home", essential: true },
  { id: "food", name: "Alimentación", kind: "expense", color: "#f09d51", icon: "shopping", essential: true },
  { id: "transport", name: "Transporte", kind: "expense", color: "#3aa6a0", icon: "car", essential: true },
  { id: "car-expenses", name: "Coche", kind: "expense", color: "#277da1", icon: "car", essential: true },
  { id: "bills", name: "Recibos", kind: "expense", color: "#8b77d9", icon: "receipt", essential: true },
  { id: "health", name: "Salud", kind: "expense", color: "#e46f83", icon: "heart", essential: true },
  { id: "leisure", name: "Ocio", kind: "expense", color: "#ef6c67", icon: "sparkles" },
  { id: "shopping", name: "Compras", kind: "expense", color: "#c76c9a", icon: "bag" },
  { id: "gifts", name: "Regalos", kind: "expense", color: "#d0679f", icon: "gift" },
  { id: "financial-expenses", name: "Gastos financieros", kind: "expense", color: "#8a6f4d", icon: "landmark" },
  { id: "administrative-expenses", name: "Gastos administrativos", kind: "expense", color: "#6b7a8f", icon: "receipt" },
  { id: "other-expense", name: "Otros gastos", kind: "expense", color: "#8190a5", icon: "more" },
  { id: "salary", name: "Nómina", kind: "income", color: "#129775", icon: "wallet" },
  { id: "extra-income", name: "Ingresos extra", kind: "income", color: "#49a778", icon: "plus" },
  { id: "other-income", name: "Otros ingresos", kind: "income", color: "#6d9d82", icon: "coins" },
  { id: "emergency", name: "Fondo de emergencia", kind: "saving", color: "#2d7bdc", icon: "shield" },
  { id: "goals", name: "Objetivos", kind: "saving", color: "#0f9f78", icon: "target" },
  { id: "investment", name: "Inversión", kind: "saving", color: "#5977cf", icon: "chart" },
];

const DB_NAME = "control-gastos";
const SETTINGS_KEY = "main";
const LEGACY_SCOPE = "legacy";
let activeScope = LEGACY_SCOPE;

function scopedDatabaseName(scope = activeScope) {
  return scope === LEGACY_SCOPE ? DB_NAME : `${DB_NAME}:${scope}`;
}

function database(scope = activeScope) {
  return openDB<FinanceDB>(scopedDatabaseName(scope), 2, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("movements")) db.createObjectStore("movements", { keyPath: "id" });
      if (!db.objectStoreNames.contains("categories")) db.createObjectStore("categories", { keyPath: "id" });
      if (!db.objectStoreNames.contains("closings")) db.createObjectStore("closings", { keyPath: "id" });
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings");
      if (!db.objectStoreNames.contains("outbox")) db.createObjectStore("outbox", { keyPath: "id" });
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "key" });
    },
  });
}

async function ensureDefaults() {
  const db = await database();
  const existingCategoryIds = new Set(await db.getAllKeys("categories"));
  const missingCategories = defaultCategories.filter((category) => !existingCategoryIds.has(category.id));
  if (missingCategories.length > 0) {
    const tx = db.transaction("categories", "readwrite");
    await Promise.all([...missingCategories.map((category) => tx.store.put(category)), tx.done]);
  }
  const settings = await db.get("settings", SETTINGS_KEY);
  if (!settings) await db.put("settings", defaultSettings, SETTINGS_KEY);
  else if (!settings.homeWidgets) await db.put("settings", { ...settings, homeWidgets: defaultHomeWidgets }, SETTINGS_KEY);
}

export async function activateUserStorage(userId: string) {
  const nextScope = `user-${userId}`;
  activeScope = nextScope;
  const scoped = await database(nextScope);
  const imported = (await scoped.get("meta", "legacy-imported"))?.value === true;
  if (!imported) {
    const legacy = await database(LEGACY_SCOPE);
    const claimedBy = (await legacy.get("meta", "legacy-claimed-by"))?.value;
    const [scopedMovements, scopedClosings] = await Promise.all([scoped.count("movements"), scoped.count("closings")]);
    if (!claimedBy && scopedMovements === 0 && scopedClosings === 0) {
      const [movements, categories, closings, settings, outbox] = await Promise.all([
        legacy.getAll("movements"),
        legacy.getAll("categories"),
        legacy.getAll("closings"),
        legacy.get("settings", SETTINGS_KEY),
        legacy.getAll("outbox"),
      ]);
      if (movements.length > 0 || closings.length > 0 || outbox.length > 0) {
        const tx = scoped.transaction(["movements", "categories", "closings", "settings", "outbox"], "readwrite");
        for (const item of movements) await tx.objectStore("movements").put(item);
        for (const item of categories) await tx.objectStore("categories").put(item);
        for (const item of closings) await tx.objectStore("closings").put(item);
        for (const item of outbox) await tx.objectStore("outbox").put(item);
        if (settings) await tx.objectStore("settings").put(settings, SETTINGS_KEY);
        await tx.done;
        await legacy.put("meta", { key: "legacy-claimed-by", value: userId });
      }
    }
    await scoped.put("meta", { key: "legacy-imported", value: true });
  }
  await ensureDefaults();
}

export function deactivateUserStorage() {
  activeScope = "signed-out";
}

export async function loadAppData(): Promise<AppData> {
  await ensureDefaults();
  const db = await database();
  const [movements, categories, closings, settings] = await Promise.all([
    db.getAll("movements"),
    db.getAll("categories"),
    db.getAll("closings"),
    db.get("settings", SETTINGS_KEY),
  ]);
  return {
    movements: movements.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    categories,
    closings: closings.sort((a, b) => b.month.localeCompare(a.month)),
    settings: {
      ...(settings ?? defaultSettings),
      homeWidgets: settings?.homeWidgets ?? defaultHomeWidgets,
      updatedAt: settings?.updatedAt ?? defaultSettings.updatedAt,
    },
  };
}

export async function saveMovement(movement: Movement) {
  const db = await database();
  await db.put("movements", movement);
}

export async function removeMovement(id: string) {
  const db = await database();
  const tx = db.transaction("movements", "readwrite");
  const movements = await tx.store.getAll();
  const selected = movements.find((movement) => movement.id === id);
  const idsToDelete = selected?.fundingRole === "target" && selected.fundingPlanId
    ? movements.filter((movement) => movement.fundingPlanId === selected.fundingPlanId).map((movement) => movement.id)
    : [id];
  for (const movement of movements) {
    if (idsToDelete.includes(movement.forecastId ?? "")) await tx.store.put({ ...movement, forecastId: undefined, updatedAt: new Date().toISOString() });
  }
  for (const movementId of idsToDelete) await tx.store.delete(movementId);
  await tx.done;
  return idsToDelete;
}

export async function saveSettings(settings: AppSettings) {
  const db = await database();
  await db.put("settings", settings, SETTINGS_KEY);
}

export async function saveMonthlyClose(close: MonthlyClose) {
  const db = await database();
  await db.put("closings", close);
}

export async function removeMonthlyClose(id: string) {
  const db = await database();
  await db.delete("closings", id);
}

export async function removeSingleMovement(id: string) {
  const db = await database();
  const tx = db.transaction("movements", "readwrite");
  const movements = await tx.store.getAll();
  const unlinked: Movement[] = [];
  for (const movement of movements) {
    if (movement.forecastId === id) {
      const updated = { ...movement, forecastId: undefined, updatedAt: new Date().toISOString() };
      await tx.store.put(updated);
      unlinked.push(updated);
    }
  }
  await tx.store.delete(id);
  await tx.done;
  return unlinked;
}

export async function clearUserData() {
  const db = await database();
  const tx = db.transaction(["movements", "closings"], "readwrite");
  await Promise.all([tx.objectStore("movements").clear(), tx.objectStore("closings").clear(), tx.done]);
}

export async function queueCloudAction(action: CloudAction, payload: unknown) {
  const item: OutboxItem = {
    id: crypto.randomUUID(),
    action,
    payload,
    createdAt: new Date().toISOString(),
  };
  const db = await database();
  await db.put("outbox", item);
  return item.id;
}

export async function listCloudActions() {
  const db = await database();
  return (await db.getAll("outbox")).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function removeCloudAction(id: string) {
  const db = await database();
  await db.delete("outbox", id);
}

export async function getMetaValue<T>(key: string): Promise<T | undefined> {
  const db = await database();
  return (await db.get("meta", key))?.value as T | undefined;
}

export async function setMetaValue(key: string, value: unknown) {
  const db = await database();
  await db.put("meta", { key, value });
}

export async function replaceCachedData(data: Pick<AppData, "movements" | "closings" | "settings">) {
  const db = await database();
  const tx = db.transaction(["movements", "closings", "settings"], "readwrite");
  await tx.objectStore("movements").clear();
  await tx.objectStore("closings").clear();
  for (const movement of data.movements) await tx.objectStore("movements").put(movement);
  for (const close of data.closings) await tx.objectStore("closings").put(close);
  await tx.objectStore("settings").put(data.settings, SETTINGS_KEY);
  await tx.done;
}
