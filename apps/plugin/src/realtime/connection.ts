import type { RealtimeState } from "donationalerts-protocol";

import { Unauthorized, type DonationAlertsApi } from "../donationalerts/api";
import type { Schedule } from "../schedule";
import type { PrivateSubscribe, RealtimeClient } from "./client";
import { retryDelay } from "./retry";

/** What the Realtime Connection needs of the signed-in Account. */
export type RealtimeAccount = { id: number; accessToken: string };

export type RealtimeConnectionDeps = {
  api: Pick<DonationAlertsApi, "getUser" | "subscribeChannels">;
  createClient(onPrivateSubscribe: PrivateSubscribe): RealtimeClient;
  schedule: Schedule;
  random?: () => number;
  /** A publication on the Account's donation channel, as Centrifugo sent it. */
  onDonation(data: unknown): void;
  /** Called whenever what `state()` returns may have changed. */
  onChange(): void;
};

export function donationChannel(accountId: number): string {
  return `$alerts:donation_${accountId}`;
}

/**
 * The plugin's one link to DonationAlerts' Centrifugo, for the signed-in
 * Account.
 *
 * Dropping is normal and is retried without end: centrifuge-js reconnects and
 * resubscribes on its own (each time with a new client id, so new channel
 * tokens through `onPrivateSubscribe`); what it does not retry — fetching the
 * socket token, a refused subscription, a server that will not take the
 * client back — is retried here on the same curve. Only DonationAlerts
 * refusing the Account's token stops it.
 */
export class RealtimeConnection {
  private account: RealtimeAccount | undefined;
  private client: RealtimeClient | undefined;
  private current: RealtimeState | undefined;
  /** Bumped on every teardown, so callbacks of an abandoned client are ignored. */
  private generation = 0;
  private attempt = 0;
  private cancelRetry: (() => void) | undefined;

  constructor(private readonly deps: RealtimeConnectionDeps) {}

  state(): RealtimeState | undefined {
    return this.current;
  }

  /**
   * Keeps the connection on the given Account: starts for a new one or a new
   * token, stops when there is none, and leaves a running one alone.
   */
  follow(account: RealtimeAccount | undefined): void {
    if (
      account?.id === this.account?.id &&
      account?.accessToken === this.account?.accessToken
    ) {
      return;
    }

    this.teardown();
    this.account = account;
    this.attempt = 0;

    if (!account) {
      this.set(undefined);
      return;
    }

    this.set({ status: "connecting" });
    void this.start(account);
  }

  private async start(account: RealtimeAccount): Promise<void> {
    const generation = this.generation;
    const live = () => generation === this.generation;

    let socketToken: string;

    try {
      // Fetched afresh for every client: it is never persisted.
      socketToken = (await this.deps.api.getUser(account.accessToken))
        .socketConnectionToken;
    } catch (error) {
      if (live()) {
        this.fail(error, () => void this.start(account));
      }
      return;
    }

    if (!live()) {
      return;
    }

    const client = this.deps.createClient((ctx, respond) => {
      this.deps.api.subscribeChannels(account.accessToken, ctx.data).then(
        (channels) => respond({ status: 200, data: { channels } }),
        (error: unknown) => {
          if (live() && error instanceof Unauthorized) {
            this.fail(error, () => {});
            return;
          }
          // Answered as a failure, which the client reports as the
          // subscription's error — retried there.
          respond({ status: 503, data: { channels: [] } });
        },
      );
    });
    this.client = client;

    client.on("disconnect", ({ reason, reconnect }) => {
      if (!live()) {
        return;
      }

      if (reconnect) {
        this.set({ status: "reconnecting", reason });
        return;
      }

      // The server will not take this client back — its socket token may
      // have gone stale. Start over with a fresh one.
      this.teardown();
      this.retry(reason, () => void this.start(account));
    });

    const subscription = client.subscribe(donationChannel(account.id), {
      publish: ({ data }) => {
        if (live()) {
          this.deps.onDonation(data);
        }
      },
      subscribe: () => {
        if (live()) {
          this.attempt = 0;
          this.set({ status: "connected" });
        }
      },
      error: ({ message }) => {
        if (live()) {
          this.retry(message, () => subscription.subscribe());
        }
      },
    });

    client.setToken(socketToken);
    client.connect();
  }

  private fail(error: unknown, retry: () => void): void {
    if (error instanceof Unauthorized) {
      // Waiting will not fix it: stop until the Account signs in again.
      this.teardown();
      this.set({ status: "stopped", reason: error.message });
      return;
    }

    this.retry(error instanceof Error ? error.message : String(error), retry);
  }

  private retry(reason: string, again: () => void): void {
    this.set({ status: "reconnecting", reason });
    this.cancelRetry?.();

    const generation = this.generation;
    this.cancelRetry = this.deps.schedule(
      retryDelay(this.attempt++, this.deps.random),
      () => {
        if (generation === this.generation) {
          again();
        }
      },
    );
  }

  private teardown(): void {
    this.generation++;
    this.cancelRetry?.();
    this.cancelRetry = undefined;
    this.client?.disconnect();
    this.client = undefined;
  }

  private set(state: RealtimeState | undefined): void {
    this.current = state;
    this.deps.onChange();
  }
}
