/* eslint-disable no-console */
import readline from "node:readline";
import { Writable } from "node:stream";
import { extractDbNameFromMongoUri, isProtectedDatabase } from "@/lib/config";

/**
 * Hoi mot cau tren terminal. hidden=true thi KHONG hien ky tu nguoi dung go
 * (dung cho mat khau - khong luu vao lich su shell nhu khi truyen qua tham so).
 */
export function ask(question: string, hidden = false): Promise<string> {
    let muted = false;
    const output = new Writable({
        write(chunk, encoding, callback) {
            if (!muted) process.stdout.write(chunk, encoding);
            callback();
        },
    });
    const rl = readline.createInterface({
        input: process.stdin,
        output,
        terminal: true,
    });
    return new Promise(resolve => {
        rl.question(question, answer => {
            rl.close();
            if (hidden) process.stdout.write("\n");
            resolve(answer);
        });
        muted = hidden;
    });
}

/**
 * Lay mat khau cho tai khoan theo thu tu: tham so --password, bien moi truong
 * NEW_USER_PASSWORD (dat SAN truoc khi chay script, vd `export
 * NEW_USER_PASSWORD=...`), roi moi hoi an tren terminal (nhap 2 lan).
 */
export async function resolvePassword(cliPassword?: string): Promise<string> {
    if (cliPassword) return cliPassword;
    const fromEnv = process.env.NEW_USER_PASSWORD;
    if (fromEnv) return fromEnv;
    if (!process.stdin.isTTY) {
        throw new Error(
            "Missing password: pass --password, set NEW_USER_PASSWORD, or run in an interactive terminal",
        );
    }
    const first = await ask("Password (hidden): ", true);
    const second = await ask("Confirm password: ", true);
    if (first !== second) throw new Error("Passwords do not match");
    return first;
}

/**
 * Cho phep script tao/sua MOT tai khoan chay tren database production (khac
 * cac script seed/ghi hang loat - van bi assertNotProtectedDatabase chan cung),
 * nhung bat buoc xac nhan: go lai dung ten database, hoac truyen --yes khi
 * chay khong tuong tac. Database khong phai production thi bo qua.
 */
export async function confirmProductionTarget(
    uri: string,
    assumeYes: boolean,
): Promise<void> {
    if (!isProtectedDatabase(uri)) return;
    const dbName = extractDbNameFromMongoUri(uri);
    console.warn(`WARNING: MONGODB_URI points to the PRODUCTION database "${dbName}".`);
    if (assumeYes) {
        console.warn("--yes given, continuing.");
        return;
    }
    if (!process.stdin.isTTY) {
        throw new Error(
            `Refusing to write to production database "${dbName}" without confirmation - re-run with --yes`,
        );
    }
    const answer = await ask(`Type the database name (${dbName}) to continue: `);
    if (answer.trim() !== dbName) {
        throw new Error("Confirmation did not match - aborted, nothing was written");
    }
}
