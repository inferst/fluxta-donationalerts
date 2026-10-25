import { randomBytes } from "node:crypto";

import type { AccountState } from "donationalerts-protocol";

import type { DonationAlertsApi } from "../donationalerts/api";
import {
  authorizeUrl,
  LOOPBACK_PORT,
  SIGN_IN_TIMEOUT_MS,
} from "../donationalerts/config";
import {
  PortInUse,
  type Loopback,
  type SignInAnswer,
} from "../donationalerts/loopback";
import type { Schedule } from "../schedule";
import type { AccountStore } from "./store";

export type AccountServiceDeps = {
  store: AccountStore;
  api: DonationAlertsApi;
  openLoopback(options: { port: number; state: string }): Promise<Loopback>;
  openBrowser(url: string): void;
  now(): number;
  schedule: Schedule;
  /** Called whenever what `state()` returns may have changed. */
  onChange(): void;
};

type Outcome = SignInAnswer | { kind: "timeout" } | { kind: "cancelled" };

type SignIn = {
  authorizeUrl: string;
  end(outcome: Outcome): void;
};

/**
 * The Account and its Sign-in.
 *
 * A Sign-in runs from the editor's press to the browser coming back, or to
 * its timeout or cancellation. Signing in while signed in replaces the
 * Account once the new Sign-in succeeds; until then the old one stays.
 */
export class AccountService {
  private signIn: SignIn | undefined;
  /** Why the last Sign-in failed, until the next one starts. */
  private problem: string | undefined;

  constructor(private readonly deps: AccountServiceDeps) {}

  state(): AccountState {
    if (this.signIn) {
      return { status: "signing-in", authorizeUrl: this.signIn.authorizeUrl };
    }

    const account = this.deps.store.get();

    if (account) {
      return {
        status: "signed-in",
        name: account.name,
        avatar: account.avatar,
        expiresAt: account.expiresAt,
      };
    }

    return this.problem === undefined
      ? { status: "signed-out" }
      : { status: "signed-out", problem: this.problem };
  }

  async startSignIn(): Promise<void> {
    if (this.signIn) {
      // A second press while waiting means the browser did not come up, or
      // its tab was closed: show the consent screen again.
      this.deps.openBrowser(this.signIn.authorizeUrl);
      return;
    }

    this.problem = undefined;
    const state = randomBytes(16).toString("hex");
    const url = authorizeUrl(state);

    let loopback: Loopback;

    try {
      loopback = await this.deps.openLoopback({ port: LOOPBACK_PORT, state });
    } catch (error) {
      this.problem =
        error instanceof PortInUse
          ? `Port ${error.port} is in use by another program. Close it and sign in again.`
          : `The sign-in could not start: ${describe(error)}`;
      this.deps.onChange();
      return;
    }

    const outcome = await new Promise<Outcome>((resolve) => {
      const cancelTimeout = this.deps.schedule(SIGN_IN_TIMEOUT_MS, () =>
        resolve({ kind: "timeout" }),
      );
      const end = (result: Outcome) => {
        cancelTimeout();
        resolve(result);
      };

      this.signIn = { authorizeUrl: url, end };
      void loopback.answer.then(end);

      this.deps.onChange();
      this.deps.openBrowser(url);
    });

    loopback.close();
    // The moment of Sign-in, for its expiry: when the token arrived.
    const signedInAt = this.deps.now();
    await this.finish(outcome, signedInAt);
    this.signIn = undefined;
    this.deps.onChange();
  }

  cancelSignIn(): void {
    this.signIn?.end({ kind: "cancelled" });
  }

  async signOut(): Promise<void> {
    this.cancelSignIn();
    this.problem = undefined;
    await this.deps.store.clear();
    console.log("Signed out of DonationAlerts");
    this.deps.onChange();
  }

  private async finish(outcome: Outcome, signedInAt: number): Promise<void> {
    switch (outcome.kind) {
      case "token": {
        try {
          const user = await this.deps.api.getUser(outcome.accessToken);
          // Listed field by field: the user also carries the socket token,
          // which is fetched afresh for every connection and never persisted.
          await this.deps.store.save({
            id: user.id,
            name: user.name,
            avatar: user.avatar,
            accessToken: outcome.accessToken,
            expiresAt: signedInAt + outcome.expiresIn * 1000,
          });
          console.log(`Signed in to DonationAlerts as user ${user.id}`);
        } catch (error) {
          this.problem = `DonationAlerts did not return the account: ${describe(error)}`;
        }
        return;
      }

      case "denied":
        this.problem = `DonationAlerts did not grant access (${outcome.reason}).`;
        return;

      case "malformed":
        this.problem =
          "DonationAlerts answered the sign-in in a way the plugin does not understand.";
        return;

      case "timeout":
        this.problem =
          "No answer from the browser within 5 minutes. Sign in again.";
        return;

      case "cancelled":
        return;
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
