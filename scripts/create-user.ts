/* eslint-disable no-console */
import { config as loadEnv } from "dotenv";

type CliOptions = {
    name?: string;
    phone?: string;
    email?: string;
    password?: string;
    roles: string[];
    primaryRole?: string;
    address?: string;
    notificationPermission: boolean;
    help: boolean;
};

const USAGE = `
Create one standalone user account without creating a HouseOwnership, Household,
Citizen, neighborhood assignment, or any other business relationship.

Usage:
  npm run users:create -- --name <name> --phone <phone> --role <role> --password <password> [options]

Required:
  --name <name>              Display name
  --phone <phone>            Unique login phone number
  --role <role>              Active role key; repeat for multiple roles
  --password <password>      Password with at least 6 characters

Options:
  --email <email>            Unique email address
  --address <address>        Free-text address
  --primary-role <role>      Primary role; defaults to the first --role
  --notifications            Enable notification permission
  --no-notifications         Disable notification permission (default)
  --help                     Show this help without connecting to MongoDB

Examples:
  npm run users:create -- --name "Nguyen Van A" --phone 0901234567 --role secretary --password "ChangeMe123!"
  npm run users:create -- --name "Ward Officer" --phone 0901234568 --email officer@example.vn --role people_committee_official --password "ChangeMe123!" --notifications
  npm run users:create -- --name "Multi-role User" --phone 0901234569 --role secretary --role regional_police --primary-role secretary --password "ChangeMe123!"
`;

function takeValue(args: string[], index: number, flag: string): string {
    const value = args[index + 1];
    if (!value || value.startsWith("--")) {
        throw new Error(`Missing value for ${flag}`);
    }
    return value;
}

function parseArgs(args: string[]): CliOptions {
    const options: CliOptions = {
        roles: [],
        notificationPermission: false,
        help: false,
    };

    for (let i = 0; i < args.length; i += 1) {
        const arg = args[i];
        switch (arg) {
            case "--help":
            case "-h":
                options.help = true;
                break;
            case "--name":
                options.name = takeValue(args, i, arg);
                i += 1;
                break;
            case "--phone":
                options.phone = takeValue(args, i, arg);
                i += 1;
                break;
            case "--email":
                options.email = takeValue(args, i, arg);
                i += 1;
                break;
            case "--password":
                options.password = takeValue(args, i, arg);
                i += 1;
                break;
            case "--role":
                options.roles.push(takeValue(args, i, arg));
                i += 1;
                break;
            case "--primary-role":
                options.primaryRole = takeValue(args, i, arg);
                i += 1;
                break;
            case "--address":
                options.address = takeValue(args, i, arg);
                i += 1;
                break;
            case "--notifications":
                options.notificationPermission = true;
                break;
            case "--no-notifications":
                options.notificationPermission = false;
                break;
            default:
                throw new Error(`Unknown option: ${arg}`);
        }
    }

    options.roles = [...new Set(options.roles.map(role => role.trim()).filter(Boolean))];
    options.name = options.name?.trim();
    options.email = options.email?.trim().toLowerCase();
    options.address = options.address?.trim();
    options.primaryRole = options.primaryRole?.trim();
    return options;
}

function validateOptions(options: CliOptions): void {
    const missing = [
        !options.name && "--name",
        !options.phone && "--phone",
        options.roles.length === 0 && "--role",
        !options.password && "--password",
    ].filter(Boolean);
    if (missing.length) {
        throw new Error(`Missing required option(s): ${missing.join(", ")}`);
    }
    if ((options.password as string).length < 6) {
        throw new Error("Password must contain at least 6 characters");
    }
    if (options.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(options.email)) {
        throw new Error("Invalid email address");
    }
    const primaryRole = options.primaryRole || options.roles[0];
    if (!options.roles.includes(primaryRole)) {
        throw new Error("--primary-role must also be supplied as a --role");
    }
    options.primaryRole = primaryRole;
}

async function main(): Promise<void> {
    let options: CliOptions;
    try {
        options = parseArgs(process.argv.slice(2));
        if (options.help) {
            console.log(USAGE.trim());
            return;
        }
        validateOptions(options);
    } catch (error) {
        console.error(error instanceof Error ? error.message : error);
        console.error(USAGE.trim());
        process.exitCode = 1;
        return;
    }

    loadEnv({ path: ".env.local" });
    loadEnv();

    const { connectDB } = await import("@/lib/mongodb");
    const { assertNotProtectedDatabase } = await import("@/lib/config");
    const { normalizePhone } = await import("@/lib/encryption");
    const { hashPassword } = await import("@/lib/auth");
    const { Role, User } = await import("../src/models");

    if (!process.env.MONGODB_URI) {
        throw new Error("Missing MONGODB_URI (check .env.local)");
    }
    assertNotProtectedDatabase(process.env.MONGODB_URI);
    await connectDB();

    const phone = normalizePhone(options.phone as string);
    const duplicateConditions: Array<Record<string, string>> = [{ phone }];
    if (options.email) duplicateConditions.push({ email: options.email });
    const duplicate = await User.findOne({ $or: duplicateConditions }).select(
        "displayName phone email",
    );
    if (duplicate) {
        throw new Error(
            `A user already exists with that phone or email: ${duplicate.displayName} (${duplicate.phone || duplicate.email})`,
        );
    }

    const activeRoles = await Role.find({
        key: { $in: options.roles },
        active: true,
    }).select("key");
    const activeRoleKeys = new Set(activeRoles.map(role => role.key));
    const invalidRoles = options.roles.filter(role => !activeRoleKeys.has(role));
    if (invalidRoles.length) {
        throw new Error(
            `Unknown or inactive role(s): ${invalidRoles.join(", ")}. Seed or activate the roles before creating the user.`,
        );
    }

    const user = await User.create({
        displayName: options.name,
        phone,
        email: options.email || undefined,
        address: options.address || undefined,
        passwordHash: await hashPassword(options.password as string),
        roles: options.roles,
        primaryRole: options.primaryRole,
        status: "active",
        permissions: [],
        notificationPermission: options.notificationPermission,
        sessionVersion: 0,
    });

    console.log(`Created user: ${user.displayName}`);
    console.log(`ID: ${String(user._id)}`);
    console.log(`Phone: ${user.phone}`);
    console.log(`Roles: ${user.roles.join(", ")}`);
    console.log(`Primary role: ${user.primaryRole}`);
    console.log("No House or household relationship was created.");
}

main()
    .catch(error => {
        console.error("Failed to create user:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        const mongoose = await import("mongoose");
        if (mongoose.default.connection.readyState !== 0) {
            await mongoose.default.connection.close();
        }
    });
