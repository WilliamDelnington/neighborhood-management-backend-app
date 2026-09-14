import { z } from "zod";

// Stateless: frontend tu giu lich su hoi thoai va gui kem moi lan goi (khong
// luu conversation trong DB - xem services/aiChatService.ts). Gioi han do
// dai/so luong o day de chan chi phi goi Gemini bi doi khi khong co gioi han
// nao khac o phia server buoc client phai tuan theo.
export const aiChatRequestSchema = z.object({
    message: z.string().min(1, "Câu hỏi không được để trống").max(2000),
    history: z
        .array(
            z.object({
                role: z.enum(["user", "model"]),
                text: z.string().max(4000),
            }),
        )
        .max(20)
        .optional(),
});

export type AiChatRequestInput = z.infer<typeof aiChatRequestSchema>;
