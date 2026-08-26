import "server-only";

import {
  Configuration,
  PlaidApi,
  PlaidEnvironments,
} from "plaid";
import type { PlaidConfig } from "./config";

export function getPlaidClient(config: PlaidConfig) {
  return new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[config.environment],
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": config.clientId,
          "PLAID-SECRET": config.secret,
        },
      },
    }),
  );
}
