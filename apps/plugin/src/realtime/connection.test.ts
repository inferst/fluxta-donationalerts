import { describe, expect, it, vi } from "vitest";

import { Unauthorized, type DonationAlertsApi } from "../donationalerts/api";
import type {
  PrivateSubscribe,
  RealtimeClient,
  SubscriptionHandlers,
} from "./client";
import { donationChannel, RealtimeConnection } from "./connection";

const ACCOUNT = { id: 10111687, accessToken: "access-token" };
const CHANNEL = donationChannel(ACCOUNT.id);

/** A centrifuge-js client that does only what the test makes it do. */
class FakeClient implements RealtimeClient {
  token: string | undefined;
  connected = false;
  disconnected = false;
  handlers = new Map<string, SubscriptionHandlers>();
  resubscribes = 0;
  private onDisconnect: (ctx: { reason: string; reconnect: boolean }) => void =
    () => {};

  constructor(readonly authorize: PrivateSubscribe) {}

  setToken(token: string) {
    this.token = token;
  }
  connect() {
    this.connected = true;
  }
  disconnect() {
    this.disconnected = true;
  }
  on(
    _event: "disconnect",
    listener: (ctx: { reason: string; reconnect: boolean }) => void,
  ) {
    this.onDisconnect = listener;
  }
  subscribe(channel: string, handlers: SubscriptionHandlers) {
    this.handlers.set(channel, handlers);
    return { subscribe: () => void this.resubscribes++ };
  }

  /** What centrifuge-js does on connecting: ask for the channel tokens. */
  askForTokens(client: string) {
    return new Promise<{ status: number; data: unknown }>((resolve) =>
      this.authorize({ data: { client, channels: [CHANNEL] } }, resolve),
    );
  }
  drop(reason: string, reconnect: boolean) {
    this.onDisconnect({ reason, reconnect });
  }
  channel() {
    return this.handlers.get(CHANNEL)!;
  }
}

function manualTimers() {
  const pending: { run: () => void; ms: number }[] = [];
  return {
    pending,
    schedule(ms: number, run: () => void) {
      const timer = { run, ms };
      pending.push(timer);
      return () => {
        const index = pending.indexOf(timer);
        if (index !== -1) pending.splice(index, 1);
      };
    },
    runNext() {
      pending.shift()?.run();
    },
  };
}

function setup() {
  const clients: FakeClient[] = [];
  const timers = manualTimers();
  const api = {
    getUser: vi.fn<DonationAlertsApi["getUser"]>(async () => ({
      id: ACCOUNT.id,
      name: "MikeRime",
      avatar: "",
      socketConnectionToken: "socket-token",
    })),
    subscribeChannels: vi.fn<DonationAlertsApi["subscribeChannels"]>(
      async (_token, { channels }) =>
        channels.map((channel) => ({ channel, token: `token-for-${channel}` })),
    ),
  };
  const onDonation = vi.fn();
  const connection = new RealtimeConnection({
    api,
    createClient: (authorize) => {
      const client = new FakeClient(authorize);
      clients.push(client);
      return client;
    },
    schedule: timers.schedule,
    random: () => 0,
    onDonation,
    onChange: () => {},
  });
  return { connection, clients, timers, api, onDonation };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("RealtimeConnection", () => {
  it("connects with a fresh socket token and subscribes the donation channel", async () => {
    const { connection, clients, api } = setup();
    connection.follow(ACCOUNT);
    expect(connection.state()).toEqual({ status: "connecting" });
    await settle();

    expect(api.getUser).toHaveBeenCalledWith("access-token");
    const [client] = clients;
    expect(client?.token).toBe("socket-token");
    expect(client?.connected).toBe(true);
    expect([...client!.handlers.keys()]).toEqual(["$alerts:donation_10111687"]);
  });

  it("answers the private subscribe with this client's channel tokens", async () => {
    const { connection, clients, api } = setup();
    connection.follow(ACCOUNT);
    await settle();

    const response = await clients[0]!.askForTokens("client-1");

    expect(api.subscribeChannels).toHaveBeenCalledWith("access-token", {
      client: "client-1",
      channels: [CHANNEL],
    });
    expect(response).toEqual({
      status: 200,
      data: {
        channels: [{ channel: CHANNEL, token: `token-for-${CHANNEL}` }],
      },
    });
  });

  it("is connected once subscribed, and hands on every publication", async () => {
    const { connection, clients, onDonation } = setup();
    connection.follow(ACCOUNT);
    await settle();
    const channel = clients[0]!.channel();

    channel.subscribe({ isResubscribe: false, recovered: false });
    expect(connection.state()).toEqual({ status: "connected" });

    channel.publish({ data: { id: 1 } });
    expect(onDonation).toHaveBeenCalledWith({ id: 1 });
  });

  it("reports a drop and comes back when centrifuge-js resubscribes", async () => {
    const { connection, clients, api } = setup();
    connection.follow(ACCOUNT);
    await settle();
    const client = clients[0]!;
    client.channel().subscribe({ isResubscribe: false, recovered: false });

    client.drop("insufficient state", true);
    expect(connection.state()).toEqual({
      status: "reconnecting",
      reason: "insufficient state",
    });

    // A reconnect is a new client id, so new channel tokens.
    await client.askForTokens("client-2");
    expect(api.subscribeChannels).toHaveBeenLastCalledWith("access-token", {
      client: "client-2",
      channels: [CHANNEL],
    });
    client.channel().subscribe({ isResubscribe: true, recovered: true });
    expect(connection.state()).toEqual({ status: "connected" });
  });

  it("retries fetching the socket token until DonationAlerts answers", async () => {
    const { connection, clients, timers, api } = setup();
    api.getUser.mockRejectedValueOnce(new Error("DonationAlerts answered 502"));
    connection.follow(ACCOUNT);
    await settle();

    expect(connection.state()).toEqual({
      status: "reconnecting",
      reason: "DonationAlerts answered 502",
    });
    expect(clients).toHaveLength(0);
    expect(timers.pending[0]?.ms).toBe(1_000);

    timers.runNext();
    await settle();
    expect(clients).toHaveLength(1);
  });

  it("starts over with a fresh socket token when the server will not take the client back", async () => {
    const { connection, clients, timers, api } = setup();
    connection.follow(ACCOUNT);
    await settle();

    clients[0]!.drop("invalid token", false);
    expect(clients[0]!.disconnected).toBe(true);
    expect(connection.state()).toMatchObject({ status: "reconnecting" });

    timers.runNext();
    await settle();
    expect(api.getUser).toHaveBeenCalledTimes(2);
    expect(clients).toHaveLength(2);
  });

  it("retries a refused subscription", async () => {
    const { connection, clients, timers, api } = setup();
    api.subscribeChannels.mockRejectedValueOnce(new Error("answered 500"));
    connection.follow(ACCOUNT);
    await settle();
    const client = clients[0]!;

    expect(await client.askForTokens("client-1")).toMatchObject({
      status: 503,
    });
    client.channel().error({ message: "authorization request failed" });
    expect(connection.state()).toEqual({
      status: "reconnecting",
      reason: "authorization request failed",
    });

    timers.runNext();
    expect(client.resubscribes).toBe(1);
  });

  it("stops for good when DonationAlerts refuses the token", async () => {
    const { connection, clients, timers, api } = setup();
    api.getUser.mockRejectedValueOnce(new Unauthorized());
    connection.follow(ACCOUNT);
    await settle();

    expect(connection.state()).toEqual({
      status: "stopped",
      reason: "DonationAlerts no longer accepts this sign-in",
    });
    expect(timers.pending).toHaveLength(0);
    expect(clients).toHaveLength(0);

    // The same Account again is not a reason to retry; a new token is.
    connection.follow(ACCOUNT);
    expect(connection.state()).toMatchObject({ status: "stopped" });
    connection.follow({ ...ACCOUNT, accessToken: "new-token" });
    expect(connection.state()).toEqual({ status: "connecting" });
  });

  it("stops when a channel token is refused for the token", async () => {
    const { connection, clients, api } = setup();
    api.subscribeChannels.mockRejectedValueOnce(new Unauthorized());
    connection.follow(ACCOUNT);
    await settle();

    void clients[0]!.askForTokens("client-1");
    await settle();

    expect(clients[0]!.disconnected).toBe(true);
    expect(connection.state()).toMatchObject({ status: "stopped" });
  });

  it("disconnects on sign out and ignores the old client afterwards", async () => {
    const { connection, clients, onDonation } = setup();
    connection.follow(ACCOUNT);
    await settle();
    const client = clients[0]!;

    connection.follow(undefined);
    expect(client.disconnected).toBe(true);
    expect(connection.state()).toBeUndefined();

    client.channel().subscribe({ isResubscribe: false, recovered: false });
    client.channel().publish({ data: { id: 1 } });
    expect(connection.state()).toBeUndefined();
    expect(onDonation).not.toHaveBeenCalled();
  });

  it("leaves a running connection alone for the same Account", async () => {
    const { connection, clients } = setup();
    connection.follow(ACCOUNT);
    await settle();

    connection.follow({ ...ACCOUNT });
    await settle();

    expect(clients).toHaveLength(1);
    expect(clients[0]!.disconnected).toBe(false);
  });
});
