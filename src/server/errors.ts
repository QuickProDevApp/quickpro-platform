import "server-only";

/** Errors whose message is safe and useful to show to the user. */
export class UserFacingError extends Error {}

type PgLikeError = { code?: string; message?: string };

function isPgError(error: unknown): error is PgLikeError {
  return typeof error === "object" && error !== null && "code" in error && "severity" in error;
}

/**
 * Converts an error from a server action into a message for the form.
 * Workflow functions in the database raise P0001/P0002 with messages written
 * for users; anything else is logged and replaced with a generic message.
 */
export function toUserMessage(error: unknown): string {
  if (error instanceof UserFacingError) return error.message;
  if (isPgError(error)) {
    switch (error.code) {
      case "P0001":
      case "P0002":
        return error.message ?? "That change could not be saved.";
      case "42501":
        return "You don't have permission to do that.";
      case "23505":
        return "That has already been added.";
      case "23514":
      case "22P02":
      case "22007":
      case "22008":
        return "Some of the values are not valid. Check the form and try again.";
    }
  }
  console.error(error);
  return "Something went wrong and nothing was saved. Please try again.";
}
