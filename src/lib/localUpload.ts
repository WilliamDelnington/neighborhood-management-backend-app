import { promises as fs } from "fs";
import path from "path";

// Luu file dinh kem truc tiep vao thu muc public/uploads tren may chay backend.
// Phu hop giai doan chay tren may local (yeu cau cua tinh nang) - khi can trien
// khai nhieu instance/production that su, thay the bang storage adapter
// (S3/GCS...) ma khong doi API cua saveUploadedFile/deleteUploadedFile.
const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

function sanitizeSegment(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function sanitizeFileName(name: string): string {
    // path.basename bo phan thu muc (chan "../..."); regex sau do chi giu ky
    // tu an toan de tranh ky tu dieu khien/duong dan tren cac he dieu hanh khac.
    const base = sanitizeSegment(path.basename(name));
    return base || "file";
}

export async function saveUploadedFile(
    buffer: Buffer,
    originalName: string,
    subDir: string,
): Promise<{ url: string }> {
    const safeSubDir = subDir
        .split("/")
        .map(sanitizeSegment)
        .filter(Boolean)
        .join("/");
    const dir = path.join(UPLOADS_ROOT, safeSubDir);
    await fs.mkdir(dir, { recursive: true });

    const fileName = `${Date.now()}-${sanitizeFileName(originalName)}`;
    await fs.writeFile(path.join(dir, fileName), buffer);

    return { url: `/uploads/${safeSubDir}/${fileName}` };
}

/**
 * Chuyen url tuong doi ("/uploads/...") ma saveUploadedFile tra ve thanh URL
 * day du dua tren origin cua request hien tai - can thiet vi cac component
 * hien thi tai lieu (AttachmentUploader, RequiredDocumentsPanel) mo url bang
 * window.open() thay vi qua request() (khong the dinh kem Authorization
 * header cho request tai file, va cung khong co goc URL nhu request() dung
 * BASE_URL), nen trinh duyet se phan giai url tuong doi theo goc cua trang
 * Mini App/web admin dang mo thay vi goc cua backend, dan den 404/403 tu phia
 * host sai. Bo qua neu url da la tuyet doi (vd du lieu cu da luu goc khac).
 */
export function toAbsoluteUploadUrl(url: string, origin: string): string {
    if (/^https?:\/\//i.test(url)) return url;
    return new URL(url, origin).toString();
}

export async function deleteUploadedFile(url: string): Promise<void> {
    if (!url.startsWith("/uploads/")) return;
    const fullPath = path.join(UPLOADS_ROOT, url.slice("/uploads/".length));
    // Chan path traversal: duong dan sau khi resolve phai van nam trong UPLOADS_ROOT.
    if (!path.resolve(fullPath).startsWith(path.resolve(UPLOADS_ROOT))) return;
    await fs.unlink(fullPath).catch(() => {});
}
