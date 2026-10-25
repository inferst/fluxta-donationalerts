import { isEditorMessage, type PluginMessage } from "donationalerts-protocol";

import { AccountService } from "./account/service";
import { AccountStore } from "./account/store";
import { createApi } from "./donationalerts/api";
import { openLoopback } from "./donationalerts/loopback";
import {
  DONATION_RECEIVED,
  toDonationReceived,
} from "./events/donation-received";
import { openInBrowser } from "./open-browser";
import { plugin } from "./plugin";
import { createCentrifugeClient } from "./realtime/client";
import { RealtimeConnection } from "./realtime/connection";
import { schedule } from "./schedule";

const api = createApi();
const store = new AccountStore(plugin);
const account = new AccountService({
  store,
  api,
  openLoopback,
  openBrowser: openInBrowser,
  now: () => Date.now(),
  schedule,
  onChange: () => {
    follow();
    publish();
  },
});
const realtime = new RealtimeConnection({
  api,
  createClient: createCentrifugeClient,
  schedule,
  onDonation: (data) => {
    const payload = toDonationReceived(data);

    if (!payload) {
      console.warn("A donation the plugin could not read was skipped");
      return;
    }

    // The id only: donor names and messages stay out of the log.
    console.log(`Donation ${payload.donationId} received`);
    plugin.emitEvent(DONATION_RECEIVED, payload);
  },
  onChange: () => publish(),
});

/** Keeps the Realtime Connection on the signed-in Account, or stops it. */
function follow(): void {
  const stored = store.get();
  realtime.follow(stored && { id: stored.id, accessToken: stored.accessToken });
}

/**
 * Tells every open editor how the Account stands, and Fluxta whether it is
 * connected — one External Connection, connected while the donation channel
 * is subscribed, none when signed out.
 */
function publish(): void {
  const stored = store.get();
  const state = account.state();
  const live = realtime.state();

  plugin.sendToEditor({
    event: "status",
    status:
      state.status === "signed-in" && live
        ? { account: state, realtime: live }
        : { account: state },
  } satisfies PluginMessage);

  plugin.setConnections(
    stored
      ? [
          {
            id: String(stored.id),
            title: stored.name,
            connected: live?.status === "connected",
          },
        ]
      : [],
  );
}

// Attached before connecting, so nothing sent while the editor was already
// open is missed once the authenticated handshake completes.
plugin.onReceiveFromEditor((message: unknown) => {
  if (!isEditorMessage(message)) {
    return;
  }

  switch (message.event) {
    case "get-status":
      publish();
      return;
    case "sign-in":
      void account.startSignIn();
      return;
    case "cancel-sign-in":
      account.cancelSignIn();
      return;
    case "sign-out":
      void account.signOut();
      return;
  }
});

await plugin.connect();

// Settings are only readable over the authenticated connection, so the first
// firing — which the SDK guarantees fires immediately with what is already
// persisted — waits for it, and doubles as startup hydration. Later firings
// echo the store's own writes, the only writer there is.
await plugin.onPluginSettings<unknown>((settings) => {
  store.hydrate(settings);
  follow();
  publish();
});
