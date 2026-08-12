import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

// Next.js chi coi cac file da co san trong public/ TAI THOI DIEM `next build`
// la static asset hop le (duoc ghi vao build manifest); file ghi vao
// public/uploads luc runtime (xem lib/localUpload.ts saveUploadedFile) khong
// nam trong manifest do nen bi 404 ngay ca khi ton tai thuc te tren dia - day
// la ly do url tra ve tu API tao file/dinh kem luon 404 tren moi truong da
// build (production/VPS), du upload "thanh cong" (ghi file + tao ban ghi DB
// deu khong loi). Route handler nay tu doc file truc tiep tu dia thay vi dua
// vao co che serve public/ mac dinh cua Next.

const UPLOADS_ROOT = path.join(process.cwd(), "public", "uploads");

const CONTENT_TYPES: Record<string, string> = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".xls": "application/vnd.ms-excel",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

export async function GET(
    _req: Request,
    { params }: { params: { path: string[] } },
) {
    const resolved = path.resolve(UPLOADS_ROOT, ...params.path);
    // Chan path traversal: duong dan sau khi resolve phai van nam trong UPLOADS_ROOT.
    if (!resolved.startsWith(path.resolve(UPLOADS_ROOT) + path.sep)) {
        return new NextResponse(null, { status: 404 });
    }

    let file: Buffer;
    try {
        file = await fs.readFile(resolved);
    } catch {
        return new NextResponse(null, { status: 404 });
    }

    const ext = path.extname(resolved).toLowerCase();
    return new NextResponse(new Uint8Array(file), {
        headers: {
            "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
            // Ten file da co timestamp+hash (xem saveUploadedFile) nen bat bien - an toan de cache dai han.
            "Cache-Control": "public, max-age=31536000, immutable",
        },
    });
}
