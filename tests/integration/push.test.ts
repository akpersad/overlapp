import { beforeEach, describe, expect, it } from "vitest";

import { newUserClient, resetData, serviceClient } from "./_helpers";

// Feature: Web Push subscriptions (Phase 4). The owner self-manages their
// device rows (RLS); the server (service role) reads every row to send. These
// assert the privacy boundary: a user can't read or write another user's
// subscriptions, but the service role can see all.

function sub(endpoint: string) {
  return { endpoint, p256dh: "p256dh-key", auth: "auth-secret" };
}

describe("push_subscriptions — self-manage RLS", () => {
  beforeEach(resetData);

  it("a user can save and read their own subscription", async () => {
    const user = await newUserClient();
    const { error } = await user.client
      .from("push_subscriptions")
      .insert({ user_id: user.id, ...sub("https://push.example/a") });
    expect(error).toBeNull();

    const { data } = await user.client
      .from("push_subscriptions")
      .select("endpoint");
    expect(data).toHaveLength(1);
    expect(data?.[0].endpoint).toBe("https://push.example/a");
  });

  it("a user cannot insert a subscription for someone else", async () => {
    const user = await newUserClient();
    const other = await newUserClient();
    const { error } = await user.client
      .from("push_subscriptions")
      .insert({ user_id: other.id, ...sub("https://push.example/b") });
    expect(error).not.toBeNull();
  });

  it("a user cannot read another user's subscriptions", async () => {
    const owner = await newUserClient();
    await owner.client
      .from("push_subscriptions")
      .insert({ user_id: owner.id, ...sub("https://push.example/c") });

    const snooper = await newUserClient();
    const { data } = await snooper.client
      .from("push_subscriptions")
      .select("endpoint");
    expect(data ?? []).toHaveLength(0);
  });

  it("a user can delete their own subscription", async () => {
    const user = await newUserClient();
    await user.client
      .from("push_subscriptions")
      .insert({ user_id: user.id, ...sub("https://push.example/d") });
    await user.client
      .from("push_subscriptions")
      .delete()
      .eq("endpoint", "https://push.example/d");
    const { data } = await user.client.from("push_subscriptions").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("endpoint is globally unique (one row per device)", async () => {
    const user = await newUserClient();
    const insert = () =>
      user.client
        .from("push_subscriptions")
        .insert({ user_id: user.id, ...sub("https://push.example/dup") });
    expect((await insert()).error).toBeNull();
    expect((await insert()).error).not.toBeNull();
  });

  it("the service role can read every user's subscriptions (the sender path)", async () => {
    const a = await newUserClient();
    const b = await newUserClient();
    await a.client
      .from("push_subscriptions")
      .insert({ user_id: a.id, ...sub("https://push.example/sa") });
    await b.client
      .from("push_subscriptions")
      .insert({ user_id: b.id, ...sub("https://push.example/sb") });

    const svc = serviceClient();
    const { data } = await svc
      .from("push_subscriptions")
      .select("endpoint")
      .in("user_id", [a.id, b.id]);
    expect(data ?? []).toHaveLength(2);
  });
});
