import { describe, expect, it } from "vitest";
import { GET as listNeighborhoodsRoute } from "@/app/api/neighborhoods/route";
import { GET as getNeighborhoodRoute } from "@/app/api/neighborhoods/[id]/route";
import { Neighborhood } from "@/models";
import { authHeaders, createTestUser, makeRequest, readJson } from "../helpers";

describe("Ward-scoped neighborhood access", () => {
    it("secretary only sees neighborhoods in the assigned ward", async () => {
            const inWard = await Neighborhood.create({
                name: "To dan pho ward 9886",
                code: "WARD-9886-SECRETARY",
                sequence: 98861,
                wardCode: 9886,
            });
            const outOfWard = await Neighborhood.create({
                name: "To dan pho ward 3703",
                code: "WARD-3703-SECRETARY",
                sequence: 37031,
                wardCode: 3703,
            });
            const user = await createTestUser({
                roles: ["secretary"],
                wardCode: 9886,
            });
            const headers = await authHeaders(user);

            const list = await readJson(
                await listNeighborhoodsRoute(
                    makeRequest("/api/neighborhoods", { headers }),
                ),
            );
            const ids = list.data.items.map((item: { _id: string }) => item._id);
            expect(ids).toContain(String(inWard._id));
            expect(ids).not.toContain(String(outOfWard._id));

            const forbidden = await getNeighborhoodRoute(
                makeRequest(`/api/neighborhoods/${outOfWard._id}`, { headers }),
                { params: { id: String(outOfWard._id) } },
            );
            expect(forbidden.status).toBe(403);
    });

    it("returns no neighborhoods when a secretary has no assigned ward", async () => {
        const secretary = await createTestUser({ roles: ["secretary"] });
        const response = await readJson(
            await listNeighborhoodsRoute(
                makeRequest("/api/neighborhoods", {
                    headers: await authHeaders(secretary),
                }),
            ),
        );
        expect(response.data.items).toHaveLength(0);
        expect(response.data.total).toBe(0);
    });
});
