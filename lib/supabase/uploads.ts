import "server-only";
import { createClient } from "./server";
import { MEDIA_BUCKET } from "../captions/validation";

/** Validation cleanup must obey Storage RLS, including registered-image protection.
 * Explicit admin deletion separately reserves an unreferenced registry entry.
 */
export async function discardUnregisteredUpload(path: string): Promise<boolean> {
  try {
    const session = await createClient({ writable: true });
    const { data, error } = await session.storage.from(MEDIA_BUCKET).remove([path]);
    return !error && Boolean(data?.some(object => object.name === path));
  } catch {
    return false;
  }
}
