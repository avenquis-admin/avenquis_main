import { ApiError } from "../../middlewares/errorHandler";

export type FirmGoogleProvider = "GMAIL" | "DRIVE";

export interface FirmGoogleConnection {
  id: string;
  firmId: number;
  provider: FirmGoogleProvider;
  connectedAccountEmail: string;
  scopes: readonly string[];
  status: "CONNECTED" | "REVOKED" | "ERROR";
}

/** Internal encrypted-at-rest record. Never return this shape through normal APIs. */
export interface EncryptedFirmOAuthTokenRecord {
  connectionId: string;
  firmId: number;
  provider: FirmGoogleProvider;
  ciphertext: string;
  initializationVector: string;
  authenticationTag: string;
  keyVersion: string;
  expiresAt: Date | null;
}

export interface FirmGoogleConnectionRepository {
  findForFirm(firmId: number, provider: FirmGoogleProvider): Promise<FirmGoogleConnection | null>;
  findEncryptedTokenForFirm(firmId: number, connectionId: string): Promise<EncryptedFirmOAuthTokenRecord | null>;
}

export interface FirmGmailProvider {
  sendMessage(input: {
    firmId: number;
    connectionId: string;
    to: readonly string[];
    subject: string;
    textBody: string;
  }): Promise<{ providerMessageId: string }>;
}

export interface FirmDriveProvider {
  uploadFile(input: {
    firmId: number;
    connectionId: string;
    parentDriveFolderId: string | null;
    fileName: string;
    mimeType: string;
    content: NodeJS.ReadableStream;
  }): Promise<{ driveFileId: string; driveFolderId: string | null }>;

  openFile(input: { firmId: number; connectionId: string; driveFileId: string }): Promise<NodeJS.ReadableStream>;
}

export function assertFirmGoogleOwnership(requestFirmId: number, connection: Pick<FirmGoogleConnection, "firmId">): void {
  if (connection.firmId !== requestFirmId) {
    throw new ApiError(403, "GOOGLE_CONNECTION_TENANT_MISMATCH", "The Google connection does not belong to the active firm.");
  }
}

export async function requireFirmGoogleConnection(
  repository: FirmGoogleConnectionRepository,
  firmId: number,
  provider: FirmGoogleProvider,
): Promise<FirmGoogleConnection> {
  const connection = await repository.findForFirm(firmId, provider);
  if (!connection || connection.status !== "CONNECTED") {
    throw new ApiError(409, "FIRM_GOOGLE_CONNECTION_REQUIRED", `A connected firm ${provider.toLowerCase()} account is required.`);
  }
  assertFirmGoogleOwnership(firmId, connection);
  return connection;
}
