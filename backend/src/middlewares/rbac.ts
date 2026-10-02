export const FIRM_ROLES = [
  "FIRM_OWNER",
  "PARTNER",
  "MANAGER",
  "STAFF",
  "ARTICLED_STUDENT",
  "CLIENT"
] as const;

export type FirmRole = typeof FIRM_ROLES[number];

// Based on Phase F05 Frontend Role & Permission Contract Status
export const ROLE_PERMISSIONS: Record<FirmRole, string[]> = {
  FIRM_OWNER: [
    "dashboard:read",
    "clients:read", "clients:write",
    "engagements:read", "engagements:create", "engagements:write",
    "working_papers:read", "working_papers:write", "working_papers:sign", "working_papers:archive",
    "tasks:read", "tasks:write",
    "timesheets:write", "timesheets:approve",
    "notifications:read",
    "reviews:read",
    "billing:read", "billing:write",
    "documents:read", "documents:write",
    "profile:read", "profile:write",
    "firm:admin",
    "people:read", "people:write",
    "attendance:read", "attendance:write",
    "performance:read", "performance:write",
    "payroll:read", "payroll:write",
    "calendar:read", "calendar:write",
    "reports:read", "portal:read", "portal:admin", "ai:use"
  ],
  PARTNER: [
    "dashboard:read",
    "clients:read", "clients:write",
    "engagements:read", "engagements:write",
    "working_papers:read", "working_papers:write", "working_papers:sign", "working_papers:archive",
    "tasks:read", "tasks:write",
    "timesheets:write", "timesheets:approve",
    "notifications:read",
    "reviews:read",
    "billing:read", "billing:write",
    "documents:read", "documents:write",
    "profile:read", "profile:write",
    "firm:admin",
    "people:read", "people:write",
    "attendance:read", "attendance:write",
    "performance:read", "performance:write",
    "payroll:read", "payroll:write",
    "calendar:read", "calendar:write",
    "reports:read", "portal:read", "portal:admin", "ai:use"
  ],
  MANAGER: [
    "dashboard:read",
    "clients:read",
    "engagements:read",
    "working_papers:read", "working_papers:write", "working_papers:archive",
    "tasks:read", "tasks:write",
    "timesheets:write", "timesheets:approve",
    "notifications:read",
    "reviews:read",
    "billing:read", "billing:write",
    "documents:read", "documents:write",
    "profile:read", "profile:write",
    "people:read", "attendance:read", "attendance:write",
    "performance:read", "payroll:read",
    "calendar:read", "calendar:write", "reports:read", "portal:read", "ai:use"
  ],
  STAFF: [
    "dashboard:read",
    "clients:read",
    "engagements:read",
    "working_papers:read", "working_papers:write",
    "tasks:read", "tasks:write",
    "timesheets:write",
    "notifications:read",
    "documents:read", "documents:write",
    "profile:read", "profile:write",
    "people:read", "attendance:read", "attendance:write",
    "performance:read", "payroll:read", "calendar:read", "ai:use"
  ],
  ARTICLED_STUDENT: [
    "dashboard:read",
    "engagements:read",
    "working_papers:read", "working_papers:write",
    "tasks:read",
    "timesheets:write",
    "notifications:read",
    "profile:read", "profile:write",
    "people:read", "attendance:read", "attendance:write",
    "performance:read", "payroll:read", "calendar:read", "ai:use"
  ],
  CLIENT: [
    "dashboard:read",
    "documents:read",
    "profile:read", "profile:write",
    "portal:read"
  ]
};

export const hasPermission = (role: FirmRole, permission: string): boolean => {
  return ROLE_PERMISSIONS[role]?.includes(permission) || false;
};
