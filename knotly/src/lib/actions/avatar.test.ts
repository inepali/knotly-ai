import { describe, expect, it } from "vitest";
import { removeAvatar, saveAvatar } from "./avatar";

// A small stand-in for the Supabase client that records what happened, in order.
function fakeSb({ oldPath = null as string | null, updateError = null as { message: string } | null } = {}) {
  const calls: string[] = [];
  const sb = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { avatar_path: oldPath } }) }) }),
      update: (patch: unknown) => ({
        eq: async () => {
          calls.push(`update:${JSON.stringify(patch)}`);
          return { error: updateError };
        },
      }),
    }),
    storage: {
      from: () => ({
        upload: async (path: string) => {
          calls.push(`upload:${path}`);
          return { error: null };
        },
        remove: async (paths: string[]) => {
          calls.push(`remove:${paths.join(",")}`);
          return { error: null };
        },
        createSignedUrl: async () => ({ data: { signedUrl: "https://x/y" } }),
      }),
    },
  };
  return { sb: sb as never, calls };
}

const photo = (type = "image/jpeg", size = 1000) => new File([new Uint8Array(size)], "me", { type });

describe("saveAvatar", () => {
  it("needs a real file of an allowed type and size", async () => {
    const { sb, calls } = fakeSb();
    expect((await saveAvatar(sb, "u1", undefined)).ok).toBe(false);
    expect((await saveAvatar(sb, "u1", "not a file")).ok).toBe(false);
    expect((await saveAvatar(sb, "u1", photo("image/gif"))).ok).toBe(false);
    expect((await saveAvatar(sb, "u1", photo("image/png", 900_000))).ok).toBe(false);
    expect(calls).toEqual([]);
  });

  it("uploads into the person's own folder, points the profile at it, then removes the old photo", async () => {
    const { sb, calls } = fakeSb({ oldPath: "u1/avatar-1.jpg" });
    const r = await saveAvatar(sb, "u1", photo());
    expect(r.ok).toBe(true);
    expect(calls[0]).toMatch(/^upload:u1\/avatar-\d+\.jpg$/);
    expect(calls[1]).toMatch(/^update:\{"avatar_path":"u1\/avatar-\d+\.jpg"\}$/);
    expect(calls[2]).toBe("remove:u1/avatar-1.jpg");
  });

  it("cleans up the new file if the profile can't be updated", async () => {
    const { sb, calls } = fakeSb({ updateError: { message: "nope" } });
    const r = await saveAvatar(sb, "u1", photo("image/webp"));
    expect(r).toEqual({ ok: false, error: "nope" });
    expect(calls[2]).toMatch(/^remove:u1\/avatar-\d+\.webp$/);
  });
});

describe("removeAvatar", () => {
  it("clears the profile and deletes the file", async () => {
    const { sb, calls } = fakeSb({ oldPath: "u1/avatar-1.jpg" });
    expect((await removeAvatar(sb, "u1")).ok).toBe(true);
    expect(calls).toEqual(['update:{"avatar_path":null}', "remove:u1/avatar-1.jpg"]);
  });
  it("does nothing when there is no photo", async () => {
    const { sb, calls } = fakeSb();
    expect((await removeAvatar(sb, "u1")).ok).toBe(true);
    expect(calls).toEqual([]);
  });
});
