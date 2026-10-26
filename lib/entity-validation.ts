import { ENTITIES, type EntityKey, type Entity } from "./entities";
import { countWords, isUuid } from "./captions/validation";

export function validateEntity(key: EntityKey, form: FormData): { values: Record<string, string | boolean | null>; error?: never } | { error: string; values?: never } {
  const entity: Entity = ENTITIES[key];
  const values: Record<string, string | boolean | null> = {};
  for (const field of entity.fields) {
    if (field.kind === "boolean") { values[field.key] = form.get(field.key) === "on"; continue; }
    const raw = form.get(field.key);
    if (raw !== null && typeof raw !== "string") return { error: `${field.label} must be text.` };
    let value = (raw as string | null)?.trim() ?? "";
    if (key === "signup-domains" || key === "whitelist") value = value.toLowerCase();
    if (!value && field.optional) { values[field.key] = null; continue; }
    if (!value || (field.max && value.length > field.max) || value.includes("\0")) return { error: `${field.label} is required and must fit its length limit.` };
    if ((field.kind === "model" || field.kind === "provider") && !isUuid(value)) return { error: `Choose a valid ${field.kind}.` };
    values[field.key] = value;
  }
  if (key === "providers" && !/^[a-z0-9-]{1,80}$/.test(values.slug as string)) return { error: "Use a lowercase provider identifier: letters, numbers and hyphens." };
  if (key === "models" && !/^[a-z0-9.-]{1,100}$/.test(values.model_key as string)) return { error: "Invalid model key." };
  if (key === "examples" && countWords(values.caption as string) > 10) return { error: "Reference captions must have at most 10 words." };
  const domainOK = (domain: string) => domain.length <= 253 && domain.includes(".") && domain.split(".").every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) && /^[a-z]{2,63}$/.test(domain.split(".").at(-1)!);
  if (key === "signup-domains" && !domainOK(values.domain as string)) return { error: "Enter a domain such as example.edu, without a URL or @." };
  if (key === "whitelist") {
    const email = values.email as string;
    const parts = email.split("@");
    if (parts.length !== 2 || parts[0].length > 64 || !/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(parts[0]) || parts[0].startsWith(".") || parts[0].endsWith(".") || parts[0].includes("..") || !domainOK(parts[1])) return { error: "Enter a valid e-mail address." };
  }
  return { values };
}
