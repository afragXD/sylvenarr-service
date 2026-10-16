export type OAuthProfile = {
  readonly providerUserId: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatarUrl: string | null;
  readonly raw: unknown;
};

export type OAuthProviderPublic = {
  readonly id: string;
  readonly label: string;
};

export interface OAuthProviderAdapter {
  readonly id: string;
  readonly label: string;
  getAuthorizationUrl(state: string): string;
  exchangeCode(code: string): Promise<OAuthProfile>;
}
