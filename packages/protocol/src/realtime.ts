import { z } from "zod";

/**
 * How the Realtime Connection stands, as the Plugin Editor sees it. Present
 * only while an Account is signed in.
 *
 * `reconnecting` is normal and resolves itself; `stopped` does not — the
 * plugin has given up on the Account's token and waits for a new Sign-in.
 */
export const RealtimeStateSchema = z.discriminatedUnion("status", [
  z.object({ status: z.literal("connecting") }),
  z.object({ status: z.literal("connected") }),
  z.object({ status: z.literal("reconnecting"), reason: z.string() }),
  z.object({ status: z.literal("stopped"), reason: z.string() }),
]);

export type RealtimeState = z.infer<typeof RealtimeStateSchema>;
