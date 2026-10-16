// Recording fakes for the two Supabase clients the admin app uses.
// Every privileged call is logged so tests can prove nothing ran before authorization.

export const ADMIN = "713f6f77-19dd-4dbc-9edc-f8114b9237e4";
export const USER = "22222222-2222-4222-8222-222222222222";
export const CAPTION = "44444444-4444-4444-8444-444444444444";
export const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

/** The visitor's session client: only auth.getUser / getClaims / exchange / signOut. */
export function sessionClient({ user = null, error = null, throws = false } = {}) {
  const calls = [];
  return {
    calls,
    client: {
      auth: {
        getUser: async () => { calls.push("getUser"); if (throws) throw new Error("network"); return { data: { user }, error }; },
        getClaims: async () => { calls.push("getClaims"); return { data: user ? { claims: { sub: user.id } } : null, error }; },
        exchangeCodeForSession: async (code) => { calls.push(["exchange", code]); return { error }; },
        signOut: async (options) => { calls.push(["signOut", options]); return { error: null }; },
      },
    },
  };
}

/**
 * Service-role fake. `respond(table, ops)` returns { data, error, count } for a
 * query; ops is the list of [method, ...args] calls made on the builder.
 */
export function privilegedClient(respond = () => ({ data: null, error: null }), { users = [], download = { data: new Blob([JPEG]), error: null } } = {}) {
  const calls = [];
  const builder = (table) => {
    const ops = [];
    const record = (op) => (...args) => { ops.push([op, ...args]); calls.push([table, op, ...args]); return query; };
    const resolve = () => Promise.resolve(respond(table, ops));
    const query = {};
    for (const op of ["select", "insert", "update", "delete", "upsert", "eq", "in", "gte", "ilike", "order", "range", "limit", "is"]) query[op] = record(op);
    query.maybeSingle = () => { ops.push(["maybeSingle"]); return resolve(); };
    query.single = () => { ops.push(["single"]); return resolve(); };
    query.then = (ok, fail) => resolve().then(ok, fail);
    return query;
  };
  return {
    calls,
    client: {
      from: (table) => { calls.push([table, "from"]); return builder(table); },
      auth: { admin: { listUsers: async () => { calls.push(["auth", "listUsers"]); return { data: { users }, error: null }; } } },
      storage: {
        from: (bucket) => ({
          download: async (path) => { calls.push(["storage", "download", bucket, path]); return download; },
          remove: async (paths) => { calls.push(["storage", "remove", bucket, paths]); return { data: [], error: null }; },
          createSignedUrls: async (paths) => { calls.push(["storage", "signMany", bucket, paths]); return { data: paths.map((path) => ({ path, signedUrl: `https://signed.example/${path}`, error: null })), error: null }; },
        }),
      },
    },
  };
}

/** Respond to the caption_lab_admins lookup; everything else via `rest`. */
export function adminLookup(isSuperadmin, rest = () => ({ data: null, error: null })) {
  return (table, ops) => {
    if (table === "caption_lab_admins") {
      if (isSuperadmin === "error") return { data: null, error: { message: "boom" } };
      return { data: isSuperadmin === null ? null : { is_superadmin: isSuperadmin }, error: null };
    }
    return rest(table, ops);
  };
}

export const plain = (value) => JSON.parse(JSON.stringify(value));
