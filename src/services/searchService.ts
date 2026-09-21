import type { IUser } from "@/models";
import { getUserPermissionSet } from "@/lib/rbac";
import { listHouseRecords } from "@/services/houseRecordService";
import { listHouseholds } from "@/services/householdService";
import { listBusinesses } from "@/services/businessService";
import { listCompanies } from "@/services/companyService";
import { listCitizens } from "@/services/citizenService";
import { listUsers } from "@/services/userService";

export type GlobalSearchResultType =
    | "house"
    | "household"
    | "business"
    | "company"
    | "citizen"
    | "user";

export interface GlobalSearchResultItem {
    type: GlobalSearchResultType;
    id: string;
    title: string;
    subtitle?: string;
    href: string;
}

const PER_TYPE_LIMIT = 5;
const MIN_QUERY_LENGTH = 2;

/**
 * Tim kiem tong hop tren nhieu loai du lieu (Nha so/Ho dan/Ho kinh doanh/
 * Cong ty/Nhan khau/Tai khoan) cho o tim kiem tren header admin-web-app.
 *
 * QUAN TRONG: TAI SU DUNG truc tiep cac ham list*() da co san cua tung
 * module (thay vi tu viet lai dieu kien loc pham vi/quyen o day) - moi ham
 * list*() da duoc kiem chung ky luong ve scope (assignedClusters/
 * neighborhoodId/wardCode/ownerId...) qua man danh sach tuong ung. Viet lai
 * logic scope rieng cho endpoint tong hop nay se co nguy co sai sot va lo du
 * lieu ngoai pham vi actorUser duoc phep xem.
 */
export async function globalSearch(
    query: string,
    actorUser: IUser,
): Promise<GlobalSearchResultItem[]> {
    const trimmed = query.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) return [];

    const permissions = await getUserPermissionSet(actorUser);
    const tasks: Promise<GlobalSearchResultItem[]>[] = [];

    if (permissions.has("houses.read")) {
        tasks.push(
            listHouseRecords({
                page: 1,
                limit: PER_TYPE_LIMIT,
                search: trimmed,
                actorUser,
            }).then(res =>
                res.items.map(h => ({
                    type: "house" as const,
                    id: String(h._id),
                    title: h.code,
                    subtitle: h.address,
                    href: `/houses/${h._id}`,
                })),
            ),
        );
    }

    if (permissions.has("households.read")) {
        tasks.push(
            listHouseholds({
                page: 1,
                limit: PER_TYPE_LIMIT,
                search: trimmed,
                actorUser,
            }).then(res =>
                res.items.map(h => {
                    const house =
                        h.houseId && typeof h.houseId === "object"
                            ? (h.houseId as unknown as {
                                  code?: string;
                                  address?: string;
                              })
                            : null;
                    return {
                        type: "household" as const,
                        id: String(h._id),
                        title: `${h.code} — ${h.headOfHousehold}`,
                        subtitle: house?.address || house?.code,
                        href: `/households/${h._id}`,
                    };
                }),
            ),
        );
    }

    if (permissions.has("businesses.read")) {
        tasks.push(
            listBusinesses({
                page: 1,
                limit: PER_TYPE_LIMIT,
                search: trimmed,
                actorUser,
            }).then(res =>
                res.items
                    .filter(b => b.houseId && typeof b.houseId === "object")
                    .map(b => {
                        const house = b.houseId as unknown as {
                            _id: unknown;
                            code?: string;
                            address?: string;
                        };
                        return {
                            type: "business" as const,
                            id: String(b._id),
                            title: b.name,
                            subtitle: house.address || house.code,
                            href: `/houses/${house._id}/businesses/${b._id}`,
                        };
                    }),
            ),
        );
    }

    if (permissions.has("companies.read")) {
        tasks.push(
            listCompanies({
                page: 1,
                limit: PER_TYPE_LIMIT,
                search: trimmed,
                actorUser,
            }).then(res =>
                res.items
                    .filter(c => c.houseId && typeof c.houseId === "object")
                    .map(c => {
                        const house = c.houseId as unknown as {
                            _id: unknown;
                            code?: string;
                            address?: string;
                        };
                        return {
                            type: "company" as const,
                            id: String(c._id),
                            title: c.name,
                            subtitle: house.address || house.code,
                            href: `/houses/${house._id}/companies/${c._id}`,
                        };
                    }),
            ),
        );
    }

    if (permissions.has("citizens.read")) {
        tasks.push(
            listCitizens({
                page: 1,
                limit: PER_TYPE_LIMIT,
                search: trimmed,
                actorUser,
            }).then(res =>
                res.items.map(c => {
                    const household =
                        c.householdId && typeof c.householdId === "object"
                            ? (c.householdId as unknown as {
                                  code?: string;
                                  address?: string;
                              })
                            : null;
                    return {
                        type: "citizen" as const,
                        id: String(c._id),
                        title: c.fullName,
                        subtitle: household?.address || household?.code,
                        href: `/citizens/${c._id}`,
                    };
                }),
            ),
        );
    }

    if (permissions.has("users.read")) {
        tasks.push(
            listUsers({
                page: 1,
                limit: PER_TYPE_LIMIT,
                search: trimmed,
                actorUser,
            }).then(res =>
                res.items.map(u => ({
                    type: "user" as const,
                    id: u.id,
                    title: u.displayName,
                    subtitle: u.phone || undefined,
                    href: `/users/${u.id}`,
                })),
            ),
        );
    }

    const settled = await Promise.all(tasks);
    return settled.flat();
}
