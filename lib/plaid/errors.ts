import "server-only";

type PlaidErrorBody = {
  error_code?: string;
  error_message?: string;
  display_message?: string | null;
};

type PlaidResponseError = {
  response?: { data?: PlaidErrorBody };
};

export function toSafePlaidError(error: unknown) {
  const response = (error as PlaidResponseError)?.response;
  const body = response?.data;
  return {
    code: body?.error_code ?? "PLAID_REQUEST_FAILED",
    message:
      body?.display_message ||
      body?.error_message ||
      (error instanceof Error ? error.message : "Plaid request failed"),
  };
}
