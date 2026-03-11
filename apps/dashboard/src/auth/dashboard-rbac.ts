export const DASHBOARD_ROLES = ["admin", "operator", "viewer"] as const;

export type DashboardRole = (typeof DASHBOARD_ROLES)[number];

export type DashboardPermissionSet = {
  manageUsers: boolean;
  manageBootstrap: boolean;
  resetPasswords: boolean;
  runComposer: boolean;
  manageTasks: boolean;
  viewLogs: boolean;
  viewSettings: boolean;
  useTelegramRun: boolean;
  useTelegramAdmin: boolean;
};

const ROLE_PERMISSIONS: Record<DashboardRole, DashboardPermissionSet> = {
  admin: {
    manageUsers: true,
    manageBootstrap: true,
    resetPasswords: true,
    runComposer: true,
    manageTasks: true,
    viewLogs: true,
    viewSettings: true,
    useTelegramRun: true,
    useTelegramAdmin: true,
  },
  operator: {
    manageUsers: false,
    manageBootstrap: false,
    resetPasswords: false,
    runComposer: true,
    manageTasks: true,
    viewLogs: true,
    viewSettings: true,
    useTelegramRun: true,
    useTelegramAdmin: false,
  },
  viewer: {
    manageUsers: false,
    manageBootstrap: false,
    resetPasswords: false,
    runComposer: false,
    manageTasks: false,
    viewLogs: true,
    viewSettings: true,
    useTelegramRun: false,
    useTelegramAdmin: false,
  },
};

export const normalizeDashboardRole = (role?: string | null): DashboardRole => {
  const normalized = String(role || "").trim().toLowerCase();
  return DASHBOARD_ROLES.includes(normalized as DashboardRole)
    ? (normalized as DashboardRole)
    : "viewer";
};

export const getDashboardPermissions = (role?: string | null): DashboardPermissionSet =>
  ROLE_PERMISSIONS[normalizeDashboardRole(role)];
