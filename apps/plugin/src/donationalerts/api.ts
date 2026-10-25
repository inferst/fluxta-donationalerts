import { z } from "zod";

import { API_BASE_URL } from "./config";

/**
 * DonationAlerts refused the token: the streamer revoked the application, or
 * the token expired. Waiting does not fix it — only a new Sign-in does.
 */
export class Unauthorized extends Error {
  constructor() {
    super("DonationAlerts no longer accepts this sign-in");
  }
}

/** The Account's identity, as `/user/oauth` reports it. */
export type DonationAlertsUser = {
  id: number;
  name: string;
  avatar: string;
};

const UserResponseSchema = z.object({
  data: z.object({
    id: z.number(),
    name: z.string(),
    avatar: z.string().nullish(),
  }),
});

export type DonationAlertsApi = {
  getUser(accessToken: string): Promise<DonationAlertsUser>;
};

/**
 * The REST calls the plugin makes — the only code that calls `fetch`.
 *
 * The token travels in the Authorization header, never in the URL, so an
 * error message built from the URL or the status cannot leak it.
 */
export function createApi(fetchImpl: typeof fetch = fetch): DonationAlertsApi {
  async function get(path: string, accessToken: string): Promise<unknown> {
    let response: Response;

    try {
      response = await fetchImpl(`${API_BASE_URL}${path}`, {
        headers: { authorization: `Bearer ${accessToken}` },
      });
    } catch {
      throw new Error("DonationAlerts could not be reached");
    }

    if (response.status === 401) {
      throw new Unauthorized();
    }

    if (!response.ok) {
      throw new Error(`DonationAlerts answered ${response.status}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error("DonationAlerts answered with something other than JSON");
    }
  }

  return {
    async getUser(accessToken) {
      const parsed = UserResponseSchema.safeParse(
        await get("/user/oauth", accessToken),
      );

      if (!parsed.success) {
        throw new Error(
          "DonationAlerts returned an account the plugin does not understand",
        );
      }

      const { id, name, avatar } = parsed.data.data;
      return { id, name, avatar: avatar ?? "" };
    },
  };
}
