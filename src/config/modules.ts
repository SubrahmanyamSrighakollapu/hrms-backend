/**
 * Module + permission catalog.
 *
 * This is the single source of truth for what can be granted to a role.
 * The frontend mirrors the same list in `lib/rbac.ts`; keep them in sync.
 */

export const LEVELS = ['NONE', 'VIEW', 'MANAGE'] as const;
export type PermissionLevel = (typeof LEVELS)[number];

const RANK: Record<PermissionLevel, number> = { NONE: 0, VIEW: 1, MANAGE: 2 };

export interface ModuleDef {
  id: string;
  label: string;
  section: string;
  description: string;
}

export const MODULES: ModuleDef[] = [
  { id: 'dashboard', label: 'Dashboard', section: 'Overview', description: 'Workspace landing and widgets' },
  { id: 'my-info', label: 'My Info', section: 'Overview', description: 'Own profile and employment details' },
  { id: 'time-off', label: 'Time Off', section: 'Workplace', description: 'Leaves, permissions, regularization, extra hours' },
  { id: 'attendance', label: 'Attendance', section: 'Workplace', description: 'Punches and attendance records' },
  { id: 'payroll', label: 'Payroll', section: 'Workplace', description: 'Payslips and payroll runs' },
  { id: 'chat', label: 'Chat', section: 'Workplace', description: 'Team messaging' },
  { id: 'employees', label: 'Employees', section: 'Manage', description: 'Employee directory and records' },
  { id: 'reports', label: 'Reports', section: 'Manage', description: 'Analytics and exports' },
  { id: 'organization', label: 'Organization', section: 'Manage', description: 'Departments and hierarchy' },
  { id: 'roles', label: 'Roles & Permissions', section: 'Administration', description: 'Roles and module access' },
  { id: 'settings', label: 'Settings', section: 'Administration', description: 'Workspace configuration' },
];

export const MODULE_IDS = MODULES.map((m) => m.id);

/** A full module → level map with everything set to NONE. */
export function emptyPermissions(): Record<string, PermissionLevel> {
  return MODULE_IDS.reduce<Record<string, PermissionLevel>>((acc, id) => {
    acc[id] = 'NONE';
    return acc;
  }, {});
}

/** Every module set to the given level (defaults to MANAGE). */
export function grantAll(level: PermissionLevel = 'MANAGE'): Record<string, PermissionLevel> {
  return MODULE_IDS.reduce<Record<string, PermissionLevel>>((acc, id) => {
    acc[id] = level;
    return acc;
  }, {});
}

/** Convert stored permission rows into a complete module → level map. */
export function toPermissionMap(
  rows: { module: string; level: PermissionLevel }[],
): Record<string, PermissionLevel> {
  const map = emptyPermissions();
  for (const row of rows) {
    if (MODULE_IDS.includes(row.module)) {
      map[row.module] = row.level;
    }
  }
  return map;
}

/** True when `permissions` grants at least `level` on `moduleId`. */
export function hasPermission(
  permissions: Record<string, PermissionLevel> | undefined,
  moduleId: string,
  level: Exclude<PermissionLevel, 'NONE'> = 'VIEW',
): boolean {
  const current = permissions?.[moduleId] ?? 'NONE';
  return (RANK[current] ?? 0) >= RANK[level];
}

/** Drop NONE entries and unknown modules — what actually gets persisted. */
export function toPermissionRows(
  permissions: Record<string, PermissionLevel>,
): { module: string; level: PermissionLevel }[] {
  return MODULE_IDS.filter((id) => permissions[id] && permissions[id] !== 'NONE').map((id) => ({
    module: id,
    level: permissions[id],
  }));
}
