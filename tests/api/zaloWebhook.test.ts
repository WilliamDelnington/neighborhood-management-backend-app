import { createHash } from "crypto";
import { describe, it, expect } from "vitest";
import { POST as zaloWebhookRoute } from "@/app/api/webhooks/zalo/route";
import { ZaloWebhookEvent } from "@/models";
import { makeRequest, readJson } from "../helpers";

const OA_SECRET_KEY = process.env.ZALO_OA_SECRET_KEY as string;

function signPayload(rawBody: string, appId: string, timestamp: string) {
    return (
        "mac=" +
        createHash("sha256")
            .update(appId + rawBody + timestamp + OA_SECRET_KEY)
            .digest("hex")
    );
}

describe("Webhook Zalo (/api/webhooks/zalo)", () => {
    it("chu ky hop le: luu su kien va tra ve 200", async () => {
        const body = {
            app_id: "test-app-id",
            timestamp: "1700000000000",
            event_name: "user_withdraw_consent",
            follower_id: "zalo-user-1",
        };
        const rawBody = JSON.stringify(body);
        const signature = signPayload(
            rawBody,
            body.app_id,
            body.timestamp,
        );

        const res = await zaloWebhookRoute(
            makeRequest("/api/webhooks/zalo", {
                method: "POST",
                body,
                headers: { "X-ZEvent-Signature": signature },
            }),
        );
        expect(res.status).toBe(200);

        const events = await ZaloWebhookEvent.find({});
        expect(events).toHaveLength(1);
        expect(events[0].eventName).toBe("user_withdraw_consent");
        expect(events[0].signatureValid).toBe(true);
    });

    it("chu ky khong hop le: tu choi voi 401 va khong luu su kien", async () => {
        const body = {
            app_id: "test-app-id",
            timestamp: "1700000000000",
            event_name: "user_withdraw_consent",
        };

        const res = await zaloWebhookRoute(
            makeRequest("/api/webhooks/zalo", {
                method: "POST",
                body,
                headers: { "X-ZEvent-Signature": "mac=deadbeef" },
            }),
        );
        expect(res.status).toBe(401);

        const events = await ZaloWebhookEvent.find({});
        expect(events).toHaveLength(0);
    });

    it("thieu header chu ky: tu choi voi 401", async () => {
        const body = {
            app_id: "test-app-id",
            timestamp: "1700000000000",
            event_name: "follow",
        };

        const res = await zaloWebhookRoute(
            makeRequest("/api/webhooks/zalo", { method: "POST", body }),
        );
        expect(res.status).toBe(401);
    });
});
