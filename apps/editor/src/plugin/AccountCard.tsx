import { Button, ListRow, Section, StatusBadge } from "@fluxta/sdk/ui";
import type { AccountState, EditorMessage } from "donationalerts-protocol";

type Props = {
  account: AccountState;
  send: (message: EditorMessage) => void;
};

export function AccountCard({ account, send }: Props) {
  return (
    <Section
      title="DonationAlerts account"
      description="The account whose donations and goals reach Fluxta. Signing in opens DonationAlerts in your browser; nothing else is needed."
    >
      <AccountRow account={account} send={send} />
    </Section>
  );
}

function AccountRow({ account, send }: Props) {
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
          badges={<StatusBadge tone="ok">Signed in</StatusBadge>}
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
