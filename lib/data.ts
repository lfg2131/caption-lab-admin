import "server-only";
import type { PrivilegedClient } from "./supabase/privileged";
import { MEDIA_BUCKET } from "./captions/validation";

// Read models for the admin pages. Every loader takes the privileged client
// that only requireAdmin()/assertAdmin() hand out, so data cannot be loaded
// without passing both checks first. Only Caption Lab tables plus a few
// display fields of auth users/profiles are read; nothing else in the shared
// database (health, messaging, payments...) is touched.

export const PAGE_SIZE = 25;
const SIGNED_URL_SECONDS = 60 * 30;
const ACTIVITY_DAYS = 14;

export type Person = { id: string; email: string | null; name: string | null; provider: string | null; createdAt: string; lastSignInAt: string | null };

/** Auth users (email, provider, dates) as a lookup. A class-sized project fits in one page. */
export async function loadPeople(db: PrivilegedClient): Promise<Map<string, Person>> {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error("Failed to load users");
  return new Map(data.users.map((user) => [user.id, {
    id: user.id,
    email: user.email ?? null,
    name: (user.user_metadata?.full_name as string | undefined) ?? (user.user_metadata?.name as string | undefined) ?? null,
    provider: (user.app_metadata?.provider as string | undefined) ?? null,
    createdAt: user.created_at,
    lastSignInAt: user.last_sign_in_at ?? null,
  }]));
}

async function count(query: PromiseLike<{ count: number | null; error: unknown }>) {
  const { count: value, error } = await query;
  if (error) throw new Error("Failed to load statistics");
  return value ?? 0;
}

/** "2026-10-16" in New York time, the class's time zone. */
export function nyDay(iso: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

/** The last `days` New York calendar days, oldest first, with zero-filled counts. */
export function bucketByDay(captions: string[], votes: string[], now = new Date(), days = ACTIVITY_DAYS) {
  const buckets = new Map<string, { day: string; captions: number; votes: number }>();
  for (let offset = days - 1; offset >= 0; offset--) {
    const day = nyDay(new Date(now.getTime() - offset * 86_400_000));
    buckets.set(day, { day, captions: 0, votes: 0 });
  }
  for (const at of captions) { const bucket = buckets.get(nyDay(at)); if (bucket) bucket.captions++; }
  for (const at of votes) { const bucket = buckets.get(nyDay(at)); if (bucket) bucket.votes++; }
  return [...buckets.values()];
}

export async function loadStats(db: PrivilegedClient, now = new Date()) {
  const since = new Date(now.getTime() - (ACTIVITY_DAYS + 1) * 86_400_000).toISOString();
  const [people, profiles, captions, votes, funny, notFunny, student, professor, images, recentCaptionTimes, recentVoteTimes, latestCaptions, latestVotes] = await Promise.all([
    loadPeople(db),
    count(db.from("profiles").select("id", { count: "exact", head: true })),
    count(db.from("ai_captions").select("id", { count: "exact", head: true })),
    count(db.from("caption_votes").select("id", { count: "exact", head: true })),
    count(db.from("caption_votes").select("id", { count: "exact", head: true }).eq("vote", 1)),
    count(db.from("caption_votes").select("id", { count: "exact", head: true }).eq("vote", -1)),
    count(db.from("ai_captions").select("id", { count: "exact", head: true }).eq("perspective", "student")),
    count(db.from("ai_captions").select("id", { count: "exact", head: true }).eq("perspective", "professor")),
    db.from("ai_captions").select("source_image_path").limit(10_000),
    db.from("ai_captions").select("created_at").gte("created_at", since).limit(10_000),
    db.from("caption_votes").select("created_at").gte("created_at", since).limit(10_000),
    db.from("ai_captions").select("id, caption, perspective, creator_id, created_at").order("created_at", { ascending: false }).limit(5),
    db.from("caption_votes").select("id, vote, user_id, created_at, ai_captions(caption)").order("created_at", { ascending: false }).limit(5),
  ]);
  for (const result of [images, recentCaptionTimes, recentVoteTimes, latestCaptions, latestVotes]) {
    if (result.error) throw new Error("Failed to load statistics");
  }
  const imageRows = (images.data ?? []) as { source_image_path: string }[];
  const creators = new Set(((latestCaptions.data ?? []) as { creator_id: string }[]).map((row) => row.creator_id));
  return {
    users: people.size,
    profiles,
    captions,
    images: new Set(imageRows.map((row) => row.source_image_path)).size,
    votes,
    funny,
    notFunny,
    student,
    professor,
    activity: bucketByDay(
      ((recentCaptionTimes.data ?? []) as { created_at: string }[]).map((row) => row.created_at),
      ((recentVoteTimes.data ?? []) as { created_at: string }[]).map((row) => row.created_at),
      now,
    ),
    latestCaptions: ((latestCaptions.data ?? []) as { id: string; caption: string; perspective: string; creator_id: string; created_at: string }[])
      .map((row) => ({ ...row, creator: people.get(row.creator_id) ?? null })),
    latestVotes: ((latestVotes.data ?? []) as unknown as { id: string; vote: number; user_id: string; created_at: string; ai_captions: { caption: string } | null }[])
      .map((row) => ({ id: row.id, vote: row.vote, createdAt: row.created_at, caption: row.ai_captions?.caption ?? null, voter: people.get(row.user_id) ?? null })),
    activeCreators: creators.size,
  };
}

export type UserRow = Person & {
  profile: { username: string | null; name: string | null; firstName: string | null; lastName: string | null; createdAt: string | null } | null;
  captions: number;
  votes: number;
};

export function matchesSearch(values: (string | null | undefined)[], query: string) {
  const needle = query.trim().toLowerCase();
  return !needle || values.some((value) => value?.toLowerCase().includes(needle));
}

/** Registered users with their profile display fields and Caption Lab activity. Read-only. */
export async function loadUsers(db: PrivilegedClient, { query = "", page = 1 } = {}) {
  const people = [...(await loadPeople(db)).values()];
  const ids = people.map((person) => person.id);
  const [profiles, captions, votes] = await Promise.all([
    // Display fields only: no bios, health, privacy, messaging, or notification settings.
    db.from("profiles").select("id, username, name, first_name, last_name, created_at").in("id", ids),
    db.from("ai_captions").select("creator_id").limit(10_000),
    db.from("caption_votes").select("user_id").limit(10_000),
  ]);
  if (profiles.error || captions.error || votes.error) throw new Error("Failed to load users");
  const profileById = new Map(((profiles.data ?? []) as { id: string; username: string | null; name: string | null; first_name: string | null; last_name: string | null; created_at: string | null }[])
    .map((row) => [row.id, { username: row.username, name: row.name, firstName: row.first_name, lastName: row.last_name, createdAt: row.created_at }]));
  const tally = (rows: Record<string, string>[], key: string) => rows.reduce((map, row) => map.set(row[key], (map.get(row[key]) ?? 0) + 1), new Map<string, number>());
  const captionCounts = tally((captions.data ?? []) as Record<string, string>[], "creator_id");
  const voteCounts = tally((votes.data ?? []) as Record<string, string>[], "user_id");

  const rows: UserRow[] = people
    .map((person) => ({ ...person, profile: profileById.get(person.id) ?? null, captions: captionCounts.get(person.id) ?? 0, votes: voteCounts.get(person.id) ?? 0 }))
    .filter((row) => matchesSearch([row.email, row.name, row.profile?.username, row.profile?.name, row.profile?.firstName, row.profile?.lastName], query))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return paginate(rows, page);
}

export function paginate<T>(rows: T[], page: number) {
  const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(Math.max(1, Math.floor(page) || 1), pages);
  return { rows: rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE), total: rows.length, page: current, pages };
}

export type MediaRow = {
  id: string;
  batch_id: string;
  caption: string;
  source_image_path: string;
  image_alt: string | null;
  tone: string | null;
  perspective: string;
  model: string;
  generation_prompt: string;
  user_context: string | null;
  creator_id: string;
  created_at: string;
};

async function signImages(db: PrivilegedClient, paths: string[]) {
  const urls = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (!unique.length) return urls;
  const { data } = await db.storage.from(MEDIA_BUCKET).createSignedUrls(unique, SIGNED_URL_SECONDS);
  for (const entry of data ?? []) if (entry.path && entry.signedUrl && !entry.error) urls.set(entry.path, entry.signedUrl);
  return urls;
}

/** AI-generated captions with image, creator, prompt/model, and their vote tallies. */
export async function loadMedia(db: PrivilegedClient, { query = "", page = 1 } = {}) {
  let request = db
    .from("ai_captions")
    .select("id, batch_id, caption, source_image_path, image_alt, tone, perspective, model, generation_prompt, user_context, creator_id, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  const needle = query.trim().replace(/[%_,()\\]/g, " ").trim();
  if (needle) request = request.ilike("caption", `%${needle}%`);
  const current = Math.max(1, Math.floor(page) || 1);
  const { data, count: total, error } = await request.range((current - 1) * PAGE_SIZE, current * PAGE_SIZE - 1);
  if (error) throw new Error("Failed to load media");
  const rows = (data ?? []) as MediaRow[];

  const ids = rows.map((row) => row.id);
  const [people, urls, votes, shared] = await Promise.all([
    loadPeople(db),
    signImages(db, rows.map((row) => row.source_image_path)),
    ids.length ? db.from("caption_votes").select("caption_id, vote").in("caption_id", ids) : Promise.resolve({ data: [], error: null }),
    rows.length ? db.from("ai_captions").select("source_image_path").in("source_image_path", [...new Set(rows.map((row) => row.source_image_path))]) : Promise.resolve({ data: [], error: null }),
  ]);
  if (votes.error || shared.error) throw new Error("Failed to load media");
  const tallies = new Map<string, { funny: number; notFunny: number }>();
  for (const vote of (votes.data ?? []) as { caption_id: string; vote: number }[]) {
    const tally = tallies.get(vote.caption_id) ?? { funny: 0, notFunny: 0 };
    if (vote.vote === 1) tally.funny++; else tally.notFunny++;
    tallies.set(vote.caption_id, tally);
  }
  const usage = new Map<string, number>();
  for (const row of (shared.data ?? []) as { source_image_path: string }[]) usage.set(row.source_image_path, (usage.get(row.source_image_path) ?? 0) + 1);

  return {
    rows: rows.map((row) => ({
      ...row,
      imageUrl: urls.get(row.source_image_path) ?? null,
      creator: people.get(row.creator_id) ?? null,
      funny: tallies.get(row.id)?.funny ?? 0,
      notFunny: tallies.get(row.id)?.notFunny ?? 0,
      imageShared: (usage.get(row.source_image_path) ?? 1) > 1,
    })),
    total: total ?? 0,
    page: current,
    pages: Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE)),
  };
}

export type VoteFilter = "all" | "funny" | "not-funny";

/** Every vote with the caption it rates and who cast it. Read-only. */
export async function loadVotes(db: PrivilegedClient, { filter = "all" as VoteFilter, oldestFirst = false, page = 1 } = {}) {
  let request = db
    .from("caption_votes")
    .select("id, vote, user_id, caption_id, created_at, ai_captions(caption, perspective)", { count: "exact" })
    .order("created_at", { ascending: oldestFirst });
  if (filter === "funny") request = request.eq("vote", 1);
  if (filter === "not-funny") request = request.eq("vote", -1);
  const current = Math.max(1, Math.floor(page) || 1);
  const { data, count: total, error } = await request.range((current - 1) * PAGE_SIZE, current * PAGE_SIZE - 1);
  if (error) throw new Error("Failed to load votes");
  const people = await loadPeople(db);
  return {
    rows: ((data ?? []) as unknown as { id: string; vote: number; user_id: string; caption_id: string; created_at: string; ai_captions: { caption: string; perspective: string } | null }[])
      .map((row) => ({ id: row.id, vote: row.vote, captionId: row.caption_id, createdAt: row.created_at, caption: row.ai_captions?.caption ?? null, perspective: row.ai_captions?.perspective ?? null, voter: people.get(row.user_id) ?? null, voterId: row.user_id })),
    total: total ?? 0,
    page: current,
    pages: Math.max(1, Math.ceil((total ?? 0) / PAGE_SIZE)),
  };
}
