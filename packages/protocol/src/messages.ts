import { z } from "zod";

import { AccountStateSchema } from "./account";
import { RealtimeStateSchema } from "./realtime";

/**
 * The message protocol between the Plugin sidecar and the Plugin Editor.
 *
 * The SDK does not impose a format — this module is the single place where
 * ours is defined, so both sides agree on it by construction. Every message
 * is an object with an `event` discriminant, and both sides check what they
 * receive: it arrives as `unknown` JSON.
 */

/** Everything the Plugin Editor renders. */
export const PluginStatusSchema = z.object({
  account: AccountStateSchema,
  /** Only while the Account is signed in. */
  realtime: RealtimeStateSchema.optional(),
});

export type PluginStatus = z.infer<typeof PluginStatusSchema>;

const EditorMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("get-status") }),
  z.object({ event: z.literal("sign-in") }),
  z.object({ event: z.literal("cancel-sign-in") }),
  z.object({ event: z.literal("sign-out") }),
]);

/** A message the Plugin Editor sends to the sidecar. */
export type EditorMessage = z.infer<typeof EditorMessageSchema>;

const PluginMessageSchema = z.discriminatedUnion("event", [
  z.object({ event: z.literal("status"), status: PluginStatusSchema }),
]);

/** A message the sidecar sends to the Plugin Editor. */
export type PluginMessage = z.infer<typeof PluginMessageSchema>;

export function isEditorMessage(value: unknown): value is EditorMessage {
  return EditorMessageSchema.safeParse(value).success;
}

export function isPluginMessage(value: unknown): value is PluginMessage {
  return PluginMessageSchema.safeParse(value).success;
}
