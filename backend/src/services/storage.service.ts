import fs from "fs";
import path from "path";

// Local-development adapter used before a firm connects Google Drive.
// Production document storage must use the firm-owned DriveProvider contract.

const UPLOAD_DIR = path.join(__dirname, "../..", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function resolveFirmPath(firmId: number, storagePath: string): string {
  const firmRoot = path.resolve(UPLOAD_DIR, "firms", String(firmId));
  const absolutePath = path.resolve(UPLOAD_DIR, storagePath);
  if (absolutePath !== firmRoot && !absolutePath.startsWith(`${firmRoot}${path.sep}`)) {
    throw new Error("Storage path is outside the active firm boundary");
  }
  return absolutePath;
}

export const storageService = {
  /**
   * Upload file securely into tenant-isolated structure
   * Strategy: firms/{firmId}/{targetType}/{targetId}/{uuid}_{filename}
   */
  async uploadFile(firmId: number, file: Express.Multer.File, directoryPath: string): Promise<string> {
    const safeName = path.basename(file.originalname).replace(/[^A-Za-z0-9._-]/g, "_");
    const storagePath = path.join(directoryPath, `${Date.now()}_${safeName}`);
    const absolutePath = resolveFirmPath(firmId, storagePath);

    // Ensure nested directories exist
    const parsedPath = path.parse(absolutePath);
    if (!fs.existsSync(parsedPath.dir)) {
      fs.mkdirSync(parsedPath.dir, { recursive: true });
    }

    // Move file safely across devices
    fs.copyFileSync(file.path, absolutePath);
    fs.unlinkSync(file.path);

    return storagePath.replace(/\\/g, "/"); // Return clean storage key
  },

  async getFileStream(firmId: number, storagePath: string): Promise<fs.ReadStream | null> {
    const absolutePath = resolveFirmPath(firmId, storagePath);
    if (!fs.existsSync(absolutePath)) return null;
    return fs.createReadStream(absolutePath);
  },

  async deleteFile(firmId: number, storagePath: string): Promise<void> {
    const absolutePath = resolveFirmPath(firmId, storagePath);
    if (fs.existsSync(absolutePath)) {
      fs.unlinkSync(absolutePath);
    }
  }
};
