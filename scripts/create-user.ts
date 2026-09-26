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
    yes: boolean;
    help: boolean;
};

const USAGE = `
Create one standalone user account without creating a HouseOwnership, Household,
Citizen, neighborhood assignment, or any other business relationship.

Usage:
  npm run users:create -- --name <name> --phone <phone> --role <role> [options]

Required:
  --name <name>              Display name
  --phone <phone>            Unique login phone number
  --role <role>              Active role key; repeat for multiple roles

Password (at least 6 characters), first one found is used:
  --password <password>      On the command line (ends up in shell history)
  NEW_USER_PASSWORD=<pw>     Environment variable set BEFORE running the script
  (neither)                  Asked interactively, hidden, typed twice

Production:
  Allowed. If MONGODB_URI points to the production database you must type the
  database name to confirm, or pass --yes when running non-interactively.

Options:
  --email <email>            Unique email address
  --address <address>        Free-text address
  --primary-role <role>      Primary role; defaults to the first --role
  --notifications            Enable notification permission
  --no-notifications         Disable notification permission (default)
  --yes                      Skip the production-database confirmation
  --help                     Show this help without connecting to MongoDB

Examples:
  NEW_USER_PASSWORD='ChangeMe123!' npm run users:create -- --name "Nguyen Van A" --phone 0901234567 --role secretary
  npm run users:create -- --name "Nguyen Van A" --phone 0901234567 --role secretary   (asks for the password)
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
        yes: false,
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
            case "--yes":
            case "-y":
                options.yes = true;
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
    ].filter(Boolean);
    if (missing.length) {
        throw new Error(`Missing required option(s): ${missing.join(", ")}`);
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
    const { normalizePhone } = await import("@/lib/encryption");
    const { hashPassword } = await import("@/lib/auth");
    const { Role, User } = await import("../src/models");
    const { confirmProductionTarget, resolvePassword } = await import(
        "./lib/cliPrompt"
    );

    if (!process.env.MONGODB_URI) {
        throw new Error("Missing MONGODB_URI (check .env.local)");
    }
    // Chi tao MOT tai khoan - duoc phep tren production (khac seed*), nhung
    // phai xac nhan ro rang, xem confirmProductionTarget.
    await confirmProductionTarget(process.env.MONGODB_URI, options.yes);
    const password = await resolvePassword(options.password);
    if (password.length < 6) {
        throw new Error("Password must contain at least 6 characters");
    }
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
        passwordHash: await hashPassword(password),
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
