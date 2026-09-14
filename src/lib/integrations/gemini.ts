import { HttpError } from "@/lib/response";

/**
 * Wrapper server-side cho Google Gemini (Generative Language API) - dung cho
 * chatbot AI (xem services/aiChatService.ts). Cung convention voi
 * lib/integrations/goong.ts: plain fetch (khong them SDK moi), doc API
 * key/model lazy moi lan goi (khong phai hang so top-level) de test co the
 * doi env giua cac test case. Khoa API luon doc server-side, KHONG BAO GIO
 * tra ve cho client.
 */
function getGeminiApiKey(): string {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
        throw new HttpError("Chưa cấu hình GEMINI_API_KEY ở server", 503);
    }
    return key;
}

function getGeminiModel(): string {
    return process.env.GEMINI_MODEL || "gemini-2.0-flash";
}

export type GeminiPart =
    | { text: string }
    | { functionCall: { name: string; args: Record<string, unknown> } }
    | { functionResponse: { name: string; response: Record<string, unknown> } };

export type GeminiContent = {
    role: "user" | "model" | "function";
    parts: GeminiPart[];
};

// Khai bao tool o dang OpenAPI Schema rut gon ma Gemini function-calling yeu
// cau (type viet HOA: "OBJECT"/"STRING"/"NUMBER"...) - xem
// https://ai.google.dev/gemini-api/docs/function-calling.
export type GeminiFunctionDeclaration = {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
};

export type GeminiUsage = {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
};

/**
 * Goi mot luot generateContent. Khong tu lap tool-calling o day - vong lap
 * function-call thuoc ve aiChatService.ts (noi biet cach thuc thi tung tool),
 * ham nay chi la 1 lan goi HTTP tho.
 */
export async function generateContent(params: {
    contents: GeminiContent[];
    systemInstruction?: string;
    tools?: GeminiFunctionDeclaration[];
    maxOutputTokens: number;
}): Promise<{ parts: GeminiPart[]; usage?: GeminiUsage }> {
    const apiKey = getGeminiApiKey();
    const model = getGeminiModel();
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const body: Record<string, unknown> = {
        contents: params.contents,
        generationConfig: {
            maxOutputTokens: params.maxOutputTokens,
            temperature: 0.3,
        },
    };
    if (params.systemInstruction) {
        body.systemInstruction = { parts: [{ text: params.systemInstruction }] };
    }
    if (params.tools && params.tools.length > 0) {
        body.tools = [{ functionDeclarations: params.tools }];
    }

    const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        // Log nguyen van loi tu Google (vd model bi ngung ho tro, API key bi
        // chan/leaked, het quota...) ra server console - KHONG lo ra client
        // (chi thay thong bao chung chung), nhung can thiet de debug vi loi
        // nay rat da dang nguyen nhan va khong the doan duoc tu status code.
        const errorBody = await res.text().catch(() => "");
        console.error(
            `Goi Gemini API that bai (status ${res.status}):`,
            errorBody,
        );
        throw new HttpError(
            "Trợ lý AI hiện không phản hồi được, vui lòng thử lại sau",
            502,
        );
    }
    const data = (await res.json()) as {
        candidates?: Array<{
            content?: { parts?: GeminiPart[] };
            finishReason?: string;
        }>;
        usageMetadata?: GeminiUsage;
    };
    const parts = data.candidates?.[0]?.content?.parts;
    if (!parts) {
        throw new HttpError("Trợ lý AI không trả về nội dung hợp lệ", 502);
    }
    return { parts, usage: data.usageMetadata };
}
