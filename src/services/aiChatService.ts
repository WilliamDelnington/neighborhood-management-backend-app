import { Neighborhood, Role as RoleModel, type IUser } from "@/models";
import { HttpError } from "@/lib/response";
import { requirePermission } from "@/lib/rbac";
import { aiChatRateLimiter } from "@/lib/rateLimit";
import { writeAuditLog } from "@/services/auditService";
import { ROLE_LABEL } from "@/types";
import {
    generateContent,
    type GeminiContent,
    type GeminiFunctionDeclaration,
    type GeminiPart,
    type GeminiUsage,
} from "@/lib/integrations/gemini";
import { listHouseRecords } from "@/services/houseRecordService";
import { listHouseholds } from "@/services/householdService";
import { listCitizens } from "@/services/citizenService";
import { listBusinesses } from "@/services/businessService";
import { listCompanies } from "@/services/companyService";
import { listBusinessTypes } from "@/services/businessTypeService";
import { listCompanyTypes } from "@/services/companyTypeService";
import { listComplaintTypeDefinitions } from "@/services/complaintTypeDefinitionService";
import { listNeighborhoods } from "@/services/neighborhoodService";
import { getDashboardSummary } from "@/services/dashboardService";

/**
 * Chatbot AI (Gemini) phan quyen theo vai tro - xem plan
 * C:\Users\Admin\.claude\plans\typed-meandering-goose.md. Thiet ke cot loi:
 * MOI tool ben duoi chi la mot lop goi lai (wrapper) cac service list() da co
 * san, luon truyen actorUser vao service goc - khong tu viet lai logic loc
 * pham vi (scope) o day, vi cac service do da tu ap dung dung areaScopeFilter/
 * wardScopeFilter/neighborhoodScopeFilter/OWNED scope theo tung vai tro (xem
 * lib/rbac.ts). Stateless: KHONG luu lich su hoi thoai trong DB (theo yeu cau) -
 * frontend tu giu history va gui kem moi lan goi; chi ghi 1 dong AuditLog moi
 * luot hoi/dap de con truy vet duoc.
 */

export type AiChatHistoryItem = { role: "user" | "model"; text: string };

export type AiChatResult = {
    reply: string;
    toolsCalled: string[];
    usage?: GeminiUsage;
};

type ToolResult = Record<string, unknown>;

type ToolDef = {
    declaration: GeminiFunctionDeclaration;
    handler: (args: Record<string, unknown>, actorUser: IUser) => Promise<ToolResult>;
};

function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function strOrUndef(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

// Ep gioi han so ket qua tra ve cho Gemini (mac dinh VA toi da deu la
// `max`) - tranh cau tra loi bi "loang" vi qua nhieu du lieu, va giu chi phi
// token/Gemini API o muc thap bat ke tham so limit model tu goi la bao nhieu.
function capLimit(value: unknown, max = 5): number {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return max;
    return Math.min(Math.floor(n), max);
}

/**
 * Kiem tra quyen truoc khi thuc thi 1 tool, va bat moi loi (thieu quyen hoac
 * loi khac) thanh mot ket qua `{ error }` binh thuong thay vi throw - Gemini
 * function-calling can nhan duoc mot functionResponse de tiep tuc hoi thoai
 * (khong the "throw" giua chung ve phia model), model se tu dien giai loi nay
 * lai cho nguoi dung bang loi le tu nhien.
 */
async function guarded(
    actorUser: IUser,
    permission: string,
    run: () => Promise<ToolResult>,
): Promise<ToolResult> {
    try {
        await requirePermission(actorUser, permission);
    } catch {
        return { error: "Bạn không có quyền xem thông tin này." };
    }
    try {
        return await run();
    } catch (err) {
        if (err instanceof HttpError) return { error: err.message };
        console.error("Loi khi thuc thi AI tool:", err);
        return { error: "Không lấy được dữ liệu lúc này, vui lòng thử lại sau." };
    }
}

function defineTool(
    declaration: GeminiFunctionDeclaration,
    permission: string,
    run: (args: Record<string, unknown>, actorUser: IUser) => Promise<ToolResult>,
): ToolDef {
    return {
        declaration,
        handler: (args, actorUser) => guarded(actorUser, permission, () => run(args, actorUser)),
    };
}

const SEARCH_PARAMS_SCHEMA = {
    type: "OBJECT",
    properties: {
        search: { type: "STRING", description: "Từ khóa tìm kiếm (nếu có)" },
        neighborhoodId: {
            type: "STRING",
            description:
                "ID Tổ dân phố muốn lọc, nếu biết (lấy từ tool list_neighborhoods). Truyền vào để hỏi riêng về MỘT Tổ dân phố cụ thể - trường 'total' trong kết quả trả về khi đó là SỐ CHÍNH XÁC của riêng Tổ này (không bị giới hạn bởi limit), dùng để trả lời câu hỏi đếm/thống kê theo Tổ.",
        },
        limit: {
            type: "NUMBER",
            description:
                "Số bản ghi MẪU tối đa muốn xem chi tiết (mặc định và tối đa là 5) - KHÔNG ảnh hưởng đến trường 'total' (total luôn là số chính xác theo bộ lọc).",
        },
    },
};

const TOOLS: ToolDef[] = [
    defineTool(
        {
            name: "search_houses",
            description:
                "Tra cứu nhà số (mã nhà, địa chỉ, trạng thái xác minh) trong phạm vi dữ liệu được phân quyền. Dùng khi được hỏi về nhà số/địa chỉ.",
            parameters: SEARCH_PARAMS_SCHEMA,
        },
        "houses.read",
        async (args, actorUser) => {
            const result = await listHouseRecords({
                page: 1,
                limit: capLimit(args.limit),
                search: strOrUndef(args.search),
                neighborhoodId: strOrUndef(args.neighborhoodId),
                actorUser,
            });
            return {
                total: result.total,
                items: result.items.map(h => ({
                    code: h.code,
                    address: h.address,
                    cluster: h.cluster,
                    status: h.status,
                })),
            };
        },
    ),
    defineTool(
        {
            name: "search_households",
            description:
                "Tra cứu hộ dân (mã hộ, chủ hộ, địa chỉ, số nhân khẩu) trong phạm vi dữ liệu được phân quyền.",
            parameters: SEARCH_PARAMS_SCHEMA,
        },
        "households.read",
        async (args, actorUser) => {
            const result = await listHouseholds({
                page: 1,
                limit: capLimit(args.limit),
                search: strOrUndef(args.search),
                neighborhoodId: strOrUndef(args.neighborhoodId),
                actorUser,
            });
            return {
                total: result.total,
                items: result.items.map(h => ({
                    code: h.code,
                    headOfHousehold: h.headOfHousehold,
                    address: h.address,
                    memberCount: h.memberCount,
                    status: h.status,
                })),
            };
        },
    ),
    // Chi tra ve fullName/gender/birthDate/householdCode - KHONG bao gio dua
    // phone/cccd (du da giai ma san tren document, xem models/Citizen.ts) hay
    // diseaseStatus/diseaseName vao phan hoi cho Gemini, phong ho them ngoai
    // permission gate (du lieu nhay cam khong can thiet cho hoi thoai, tranh
    // troi vao log/nha cung cap AI ben thu ba).
    defineTool(
        {
            name: "search_citizens",
            description:
                "Tra cứu nhân khẩu (họ tên, giới tính, ngày sinh, hộ khẩu thuộc về) trong phạm vi dữ liệu được phân quyền. Không trả về số điện thoại/CCCD.",
            parameters: SEARCH_PARAMS_SCHEMA,
        },
        "citizens.read",
        async (args, actorUser) => {
            const result = await listCitizens({
                page: 1,
                limit: capLimit(args.limit),
                search: strOrUndef(args.search),
                neighborhoodId: strOrUndef(args.neighborhoodId),
                actorUser,
            });
            return {
                total: result.total,
                items: result.items.map(c => {
                    const household = c.householdId as unknown as
                        | { code?: string }
                        | undefined;
                    return {
                        fullName: c.fullName,
                        gender: c.gender,
                        birthDate: c.birthDate,
                        householdCode: household?.code,
                    };
                }),
            };
        },
    ),
    defineTool(
        {
            name: "search_businesses",
            description:
                "Tra cứu hộ kinh doanh (tên hộ KD, chủ hộ, loại hình kinh doanh, địa chỉ, trạng thái) trong phạm vi dữ liệu được phân quyền.",
            parameters: SEARCH_PARAMS_SCHEMA,
        },
        "businesses.read",
        async (args, actorUser) => {
            const result = await listBusinesses({
                page: 1,
                limit: capLimit(args.limit),
                search: strOrUndef(args.search),
                actorUser,
            });
            return {
                total: result.total,
                items: result.items.map(b => {
                    const businessType = b.businessType as unknown as
                        | { name?: string }
                        | undefined;
                    const house = b.houseId as unknown as
                        | { address?: string }
                        | undefined;
                    return {
                        name: b.name,
                        ownerName: b.ownerName,
                        businessType: businessType?.name,
                        address: house?.address,
                        status: b.status,
                    };
                }),
            };
        },
    ),
    defineTool(
        {
            name: "search_companies",
            description:
                "Tra cứu công ty/doanh nghiệp (tên, mã số thuế, loại hình, địa chỉ, trạng thái) trong phạm vi dữ liệu được phân quyền.",
            parameters: SEARCH_PARAMS_SCHEMA,
        },
        "companies.read",
        async (args, actorUser) => {
            const result = await listCompanies({
                page: 1,
                limit: capLimit(args.limit),
                search: strOrUndef(args.search),
                actorUser,
            });
            return {
                total: result.total,
                items: result.items.map(c => {
                    const companyType = c.companyTypeId as unknown as
                        | { name?: string }
                        | undefined;
                    const businessTypes = c.businessTypeIds as unknown as
                        | Array<{ name?: string }>
                        | undefined;
                    const house = c.houseId as unknown as
                        | { address?: string }
                        | undefined;
                    return {
                        name: c.name,
                        taxCode: c.taxCode,
                        companyType: companyType?.name,
                        businessTypes: (businessTypes || [])
                            .map(t => t?.name)
                            .filter(Boolean),
                        address: house?.address,
                        status: c.status,
                    };
                }),
            };
        },
    ),
    defineTool(
        {
            name: "list_business_types",
            description:
                "Liệt kê các loại hình kinh doanh (áp dụng cho hộ kinh doanh) đang hoạt động trong hệ thống.",
            parameters: {
                type: "OBJECT",
                properties: {
                    search: { type: "STRING", description: "Từ khóa tìm theo tên (nếu có)" },
                },
            },
        },
        "business_types.read",
        async args => {
            const result = await listBusinessTypes({
                page: 1,
                limit: 10,
                active: true,
                search: strOrUndef(args.search),
            });
            return {
                total: result.total,
                items: result.items.map(t => ({ name: t.name, description: t.description })),
            };
        },
    ),
    defineTool(
        {
            name: "list_company_types",
            description:
                "Liệt kê các loại hình doanh nghiệp (pháp lý, áp dụng cho công ty) đang hoạt động trong hệ thống.",
            parameters: {
                type: "OBJECT",
                properties: {
                    search: { type: "STRING", description: "Từ khóa tìm theo tên (nếu có)" },
                },
            },
        },
        "company_types.read",
        async args => {
            const result = await listCompanyTypes({
                page: 1,
                limit: 10,
                active: true,
                search: strOrUndef(args.search),
            });
            return {
                total: result.total,
                items: result.items.map(t => ({ name: t.name, description: t.description })),
            };
        },
    ),
    defineTool(
        {
            name: "get_complaint_types",
            description:
                "Liệt kê các loại phản ánh hợp lệ (kèm mô tả) mà người dân có thể gửi - dùng khi được hỏi cách/loại phản ánh mới.",
            parameters: {
                type: "OBJECT",
                properties: {
                    search: { type: "STRING", description: "Từ khóa tìm theo tên loại phản ánh (nếu có)" },
                },
            },
        },
        "complaint_types.read",
        async (args, actorUser) => {
            const result = await listComplaintTypeDefinitions({
                actorUser,
                active: true,
                limit: 10,
                search: strOrUndef(args.search),
            });
            return {
                total: result.total,
                items: result.items.map(d => ({ name: d.name, description: d.description })),
                huong_dan_chung:
                    "Để gửi phản ánh mới: vào mục Phản ánh trong ứng dụng, chọn loại phản ánh phù hợp, nhập tiêu đề/nội dung, có thể đính kèm ảnh và chọn nhà số liên quan (nếu có), rồi gửi đi. Hệ thống cấp một mã phản ánh để theo dõi tiến độ xử lý.",
            };
        },
    ),
    defineTool(
        {
            name: "list_neighborhoods",
            description:
                "Liệt kê các Tổ dân phố trong phạm vi dữ liệu được phân quyền (tên, mã) - dùng để tra ID/tên Tổ trước khi lọc các tool khác theo neighborhoodId.",
            parameters: {
                type: "OBJECT",
                properties: {
                    search: { type: "STRING", description: "Từ khóa tìm theo tên/mã Tổ dân phố (nếu có)" },
                },
            },
        },
        "neighborhoods.read",
        async (args, actorUser) => {
            const result = await listNeighborhoods({
                page: 1,
                limit: 10,
                search: strOrUndef(args.search),
                actorUser,
            });
            return {
                total: result.total,
                items: result.items.map(n => ({ id: String(n._id), name: n.name, code: n.code })),
            };
        },
    ),
    // So lieu TONG HOP (dem/thong ke) da duoc tinh san boi dashboardService -
    // dung cho cau hoi kieu "tong cong/bao nhieu/thong ke" thay vi bat model
    // tu dem qua search_* (cac tool do chi tra toi da 5 ban ghi mau, khong
    // phai toan bo - dem qua no vua sai vua ton rat nhieu luot goi tool). Chi
    // danh cho cap Phuong/To/admin (permission "dashboard.read" - cap Nguoi
    // dan khong co quyen nay vi ho chi co 1 nha/1 ho, search_* voi limit 5 da
    // du de tra loi, xem getMyHouseDashboard cho dashboard rieng cua ho).
    defineTool(
        {
            name: "get_area_overview",
            description:
                "Lấy số liệu TỔNG HỢP đã tính sẵn cho TOÀN BỘ phạm vi phụ trách (tổng số tổ dân phố, hộ dân, nhà số, nhân khẩu, hộ cần hỗ trợ, hộ thuê nhà, phản ánh mới/đang xử lý, yêu cầu quá hạn, khảo sát đang mở...). Dùng tool này cho câu hỏi tổng cộng/bao nhiêu/thống kê ở cấp TOÀN PHẠM VI (không chỉ định một Tổ dân phố cụ thể) - KHÔNG dùng search_houses/search_households/search_citizens/search_businesses/search_companies để đếm tổng toàn phạm vi vì các tool đó chỉ trả về tối đa 5 bản ghi mẫu (nhưng vẫn dùng được để đếm cho MỘT Tổ dân phố cụ thể qua neighborhoodId, xem mô tả của các tool đó).",
            parameters: { type: "OBJECT", properties: {} },
        },
        "dashboard.read",
        async (_args, actorUser) => {
            const [s, neighborhoodCount] = await Promise.all([
                getDashboardSummary(actorUser),
                listNeighborhoods({ page: 1, limit: 1, actorUser }),
            ]);
            return {
                phamVi: s.scopeLabel,
                tongToDanPho: neighborhoodCount.total,
                tongHoDan: s.totalHouseholds,
                tongNhaSo: s.totalHouses,
                tongNhanKhau: s.totalCitizens,
                hoThueNha: s.rentalHouseholds,
                hoCanHoTro: s.householdsNeedingSupport,
                phanAnhMoi: s.newComplaints,
                phanAnhDangXuLy: s.inProgressComplaints,
                yeuCauQuaHan: s.attention.overdueRequests,
                pcccRuiRoCao: s.attention.highRiskPccc,
                anNinhKhanCap: s.attention.urgentSecurity,
                chienDichRaSoatDangTrienKhai: s.attention.activeInspectionCampaigns,
                khaoSatDangMo: s.surveyParticipation.openSurveys,
                luotPhanHoiKhaoSat: s.surveyParticipation.totalResponses,
                chenhLechThuChiThang: s.financeSummary.monthNet,
            };
        },
    ),
];

function isFunctionCallPart(
    part: GeminiPart,
): part is Extract<GeminiPart, { functionCall: unknown }> {
    return "functionCall" in part;
}

function isTextPart(part: GeminiPart): part is Extract<GeminiPart, { text: string }> {
    return "text" in part;
}

/**
 * Dung tuong doi (khong query them Neighborhood/Ward rieng cho tung field) -
 * chi doc cac truong da denormalized san tren User (wardName) va 1 lan tra
 * Neighborhood theo id de co ten Tổ dan pho, phuc vu cau he thong instruction
 * de hieu, khong phai nguon du lieu chinh (do van la cac tool ben tren).
 */
/**
 * Mo ta ro RANG BUOC pham vi du lieu hien tai cua actorUser thanh 1 cau tieng
 * Viet de nhet vao system instruction - muc dich la de MODEL BIET SAN pham vi
 * cua chinh no ma KHONG PHAI HOI NGUOC lai nguoi dung "ban thuoc phuong/to
 * nao" (cau hoi do model khong the tu tra loi duoc vi khong thay du lieu nay
 * o dau ca neu khong noi thang trong system instruction). Dung cung mot quy
 * uoc voi rbac.ts: dac cach "admin" bang kiem tra role key truc tiep (thay vi
 * doc Role.scopeType==="ALL" tu DB) vi day la quy uoc chinh cua toan bo
 * rbac.ts, khong phai rieng o day.
 */
async function describeScope(actorUser: IUser): Promise<string> {
    if (actorUser.roles.includes("admin")) {
        return "Phạm vi dữ liệu: KHÔNG giới hạn - tài khoản Quản trị viên hệ thống, được xem dữ liệu của TẤT CẢ các Phường/Xã và Tổ dân phố.";
    }

    const roleDocs = await RoleModel.find({
        key: { $in: actorUser.roles },
        active: true,
    }).select("scopeType");
    const scopeTypes = new Set(roleDocs.map(r => r.scopeType));

    if (scopeTypes.has("WARD")) {
        return actorUser.wardName
            ? `Phạm vi dữ liệu: toàn bộ Phường/Xã "${actorUser.wardName}" (bao gồm mọi Tổ dân phố trực thuộc phường này).`
            : "Phạm vi dữ liệu: cấp Phường/Xã, nhưng tài khoản này CHƯA được gán Phường/Xã cụ thể nên hiện chưa xem được dữ liệu nào.";
    }

    if (scopeTypes.has("NEIGHBORHOOD")) {
        const neighborhoodIds = [
            actorUser.neighborhoodId,
            ...(actorUser.assignedNeighborhoodIds || []),
        ].filter(Boolean);
        if (neighborhoodIds.length > 0) {
            const neighborhoods = await Neighborhood.find({
                _id: { $in: neighborhoodIds },
            }).select("name");
            if (neighborhoods.length > 0) {
                return `Phạm vi dữ liệu: (các) Tổ dân phố sau: ${neighborhoods.map(n => n.name).join(", ")}.`;
            }
        }
        return "Phạm vi dữ liệu: cấp Tổ dân phố, nhưng tài khoản này CHƯA được gán Tổ dân phố nào nên hiện chưa xem được dữ liệu nào.";
    }

    return "Phạm vi dữ liệu: chỉ nhà/hộ khẩu/hộ kinh doanh/công ty của CHÍNH tài khoản này (không xem được của người khác).";
}

async function buildSystemInstruction(actorUser: IUser): Promise<string> {
    const roleLabels = actorUser.roles.map(r => ROLE_LABEL[r] || r).join(", ") || "không xác định";
    const scopeDescription = await describeScope(actorUser);

    return [
        "Bạn là trợ lý AI của ứng dụng quản lý Tổ dân phố, hỗ trợ cán bộ Phường/Tổ dân phố và người dân.",
        `Người dùng hiện tại có vai trò: ${roleLabels}.`,
        scopeDescription,
        "Phạm vi dữ liệu nêu trên là CỐ ĐỊNH theo tài khoản đang đăng nhập, không phải điều bạn cần hỏi thêm - TUYỆT ĐỐI KHÔNG hỏi ngược lại người dùng họ thuộc Phường/Xã hay Tổ dân phố nào, cũng không hỏi họ muốn xem phạm vi/khu vực nào. Cứ gọi thẳng công cụ (tool) phù hợp, công cụ sẽ TỰ giới hạn đúng phạm vi này. Chỉ hỏi lại người dùng khi thực sự cần làm rõ NỘI DUNG câu hỏi (ví dụ tên bị trùng, thiếu từ khóa tìm kiếm cụ thể), không hỏi lại về quyền hạn/phạm vi.",
        "Khi cần số liệu cụ thể (nhà số, hộ dân, nhân khẩu, công ty, hộ kinh doanh, loại hình kinh doanh, loại phản ánh, tổ dân phố), LUÔN gọi công cụ (tool) tương ứng thay vì tự suy đoán hay bịa số liệu.",
        "QUAN TRỌNG: khi được hỏi TỔNG SỐ/ĐẾM/THỐNG KÊ cho TOÀN BỘ phạm vi phụ trách (vd \"tổng cộng bao nhiêu\", \"toàn phường/hệ thống có mấy hộ dân/tổ dân phố\"), dùng tool get_area_overview TRƯỚC TIÊN (đã tính sẵn, chính xác, kể cả tổng số Tổ dân phố) - KHÔNG lấy items mẫu từ search_houses/search_households/search_citizens/search_businesses/search_companies để đếm toàn phạm vi (chỉ trả tối đa 5 bản ghi mẫu).",
        "Khi được hỏi về MỘT Tổ dân phố CỤ THỂ (theo tên, vd \"tổ X có bao nhiêu hộ dân/nhân khẩu/hộ kinh doanh\"): trước tiên gọi list_neighborhoods để tìm đúng id của Tổ đó theo tên, sau đó gọi tool tương ứng (search_households/search_citizens/search_houses/search_businesses/search_companies) kèm neighborhoodId vừa tìm được - đọc trường 'total' trong kết quả để trả lời (total là số chính xác riêng của Tổ đó, không phải số bản ghi mẫu hiển thị).",
        "Nếu công cụ báo lỗi/không có quyền/không tìm thấy dữ liệu, hãy thông báo lại đúng như vậy cho người dùng một cách lịch sự, không cố suy diễn hay bịa thêm.",
        "Vẫn có thể trả lời các câu hỏi xã hội, đời sống, pháp luật... chung không liên quan tới dữ liệu của ứng dụng, dựa trên kiến thức sẵn có, không cần gọi công cụ.",
        "Luôn trả lời ngắn gọn, đúng trọng tâm, bằng tiếng Việt; ưu tiên gạch đầu dòng khi liệt kê nhiều mục thay vì viết đoạn văn dài.",
    ]
        .filter(Boolean)
        .join("\n");
}

const MAX_TOOL_LOOPS = 4;

export async function sendAiChatMessage(
    actorUser: IUser,
    message: string,
    history: AiChatHistoryItem[],
): Promise<AiChatResult> {
    aiChatRateLimiter.check(String(actorUser._id));

    const contents: GeminiContent[] = [
        ...history.slice(-20).map(
            (h): GeminiContent => ({ role: h.role, parts: [{ text: h.text }] }),
        ),
        { role: "user", parts: [{ text: message }] },
    ];

    const systemInstruction = await buildSystemInstruction(actorUser);
    const maxOutputTokens = Number(process.env.AI_CHAT_MAX_OUTPUT_TOKENS) || 500;
    const toolsCalled: string[] = [];
    let usage: GeminiUsage | undefined;

    for (let loop = 0; loop < MAX_TOOL_LOOPS; loop++) {
        const step = await generateContent({
            contents,
            systemInstruction,
            tools: TOOLS.map(t => t.declaration),
            maxOutputTokens,
        });
        usage = step.usage;

        const functionCalls = step.parts.filter(isFunctionCallPart);
        if (functionCalls.length === 0) {
            const reply = step.parts.filter(isTextPart).map(p => p.text).join("").trim();
            void writeAuditLog({
                actorId: String(actorUser._id),
                action: "ai_chat.query",
                metadata: {
                    message: truncate(message, 300),
                    toolsCalled,
                    replyPreview: truncate(reply, 300),
                },
            });
            return {
                reply: reply || "Xin lỗi, tôi chưa có câu trả lời phù hợp cho câu hỏi này.",
                toolsCalled,
                usage,
            };
        }

        contents.push({ role: "model", parts: step.parts });

        const responseParts: GeminiPart[] = [];
        for (const call of functionCalls) {
            const tool = TOOLS.find(t => t.declaration.name === call.functionCall.name);
            toolsCalled.push(call.functionCall.name);
            const result = tool
                ? await tool.handler(call.functionCall.args || {}, actorUser)
                : ({ error: "Công cụ không tồn tại." } as ToolResult);
            responseParts.push({
                functionResponse: { name: call.functionCall.name, response: result },
            });
        }
        contents.push({ role: "function", parts: responseParts });
    }

    throw new HttpError(
        "Trợ lý AI xử lý quá nhiều bước cho câu hỏi này, vui lòng đặt câu hỏi cụ thể hơn",
        502,
    );
}
