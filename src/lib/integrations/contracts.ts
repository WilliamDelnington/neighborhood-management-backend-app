/**
 * Hop dong chung cho cac adapter lien thong. Nghiep vu noi bo chi goi hop
 * dong nay; ma nha cung cap LGSP/NDXP/VNeID/thanh toan/chu ky so nam o adapter
 * rieng, nen khi co API that khong phai sua cac module Nha so/Cong dan.
 */
export type IntegrationCode =
    | "vneid"
    | "national_population_db"
    | "lgsp"
    | "ndxp"
    | "public_service_portal"
    | "land_db"
    | "civil_status_db"
    | "social_insurance_db"
    | "payment_gateway"
    | "government_digital_signature";

export type IntegrationCapability =
    | "read"
    | "write"
    | "webhook"
    | "payment"
    | "digital_signature";

export type IntegrationRequest<TPayload = unknown> = {
    correlationId: string;
    operation: string;
    payload: TPayload;
};

export type IntegrationResponse<TData = unknown> = {
    correlationId: string;
    externalReference?: string;
    data: TData;
};

export interface IntegrationAdapter {
    readonly code: IntegrationCode;
    readonly capabilities: IntegrationCapability[];
    isConfigured(): boolean;
    healthCheck(): Promise<{ ok: boolean; message?: string }>;
    execute<TPayload, TData>(
        request: IntegrationRequest<TPayload>,
    ): Promise<IntegrationResponse<TData>>;
}

