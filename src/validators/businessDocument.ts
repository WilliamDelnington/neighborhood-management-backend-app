import {
    createDocumentSchema,
    reviewDocumentSchema,
    type CreateDocumentInput,
    type ReviewDocumentInput,
} from "./requiredDocument";

// Dung chung voi House/Household/Company qua validators/requiredDocument.ts.
export const createBusinessDocumentSchema = createDocumentSchema;
export type CreateBusinessDocumentInput = CreateDocumentInput;

export const reviewBusinessDocumentSchema = reviewDocumentSchema;
export type ReviewBusinessDocumentInput = ReviewDocumentInput;
