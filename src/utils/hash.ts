import { createHash } from "node:crypto";

export const sha256 = (value: string): string => createHash("sha256").update(value).digest("hex");

export const shortHash = (value: string): string => sha256(value).slice(0, 16);
