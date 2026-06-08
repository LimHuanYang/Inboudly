import { LinkedInConnector } from './linkedin.connector';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('LinkedInConnector — OAuth', () => {
  const c = new LinkedInConnector();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LINKEDIN_CLIENT_ID = 'li_cid';
    process.env.LINKEDIN_CLIENT_SECRET = 'li_csec';
  });

  it('startOauth builds a LinkedIn authorization URL with w_member_social scope and workspace-prefixed state', async () => {
    const { url, state } = await c.startOauth('ws_1', 'https://api/cb');
    expect(url).toContain('https://www.linkedin.com/oauth/v2/authorization');
    expect(decodeURIComponent(url)).toContain('w_member_social');
    expect(url).toContain('response_type=code');
    expect(state.startsWith('ws_1.')).toBe(true);
  });

  it('completeOauth exchanges the code, fetches userinfo and returns personUrn in extra', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 },
    } as any);
    mockedAxios.get.mockResolvedValueOnce({
      data: { sub: 'u123', name: 'Jane Doe', picture: 'https://li/pic.jpg' },
    } as any);

    const t = await c.completeOauth('code', 'ws_1.x', 'https://api/cb');

    expect(t.accessToken).toBe('at');
    expect(t.refreshToken).toBe('rt');
    expect(t.expiresAt).toBeInstanceOf(Date);
    expect(t.platformUser).toEqual({
      id: 'u123',
      handle: 'Jane Doe',
      displayName: 'Jane Doe',
      avatarUrl: 'https://li/pic.jpg',
      extra: { personUrn: 'urn:li:person:u123' },
    });

    // Confirm client_secret was sent in the form body, not the URL
    const postUrl = mockedAxios.post.mock.calls[0]![0] as string;
    expect(postUrl).not.toContain('client_secret');
  });
});

describe('LinkedInConnector — publish', () => {
  const c = new LinkedInConnector();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LINKEDIN_CLIENT_ID = 'li_cid';
    process.env.LINKEDIN_CLIENT_SECRET = 'li_csec';
  });

  const textVariant = (meta?: any) => ({
    account: {
      accessToken: 'at',
      platformUserId: 'u123',
      meta: meta ?? { personUrn: 'urn:li:person:u123' },
      workspaceId: 'ws_1',
    } as any,
    variant: {
      caption: 'Hello LinkedIn',
      hashtags: ['inbound', '#marketing'],
      media: [],
    } as any,
  });

  it('posts a text update to /rest/posts with correct author, commentary, and visibility', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      headers: { 'x-restli-id': 'urn:li:share:987' },
      data: {},
    } as any);

    const r = await c.publish(textVariant());

    const [url, body, config] = mockedAxios.post.mock.calls[0]! as [string, any, any];
    expect(url).toBe('https://api.linkedin.com/rest/posts');
    expect(body.author).toBe('urn:li:person:u123');
    expect(body.commentary).toContain('Hello LinkedIn');
    expect(body.commentary).toContain('#inbound');
    expect(body.commentary).toContain('#marketing');
    expect(body.visibility).toBe('PUBLIC');
    expect(body.lifecycleState).toBe('PUBLISHED');
    expect(config.headers['LinkedIn-Version']).toBe('202401');
    expect(config.headers['Authorization']).toBe('Bearer at');

    expect(r).toEqual({
      platformPostId: 'urn:li:share:987',
      platformPostUrl: 'https://www.linkedin.com/feed/update/urn:li:share:987',
    });
  });

  it('falls back to platformUserId for author when meta.personUrn is absent', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      headers: { 'x-restli-id': 'urn:li:share:000' },
      data: {},
    } as any);

    await c.publish({
      ...textVariant(null),
      account: { accessToken: 'at', platformUserId: 'u999', meta: null, workspaceId: 'ws_1' } as any,
    });

    const body = mockedAxios.post.mock.calls[0]![1] as any;
    expect(body.author).toBe('urn:li:person:u999');
  });

  it('refreshToken exchanges the refresh token and re-fetches userinfo', async () => {
    mockedAxios.post.mockResolvedValueOnce({
      data: { access_token: 'at2', expires_in: 7200 },
    } as any);
    mockedAxios.get.mockResolvedValueOnce({
      data: { sub: 'u123', name: 'Jane Doe', picture: undefined },
    } as any);

    const t = await c.refreshToken!('rt');

    expect(t.accessToken).toBe('at2');
    expect(t.refreshToken).toBe('rt');
    expect(t.expiresAt).toBeInstanceOf(Date);
    expect(t.platformUser?.extra?.personUrn).toBe('urn:li:person:u123');

    // Confirm client_secret in form body, not URL
    const postUrl = mockedAxios.post.mock.calls[0]![0] as string;
    expect(postUrl).not.toContain('client_secret');
  });
});
