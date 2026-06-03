import { beforeEach, describe, expect, it } from "vitest";

import { createUser, newUserClient, resetData, serviceClient } from "./_helpers";

// Feature: identity. A signup mirrors auth.users → public.profiles via the
// handle_new_user trigger; profiles are self-read/write, and readable by
// co-members only (the latter is covered in groups.test.ts).
describe("profiles — signup trigger + RLS", () => {
  beforeEach(resetData);

  it("mirrors a new auth user into profiles via the signup trigger", async () => {
    const user = await createUser({ firstName: "Mara", lastName: "Member" });

    const { data, error } = await serviceClient()
      .from("profiles")
      .select("id, email, first_name, last_name, time_zone")
      .eq("id", user.id)
      .single();

    expect(error).toBeNull();
    expect(data).toMatchObject({
      id: user.id,
      email: user.email,
      first_name: "Mara",
      last_name: "Member",
      time_zone: "UTC",
    });
  });

  it("lets a user read and update their own profile", async () => {
    const user = await newUserClient();

    const { data: own } = await user.client
      .from("profiles")
      .select("id, display_name")
      .eq("id", user.id)
      .single();
    expect(own?.id).toBe(user.id);

    const { error: updateError } = await user.client
      .from("profiles")
      .update({ display_name: "Mar" })
      .eq("id", user.id);
    expect(updateError).toBeNull();

    const { data: updated } = await user.client
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .single();
    expect(updated?.display_name).toBe("Mar");
  });

  it("hides other users' profiles when no group is shared (RLS)", async () => {
    const me = await newUserClient();
    const stranger = await createUser();

    const { data, error } = await me.client
      .from("profiles")
      .select("id")
      .eq("id", stranger.id);

    expect(error).toBeNull(); // RLS filters rows, it does not error
    expect(data).toHaveLength(0);
  });

  it("cannot update another user's profile (RLS)", async () => {
    const me = await newUserClient();
    const other = await createUser();

    await me.client
      .from("profiles")
      .update({ display_name: "hacked" })
      .eq("id", other.id);

    const { data } = await serviceClient()
      .from("profiles")
      .select("display_name")
      .eq("id", other.id)
      .single();
    expect(data?.display_name).toBeNull(); // unchanged — no matching writable row
  });
});
