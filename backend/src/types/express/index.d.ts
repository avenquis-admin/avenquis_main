declare namespace Express {
  export interface Request {
    id: string;
    user?: {
      id: number;
      platformRole: "PLATFORM_SUPER_ADMIN" | "PLATFORM_OPERATOR" | "PLATFORM_AUDITOR" | null;
      mustChangePassword: boolean;
    };
    firm?: {
      id: number;
    };
    firmRole?: "FIRM_OWNER" | "PARTNER" | "MANAGER" | "STAFF" | "ARTICLED_STUDENT" | "CLIENT";
  }
}
