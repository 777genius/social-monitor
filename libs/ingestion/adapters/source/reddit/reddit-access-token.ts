import type { SourceProviderScanContext } from "../../../ports";
import type { RedditRefreshTokenProviderPort } from "./refresh-token-reddit-token-provider";
import {
  firstNonEmptyString,
  readOptionalString,
  readRequiredString,
} from "./reddit-source-support";
import type { RedditTokenProviderPort } from "./reddit-token-provider.port";

export const resolveRedditAccessToken = async (params: {
  readonly context: SourceProviderScanContext;
  readonly tokenProvider?: RedditTokenProviderPort;
  readonly refreshTokenProvider?: RedditRefreshTokenProviderPort;
}): Promise<string> => {
  const configuredAccessToken = firstNonEmptyString(
    params.context.config?.accessToken,
    params.context.config?.apiToken,
    params.context.config?.bearerToken,
  );

  if (configuredAccessToken !== undefined) {
    return configuredAccessToken;
  }

  const refreshToken = firstNonEmptyString(
    params.context.config?.refreshToken,
    params.context.config?.redditRefreshToken,
  );
  if (refreshToken !== undefined) {
    if (params.refreshTokenProvider === undefined) {
      throw new Error("Reddit refresh-token OAuth provider is not configured");
    }

    return params.refreshTokenProvider.getAccessToken({
      clientId: readRequiredString(
        firstNonEmptyString(
          params.context.config?.clientId,
          params.context.config?.redditClientId,
        ),
        "clientId",
      ),
      clientSecret: firstNonEmptyString(
        params.context.config?.clientSecret,
        params.context.config?.redditClientSecret,
      ),
      refreshToken,
      userAgent: readOptionalString(params.context.config?.userAgent),
    });
  }

  if (params.tokenProvider === undefined) {
    throw new Error("Reddit app-only OAuth token provider is not configured");
  }

  return params.tokenProvider.getAccessToken();
};
