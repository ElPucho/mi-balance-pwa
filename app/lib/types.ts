export type MovementKind = "expense" | "income" | "saving";
export type MovementStatus = "confirmed" | "planned";
export type FundingRole = "target" | "contribution";
export type HomeWidgetId =
  | "balance"
  | "projection"
  | "fundingGoals"
  | "progress"
  | "forecasts"
  | "recent"
  | "categoryChart"
  | "annualChart";

export type Movement = {
  id: string;
  concept: string;
  amountCents: number;
  date: string;
  categoryId: string;
  kind: MovementKind;
  status: MovementStatus;
  forecastId?: string;
  fundingPlanId?: string;
  fundingRole?: FundingRole;
  fundingInstallments?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type Category = {
  id: string;
  name: string;
  kind: MovementKind;
  color: string;
  icon: string;
  essential?: boolean;
};

export type MonthlySnapshot = {
  incomeCents: number;
  expenseCents: number;
  savingCents: number;
  resultCents: number;
  fundingUsedCents: number;
  movementCount: number;
};

export type MonthlyClose = {
  id: string;
  month: string;
  closedAt: string;
  notes: string;
  snapshot: MonthlySnapshot;
};

export type AppSettings = {
  displayName: string;
  monthlyBudgetCents: number;
  monthlySavingGoalCents: number;
  homeWidgets: HomeWidgetId[];
  currency: "EUR";
  updatedAt: string;
};

export type CloudAction =
  | "saveMovement"
  | "deleteMovement"
  | "saveSettings"
  | "saveClosing"
  | "clearData";

export type OutboxItem = {
  id: string;
  action: CloudAction;
  payload: unknown;
  createdAt: string;
};

export type CloudMode = "disabled" | "checking" | "signedOut" | "codeSent" | "syncing" | "synced" | "offline" | "error";

export type CloudState = {
  mode: CloudMode;
  email?: string;
  message?: string;
};

export type AppData = {
  movements: Movement[];
  categories: Category[];
  closings: MonthlyClose[];
  settings: AppSettings;
};
