import type { PermissionLevel } from '../config/modules';

declare global {
  namespace Express {
    interface AuthUser {
      id: string;
      email: string;
      roleId: string | null;
      /** ADMIN | HR | EMPLOYEE for built-in roles, null for custom roles. */
      roleKey: string | null;
      /** Flattened module → level map of the assigned role. */
      permissions: Record<string, PermissionLevel>;
    }

    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
