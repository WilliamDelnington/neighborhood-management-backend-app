import { z } from "zod";

/**
 * Mot dong du lieu da parse tu file Excel, truoc khi duoc chuan hoa thanh
 * document san sang insert vao DB. Dung Record<string, unknown> vi cau truc
 * phu thuoc vao loai import (household/citizen/party_member).
 */
export type ImportPreviewRow = Record<string, unknown>;

/**
 * Input cho step "commit" mot import job. Cac route commit hien tai nhan
 * importJobId tu URL param ([jobId]) nen schema nay chu yeu dung khi can
 * validate body cho mot endpoint commit dung chung trong tuong lai.
 */
export const commitImportSchema = z.object({
    importJobId: z.string().min(1, "Thieu ma import job"),
});
export type CommitImportInput = z.infer<typeof commitImportSchema>;
