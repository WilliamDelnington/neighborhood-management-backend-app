import { Citizen, HouseRecord, User } from "@/models";
import type {
    IntegrationCapability,
    IntegrationCode,
} from "@/lib/integrations/contracts";

type ProviderDefinition = {
    code: IntegrationCode;
    name: string;
    envKeys: string[];
    capabilities: IntegrationCapability[];
};

const PROVIDERS: ProviderDefinition[] = [
    {
        code: "vneid",
        name: "VNeID",
        envKeys: ["VNEID_API_URL", "VNEID_CLIENT_ID", "VNEID_CLIENT_SECRET"],
        capabilities: ["read"],
    },
    {
        code: "national_population_db",
        name: "CSDL Quốc gia về Dân cư",
        envKeys: ["POPULATION_DB_API_URL", "POPULATION_DB_CLIENT_ID"],
        capabilities: ["read", "write"],
    },
    {
        code: "lgsp",
        name: "Trục LGSP",
        envKeys: ["LGSP_API_URL", "LGSP_CLIENT_ID"],
        capabilities: ["read", "write", "webhook"],
    },
    {
        code: "ndxp",
        name: "Trục NDXP",
        envKeys: ["NDXP_API_URL", "NDXP_CLIENT_ID"],
        capabilities: ["read", "write", "webhook"],
    },
    {
        code: "public_service_portal",
        name: "Cổng Dịch vụ công",
        envKeys: ["PUBLIC_SERVICE_API_URL", "PUBLIC_SERVICE_CLIENT_ID"],
        capabilities: ["read", "write", "webhook"],
    },
    {
        code: "land_db",
        name: "CSDL Đất đai",
        envKeys: ["LAND_DB_API_URL"],
        capabilities: ["read", "write"],
    },
    {
        code: "civil_status_db",
        name: "CSDL Hộ tịch",
        envKeys: ["CIVIL_STATUS_DB_API_URL"],
        capabilities: ["read", "write"],
    },
    {
        code: "social_insurance_db",
        name: "CSDL BHXH",
        envKeys: ["SOCIAL_INSURANCE_API_URL"],
        capabilities: ["read"],
    },
    {
        code: "payment_gateway",
        name: "Cổng thanh toán phí/lệ phí",
        envKeys: ["PAYMENT_GATEWAY_API_URL", "PAYMENT_GATEWAY_MERCHANT_ID"],
        capabilities: ["payment", "webhook"],
    },
    {
        code: "government_digital_signature",
        name: "Chữ ký số chuyên dùng",
        envKeys: ["GOV_SIGNATURE_API_URL", "GOV_SIGNATURE_CLIENT_ID"],
        capabilities: ["digital_signature"],
    },
];

export async function getDigitalReadiness() {
    const [
        totalHouses,
        housesWithGis,
        totalUsers,
        verifiedUsers,
        totalCitizens,
        verifiedCitizens,
    ] = await Promise.all([
        HouseRecord.countDocuments(),
        HouseRecord.countDocuments({
            gisLatitude: { $exists: true, $nin: [null, 0] },
            gisLongitude: { $exists: true, $nin: [null, 0] },
            location: { $exists: true },
        }),
        User.countDocuments(),
        User.countDocuments({ identityVerificationStatus: "verified" }),
        Citizen.countDocuments(),
        Citizen.countDocuments({ identityVerificationStatus: "verified" }),
    ]);

    return {
        generatedAt: new Date(),
        gis: {
            mode: "internal_coordinates",
            externalMapProviderConfigured: false,
            totalHouses,
            housesWithCoordinates: housesWithGis,
            housesWithoutCoordinates: Math.max(0, totalHouses - housesWithGis),
            coveragePercent:
                totalHouses === 0
                    ? 0
                    : Math.round((housesWithGis / totalHouses) * 10000) / 100,
            zeroCoordinatesTreatedAsMissing: true,
        },
        identity: {
            currentLoginMethod: "phone_temporary",
            nationalIdentityRequiredWhenProviderAvailable: true,
            users: {
                total: totalUsers,
                verified: verifiedUsers,
                unverified: Math.max(0, totalUsers - verifiedUsers),
            },
            citizens: {
                total: totalCitizens,
                verified: verifiedCitizens,
                unverified: Math.max(0, totalCitizens - verifiedCitizens),
            },
        },
        apiFirst: {
            versionedBasePath: "/api/v1",
            adapterContract: true,
            twoWaySyncReady: false,
        },
        providers: PROVIDERS.map(provider => {
            const presentKeys = provider.envKeys.filter(key =>
                Boolean(process.env[key]?.trim()),
            );
            const configured = presentKeys.length === provider.envKeys.length;
            return {
                code: provider.code,
                name: provider.name,
                capabilities: provider.capabilities,
                status: configured ? "configured_not_verified" : "not_configured",
                configured,
                configuredFieldCount: presentKeys.length,
                requiredFieldCount: provider.envKeys.length,
            };
        }),
        compliance: {
            sensitiveFormEncryptionAtRest: true,
            personalDataEncryptionCoverage: "partial",
            auditLogging: true,
            levelTwoOrThreeCertified: false,
            decree13Certified: false,
            note:
                "Các cờ chứng nhận chỉ được bật sau đánh giá ATTT/pháp lý độc lập; phần mềm không tự tuyên bố đạt chứng nhận.",
        },
    };
}
