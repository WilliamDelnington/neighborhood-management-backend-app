import pdfMake from "pdfmake/build/pdfmake";
import pdfFonts from "pdfmake/build/vfs_fonts";

// pdfmake dong goi Roboto trong VFS, nhờ đó PDF render tiếng Việt giống nhau
// trên Windows phát triển và VPS Linux, không phụ thuộc font cài trên máy chủ.
(pdfMake as any).vfs = pdfFonts as any;

const FIELD_LABELS: Record<string, string> = {
    total: "Tổng số",
    count: "Số lượng",
    label: "Nhóm",
    status: "Trạng thái",
    type: "Loại",
    category: "Nhóm phản ánh",
    priority: "Mức ưu tiên",
    value: "Giá trị",
    householdCount: "Số hộ",
    citizenCount: "Số nhân khẩu",
    completed: "Hoàn thành",
    received: "Tiếp nhận",
    overdue: "Quá hạn",
    pending: "Chưa hoàn thành",
    verified: "Đã xác minh",
    forwarded: "Đã chuyển Phường",
    passed: "Đạt",
    failed: "Chưa đạt",
    open: "Đang xử lý",
    resolved: "Đã kết thúc",
    totalNeighborhoods: "Tổng số Tổ dân phố",
    taskKpis: "KPI nhiệm vụ",
    feedback: "Phản ánh",
    inspections: "Rà soát",
    groups: "Nhóm thống kê",
    kpis: "Danh sách KPI",
    code: "Mã KPI",
    name: "Tên KPI",
    unit: "Đơn vị",
    target: "Mục tiêu",
    targetMet: "Đạt mục tiêu",
    detail: "Chi tiết",
    acceptedReports: "Báo cáo đã được chấp nhận",
};

function fieldLabel(key: string) {
    if (FIELD_LABELS[key]) return FIELD_LABELS[key];
    return key
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/_/g, " ")
        .replace(/^./, value => value.toUpperCase());
}

function displayValue(value: unknown): string {
    if (value === null || value === undefined) return "-";
    if (value instanceof Date) return value.toLocaleString("vi-VN");
    if (typeof value === "boolean") return value ? "Có" : "Không";
    if (typeof value === "number") return value.toLocaleString("vi-VN");
    if (typeof value === "string") {
        const date = /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(value) : null;
        return date && !Number.isNaN(date.getTime())
            ? date.toLocaleString("vi-VN")
            : value;
    }
    return JSON.stringify(value);
}

function objectTable(value: Record<string, unknown>) {
    return {
        table: {
            widths: ["45%", "55%"],
            body: Object.entries(value)
                .filter(([, child]) => !child || typeof child !== "object")
                .map(([key, child]) => [
                    { text: fieldLabel(key), style: "tableHeader" },
                    { text: displayValue(child) },
                ]),
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 12],
    };
}

function arrayTable(rows: unknown[]) {
    const objects = rows.filter(
        row => row && typeof row === "object" && !Array.isArray(row),
    ) as Record<string, unknown>[];
    if (objects.length === 0) {
        return { text: rows.map(displayValue).join(", ") || "Không có dữ liệu", margin: [0, 0, 0, 10] };
    }
    const keys = Array.from(
        new Set(objects.flatMap(row => Object.keys(row))),
    ).filter(key => objects.some(row => !row[key] || typeof row[key] !== "object"));
    return {
        table: {
            headerRows: 1,
            widths: keys.map(() => "*"),
            body: [
                keys.map(key => ({ text: fieldLabel(key), style: "tableHeader" })),
                ...objects.map(row => keys.map(key => ({ text: displayValue(row[key]), fontSize: 8 }))),
            ],
        },
        layout: "lightHorizontalLines",
        margin: [0, 0, 0, 12],
    };
}

function reportDataContent(data: Record<string, unknown>): any[] {
    const summaryEntries = Object.entries(data).filter(
        ([, value]) => !value || typeof value !== "object",
    );
    const content: any[] = [];
    if (summaryEntries.length > 0) {
        content.push({ text: "Tổng quan", style: "sectionHeader" });
        content.push(objectTable(Object.fromEntries(summaryEntries)));
    }
    for (const [key, value] of Object.entries(data)) {
        if (!value || typeof value !== "object") continue;
        content.push({ text: fieldLabel(key), style: "sectionHeader" });
        if (Array.isArray(value)) content.push(arrayTable(value));
        else {
            const record = value as Record<string, unknown>;
            content.push(objectTable(record));
            content.push(
                ...reportDataContent(
                    Object.fromEntries(
                        Object.entries(record).filter(
                            ([, child]) => child && typeof child === "object",
                        ),
                    ),
                ),
            );
        }
    }
    return content;
}

type PdfDocumentOptions = {
    title: string;
    subtitle?: string;
    metadata?: Array<{ label: string; value: unknown }>;
    content: any[];
};

export async function createPdfBuffer(options: PdfDocumentOptions): Promise<Buffer> {
    const definition: any = {
        pageSize: "A4",
        pageMargins: [42, 64, 42, 52],
        info: { title: options.title, creator: "Hệ thống Quản lý Tổ dân phố" },
        header: (currentPage: number) => ({
            columns: [
                { text: "QUẢN LÝ TỔ DÂN PHỐ", color: "#1d4ed8", bold: true },
                { text: `Trang ${currentPage}`, alignment: "right", color: "#64748b" },
            ],
            margin: [42, 24, 42, 0],
            fontSize: 8,
        }),
        footer: (currentPage: number, pageCount: number) => ({
            text: `Tài liệu được xuất từ hệ thống - ${currentPage}/${pageCount}`,
            alignment: "center",
            color: "#64748b",
            fontSize: 8,
            margin: [0, 14, 0, 0],
        }),
        content: [
            { text: options.title, style: "title" },
            ...(options.subtitle
                ? [{ text: options.subtitle, style: "subtitle" }]
                : []),
            ...(options.metadata?.length
                ? [
                      {
                          table: {
                              widths: [130, "*"],
                              body: options.metadata.map(row => [
                                  { text: row.label, style: "metaLabel" },
                                  { text: displayValue(row.value) },
                              ]),
                          },
                          layout: "noBorders",
                          margin: [0, 4, 0, 16],
                      },
                  ]
                : []),
            ...options.content,
        ],
        defaultStyle: { font: "Roboto", fontSize: 9, lineHeight: 1.2 },
        styles: {
            title: { fontSize: 18, bold: true, color: "#0f172a", margin: [0, 0, 0, 5] },
            subtitle: { fontSize: 10, color: "#475569", margin: [0, 0, 0, 10] },
            sectionHeader: { fontSize: 12, bold: true, color: "#1e3a8a", margin: [0, 12, 0, 6] },
            tableHeader: { bold: true, fillColor: "#eff6ff", color: "#1e3a8a" },
            metaLabel: { bold: true, color: "#475569" },
        },
    };
    const buffer = await (pdfMake as any).createPdf(definition).getBuffer();
    return Buffer.from(buffer);
}

export function createAnalyticsPdfBuffer(
    title: string,
    data: Record<string, unknown>,
    options: { fromDate?: Date; toDate?: Date } = {},
) {
    return createPdfBuffer({
        title,
        subtitle: "Báo cáo thống kê được tổng hợp tự động từ dữ liệu nghiệp vụ",
        metadata: [
            {
                label: "Từ ngày",
                value: options.fromDate?.toLocaleDateString("vi-VN") || "Toàn bộ",
            },
            {
                label: "Đến ngày",
                value: options.toDate?.toLocaleDateString("vi-VN") || "Hiện tại",
            },
            { label: "Thời điểm xuất", value: new Date() },
        ],
        content: reportDataContent(data),
    });
}

export function createPeriodicReportPdfBuffer(snapshot: any) {
    const neighborhood = snapshot.neighborhoodId;
    const author = snapshot.authorUserId;
    const recipient = snapshot.submittedToUserId;
    const sections = snapshot.sections || {};
    const summary = snapshot.autoSummary || {};
    const manualSections = [
        ["Tình hình chung", sections.generalSituation],
        ["Vấn đề nổi bật", sections.highlights],
        ["Kiến nghị", sections.recommendations],
        ["Đề xuất", sections.proposals],
    ];
    return createPdfBuffer({
        title: `BÁO CÁO TỔ DÂN PHỐ - PHIÊN BẢN ${snapshot.version}`,
        subtitle: "Bản chụp bất biến tại thời điểm nộp",
        metadata: [
            { label: "Tổ dân phố", value: neighborhood?.name || neighborhood?.code || neighborhood },
            { label: "Kỳ báo cáo", value: `${displayValue(snapshot.periodStart)} - ${displayValue(snapshot.periodEnd)}` },
            { label: "Người lập", value: author?.displayName || author },
            { label: "Nơi nhận", value: recipient?.displayName || recipient },
            { label: "Nộp lúc", value: snapshot.submittedAt },
        ],
        content: [
            { text: "Số liệu tự động", style: "sectionHeader" },
            ...reportDataContent(summary),
            ...manualSections.flatMap(([label, value]) => [
                { text: label, style: "sectionHeader" },
                { text: value || "Không có nội dung", margin: [0, 0, 0, 8] },
            ]),
            { text: "Tệp đính kèm tại thời điểm nộp", style: "sectionHeader" },
            ...(snapshot.attachments?.length
                ? snapshot.attachments.map((file: any, index: number) => ({
                      text: `${index + 1}. ${file.name}`,
                      margin: [0, 1, 0, 1],
                  }))
                : [{ text: "Không có tệp đính kèm" }]),
        ],
    });
}

export function pdfDownloadResponse(buffer: Buffer, filename: string) {
    return new Response(new Uint8Array(buffer), {
        status: 200,
        headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": String(buffer.length),
            "Cache-Control": "no-store",
        },
    });
}
