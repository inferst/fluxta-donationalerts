import {
  Button,
  ListRow,
  Section,
  StatusBadge,
  type StatusTone,
} from "@fluxta/sdk/ui";
import type {
  AccountState,
  EditorMessage,
  RealtimeState,
} from "donationalerts-protocol";

type Props = {
  account: AccountState;
  /** Only while the Account is signed in. */
  realtime?: RealtimeState;
  send: (message: EditorMessage) => void;
};

export function AccountCard({ account, realtime, send }: Props) {
  return (
    <Section
      title="DonationAlerts account"
      description="The account whose donations and goals reach Fluxta. Signing in opens DonationAlerts in your browser; nothing else is needed."
    >
      <AccountRow account={account} realtime={realtime} send={send} />
    </Section>
  );
}

function AccountRow({ account, realtime, send }: Props) {
  switch (account.status) {
    case "signed-out":
      return (
        <ListRow
          title="Not signed in"
          description="Sign in to receive donations and goal updates."
          detail={
            account.problem ? (
              <p role="alert" className="text-destructive text-xs/relaxed">
                {account.problem}
              </p>
            ) : null
          }
          actions={
            <Button onClick={() => send({ event: "sign-in" })}>
              Sign in with DonationAlerts
            </Button>
          }
        />
      );

    case "signing-in":
      return (
        <ListRow
          title="Waiting for DonationAlerts"
          badges={<StatusBadge tone="pending">Signing in</StatusBadge>}
          detail={
            <div className="text-muted-foreground space-y-1 text-xs/relaxed">
              <p>
                Approve the sign-in in your browser. If it did not open, press
                Open again or visit
              </p>
              <p className="text-foreground break-all select-all">
                {account.authorizeUrl}
              </p>
            </div>
          }
          actions={
            <>
              <Button
                variant="outline"
                onClick={() => send({ event: "sign-in" })}
              >
                Open again
              </Button>
              <Button
                variant="outline"
                onClick={() => send({ event: "cancel-sign-in" })}
              >
                Cancel
              </Button>
            </>
          }
        />
      );

    case "signed-in":
      return (
        <ListRow
          leading={<Avatar src={account.avatar} />}
          title={account.name}
          description={`Signed in until ${formatDate(account.expiresAt)}`}
          badges={<RealtimeBadge realtime={realtime} />}
          detail={<RealtimeDetail realtime={realtime} />}
          actions={
            <Button
              variant="outline"
              onClick={() => send({ event: "sign-out" })}
            >
              Sign out
            </Button>
          }
        />
      );
  }
}

const TONE: Record<RealtimeState["status"], StatusTone> = {
  connecting: "pending",
  connected: "ok",
  reconnecting: "pending",
  stopped: "error",
};

const LABEL: Record<RealtimeState["status"], string> = {
  connecting: "Connecting",
  connected: "Connected",
  reconnecting: "Reconnecting",
  stopped: "Stopped",
};

function RealtimeBadge({ realtime }: { realtime?: RealtimeState }) {
  if (!realtime) {
    return null;
  }

  return (
    <StatusBadge tone={TONE[realtime.status]}>
      {LABEL[realtime.status]}
    </StatusBadge>
  );
}

function RealtimeDetail({ realtime }: { realtime?: RealtimeState }) {
  switch (realtime?.status) {
    case "reconnecting":
      return (
        <p className="text-muted-foreground text-xs/relaxed">
          Lost DonationAlerts ({realtime.reason}). Trying again on its own —
          nothing to do.
        </p>
      );
    case "stopped":
      return (
        <p role="alert" className="text-destructive text-xs/relaxed">
          {realtime.reason}. Sign out and sign in again.
        </p>
      );
    default:
      return null;
  }
}

function Avatar({ src }: { src: string }) {
  if (!src) {
    return null;
  }

  return <img src={src} alt="" className="size-8 rounded-full object-cover" />;
}

function formatDate(epochMs: number): string {
  return new Date(epochMs).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}
