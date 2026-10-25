import { isEditorMessage, type PluginMessage } from "donationalerts-protocol";

import { AccountService } from "./account/service";
import { AccountStore } from "./account/store";
import { createApi } from "./donationalerts/api";
import { openLoopback } from "./donationalerts/loopback";
import { openInBrowser } from "./open-browser";
import { plugin } from "./plugin";

const store = new AccountStore(plugin);
const account = new AccountService({
  store,
  api: createApi(),
  openLoopback,
  openBrowser: openInBrowser,
  now: () => Date.now(),
  schedule: (ms, run) => {
    const timer = setTimeout(run, ms);
    return () => clearTimeout(timer);
  },
  onChange: () => publish(),
});

/** Tells every open editor how the Account stands. */
function publish(): void {
  plugin.sendToEditor({
    event: "status",
    status: { account: account.state() },
  } satisfies PluginMessage);
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
  publish();
});
