import { connectDB } from "@/lib/mongodb";
import { apiSuccess, apiError, apiErrorFromException } from "@/lib/response";
import { verifyZaloWebhookSignature } from "@/lib/zalo";
import {
    recordWebhookEvent,
    looksLikeDataSubjectRightsEvent,
} from "@/services/zaloWebhookService";

export const dynamic = "force-dynamic";

/**
 * Webhook nhan su kien tu Zalo (OA/Mini App) - dung de khai bao "Webhook URL"
 * trong buoc xet duyet phien ban Mini App, xu ly su kien nguoi dung rut lai su
 * dong y / yeu cau xoa du lieu.
 *
 * Zalo yeu cau tra ve HTTP 200 trong vong 2 giay cho MOI request (ke ca khong
 * nhan dien duoc event_name) de tranh bi retry/backoff - vi vay route nay luon
 * luu su kien roi tra ve thanh cong ngay, khong xu ly nghiep vu nang (xoa/anon
 * hoa du lieu nguoi dung that su) dong bo trong request.
 *
 * Chu ky duoc xac thuc qua header `X-ZEvent-Signature` (xem
 * verifyZaloWebhookSignature). Request khong co chu ky hop le bi tu choi truoc
 * khi ket noi DB, tranh luu ban ghi rac tu request gia mao.
 */
export async function POST(req: Request) {
    try {
        const rawBody = await req.text();
        let body: Record<string, unknown>;
        try {
            body = JSON.parse(rawBody);
        } catch {
            return apiError("Payload khong phai JSON hop le", 400);
        }

        const appId = String(body.app_id ?? "");
        const timestamp = String(body.timestamp ?? "");
        const eventName = String(body.event_name ?? "unknown");
        const signatureHeader = req.headers.get("x-zevent-signature");

        const signatureValid = verifyZaloWebhookSignature(
            rawBody,
            appId,
            timestamp,
            signatureHeader,
        );
        if (!signatureValid) {
            console.warn(
                "[zalo-webhook] Chu ky khong hop le, tu choi request",
                { eventName },
            );
            return apiError("Chu ky khong hop le", 401);
        }

        await connectDB();
        await recordWebhookEvent({
            appId,
            eventName,
            payload: body,
            signatureValid,
        });

        if (looksLikeDataSubjectRightsEvent(eventName)) {
            // TODO: chua co logic xoa/anonymize du lieu nguoi dung tu dong -
            // day la quyet dinh nghiep vu (xoa han hay chi anonymize, co giu
            // lai ho so cho muc dich hanh chinh cua to dan pho hay khong...)
            // can xac nhan truoc khi trien khai. Su kien da duoc luu day du o
            // ZaloWebhookEvent de xu ly thu cong/doi soat trong luc cho.
            console.warn(
                "[zalo-webhook] Nhan su kien co the la yeu cau rut lai su dong y/xoa du lieu, can xu ly thu cong",
                { eventName },
            );
        }

        return apiSuccess(null, "OK");
    } catch (err) {
        return apiErrorFromException(err);
    }
}
