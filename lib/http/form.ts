import { isUploadedFile } from "@/lib/http/upload";

export interface ParsedBody {
  /** String fields (empty strings preserved). */
  fields: Record<string, string>;
  /** Return a non-empty uploaded file for the given key, or null. */
  file: (key: string) => File | null;
  /** True when the field was present in the request at all. */
  has: (key: string) => boolean;
}

/** Parse a request body as either multipart/form-data or JSON into a uniform shape. */
export async function parseBody(req: Request): Promise<ParsedBody> {
  const ct = req.headers.get("content-type") ?? "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const fields: Record<string, string> = {};
    const files: Record<string, File> = {};
    for (const [k, v] of form.entries()) {
      if (typeof v === "string") fields[k] = v;
      else if (isUploadedFile(v)) files[k] = v;
    }
    return {
      fields,
      file: (key) => files[key] ?? null,
      has: (key) => key in fields || key in files,
    };
  }
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const fields: Record<string, string> = {};
  for (const [k, v] of Object.entries(body)) if (v !== null && v !== undefined) fields[k] = String(v);
  return { fields, file: () => null, has: (key) => key in body };
}
