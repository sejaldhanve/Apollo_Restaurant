import type { AuthUser, OrgMembershipInfo } from "@apollo/shared-types";

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      user?: AuthUser;
      organizationId?: string;
      locationId?: string;
      currentMembership?: OrgMembershipInfo;
    }
  }
}

export {};
