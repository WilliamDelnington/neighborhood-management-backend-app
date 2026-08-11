import { config as loadEnv } from "dotenv";

const EMPTY_SUMMARY = {
    tasks: { received: 0, completed: 0, overdue: 0 },
    feedback: { received: 0, verified: 0, forwarded: 0, pending: 0 },
    inspections: {
        total: 0,
        completed: 0,
        passed: 0,
        failed: 0,
        pending: 0,
        revisionRequired: 0,
        fieldCheckRequired: 0,
    },
    cases: { total: 0, open: 0, resolved: 0 },
    generatedAt: new Date(),
};

const DEFAULT_KPIS = [
    ["task_completion_rate", "Tỷ lệ nhiệm vụ hoàn thành", "task_completion", 90],
    ["task_on_time_rate", "Tỷ lệ nhiệm vụ đúng hạn", "task_on_time", 85],
    ["feedback_sla_rate", "Tỷ lệ phản ánh đạt SLA", "feedback_sla", 90],
    ["inspection_completion_rate", "Tỷ lệ hoàn thành rà soát", "inspection_completion", 95],
    ["house_response_rate", "Tỷ lệ Nhà số phản hồi", "house_response", 80],
    ["notification_read_rate", "Tỷ lệ đọc thông báo", "notification_read", 75],
] as const;

async function main() {
    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const {
        KpiDefinition,
        PeriodicReport,
        PeriodicReportVersion,
        Role,
        User,
    } = await import("@/models");
    await connectDB();
    await PeriodicReport.updateMany(
        { status: "revision_requested" },
        { $set: { status: "revision_required" } },
    );
    await PeriodicReport.updateMany(
        { status: "resubmitted" },
        { $set: { status: "submitted" } },
    );
    await PeriodicReport.updateMany(
        { currentVersion: { $exists: false } },
        { $set: { currentVersion: 0 } },
    );
    await PeriodicReport.updateMany(
        { autoSummary: { $exists: false } },
        { $set: { autoSummary: EMPTY_SUMMARY } },
    );

    const rolePermissions: Record<string, string[]> = {
        neighborhood_leader: ["reports.kpi_read"],
        regional_police: ["reports.kpi_read"],
        secretary: [
            "reports.read",
            "reports.export",
            "reports.receive",
            "reports.review",
            "reports.kpi_read",
            "reports.kpi_manage",
        ],
        people_committee_official: [
            "reports.read",
            "reports.export",
            "reports.receive",
            "reports.review",
            "reports.kpi_read",
            "reports.kpi_manage",
        ],
    };
    for (const [key, permissions] of Object.entries(rolePermissions)) {
        await Role.updateOne(
            { key },
            { $addToSet: { permissions: { $each: permissions } } },
        );
    }

    const admin = await User.findOne({ roles: "admin", status: "active" }).select("_id");
    if (admin) {
        for (const [code, name, dataSource, targetValue] of DEFAULT_KPIS) {
            await KpiDefinition.updateOne(
                { code, wardCode: { $exists: false } },
                {
                    $setOnInsert: {
                        code,
                        name,
                        formulaType: "ratio",
                        dataSource,
                        targetValue,
                        targetDirection: "gte",
                        unit: "%",
                        period: "monthly",
                        active: true,
                        version: 1,
                        createdBy: admin._id,
                    },
                },
                { upsert: true },
            );
        }
    }

    await Promise.all([
        PeriodicReport.syncIndexes(),
        PeriodicReportVersion.syncIndexes(),
        KpiDefinition.syncIndexes(),
    ]);
    console.log("Da migrate nen tang bao cao, KPI va phan quyen export.");
    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
