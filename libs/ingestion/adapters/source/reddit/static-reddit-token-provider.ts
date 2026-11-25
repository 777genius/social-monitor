import type { RedditTokenProviderPort } from './reddit-token-provider.port';

export class StaticRedditTokenProvider implements RedditTokenProviderPort {
  constructor(private readonly accessToken: string) {}

  async getAccessToken(): Promise<string> {
    return this.accessToken;
  }
}
