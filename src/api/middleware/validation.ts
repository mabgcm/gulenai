import { z } from "zod";
import type { ApiSearchRequest } from "../types.js";

const optionalNonEmpty = z.string().trim().min(1).optional();

export const searchRequestSchema = z.object({
  question: z.string().trim().min(1),
  topK: z.number().int().positive().max(50).optional(),
  threshold: z.number().min(0).max(1).optional(),
  language: optionalNonEmpty,
  documentId: optionalNonEmpty,
  title: optionalNonEmpty,
  url: optionalNonEmpty,
  sourceFile: optionalNonEmpty
});

export const parseSearchRequest = (body: unknown): ApiSearchRequest => {
  const parsed = searchRequestSchema.parse(body);
  return {
    question: parsed.question,
    ...(parsed.topK === undefined ? {} : { topK: parsed.topK }),
    ...(parsed.threshold === undefined ? {} : { threshold: parsed.threshold }),
    ...(parsed.language === undefined ? {} : { language: parsed.language }),
    ...(parsed.documentId === undefined ? {} : { documentId: parsed.documentId }),
    ...(parsed.title === undefined ? {} : { title: parsed.title }),
    ...(parsed.url === undefined ? {} : { url: parsed.url }),
    ...(parsed.sourceFile === undefined ? {} : { sourceFile: parsed.sourceFile })
  };
};
