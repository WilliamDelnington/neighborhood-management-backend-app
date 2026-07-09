import { HttpError } from "@/lib/response";

/**
 * Diem mo rong danh cho xuat bao cao PDF trong tuong lai.
 *
 * TODO: Xuat PDF chua duoc trien khai. Khi lam, can:
 *  1. Chon va cai dat mot thu vien render PDF phia server (vi du "pdfkit" cho layout
 *     don gian, hoac "puppeteer"/"@sparticuz/chromium" neu muon render tu HTML/CSS).
 *  2. Viet mot template rieng cho tung loai bao cao (population/complaints/pccc/
 *     security/finance) anh xa du lieu tra ve tu reportService sang layout PDF
 *     (tieu de, bang so lieu, footer ngay xuat/nguoi xuat).
 *  3. Noi ham nay vao route bang cach kiem tra query "?format=pdf" tuong tu
 *     "?format=excel" hien tai trong cac route src/app/api/reports/**\/route.ts,
 *     tra ve Response voi Content-Type: application/pdf.
 *  4. Ghi audit log "report.export" voi metadata.format = "pdf" giong nhu excel.
 *
 * Ham nay hien tai luon throw loi 501 va CHUA duoc goi o bat ky route nao -
 * no chi ton tai de tai lieu hoa chinh xac diem can mo rong sau nay.
 */
export function renderReportAsPdf(reportName: string, data: unknown): never {
    void reportName;
    void data;
    throw new HttpError(
        "Xuat PDF chua duoc trien khai - TODO: tich hop thu vien PDF (vi du pdfkit/puppeteer) va anh xa du lieu bao cao sang layout PDF",
        501,
    );
}
