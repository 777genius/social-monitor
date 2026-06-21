export interface RedditTokenProviderPort {
  getAccessToken(): Promise<string>;
}
