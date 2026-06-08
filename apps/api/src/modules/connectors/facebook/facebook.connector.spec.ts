import { FacebookConnector } from './facebook.connector';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('FacebookConnector — OAuth', () => {
  const c = new FacebookConnector();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FACEBOOK_APP_ID = 'app_id';
    process.env.FACEBOOK_APP_SECRET = 'app_secret';
  });

  it('startOauth builds an FB dialog URL with page scopes and correct state prefix', async () => {
    const { url, state } = await c.startOauth('ws_1', 'https://api/cb');
    expect(url).toContain('https://www.facebook.com/v21.0/dialog/oauth');
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('pages_show_list');
    expect(decoded).toContain('pages_manage_posts');
    expect(decoded).toContain('pages_read_engagement');
    expect(decoded).toContain('response_type=code');
    expect(state.startsWith('ws_1.')).toBe(true);
  });

  it('completeOauth exchanges code → long-lived token → page token and returns platformUser', async () => {
    // short-lived token response
    mockedAxios.get.mockResolvedValueOnce({
      data: { access_token: 'short_token' },
    } as any);
    // long-lived token response
    mockedAxios.get.mockResolvedValueOnce({
      data: { access_token: 'long_token', expires_in: 5183944 },
    } as any);
    // /me/accounts response with one page
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'page_123',
            name: 'Acme Page',
            access_token: 'page_token_abc',
          },
        ],
      },
    } as any);

    const result = await c.completeOauth('auth_code', 'ws_1.abc', 'https://api/cb');

    expect(result.accessToken).toBe('page_token_abc');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.scopes).toContain('pages_manage_posts');
    expect(result.platformUser).toEqual({
      id: 'page_123',
      handle: 'Acme Page',
      displayName: 'Acme Page',
      extra: { pageId: 'page_123' },
    });
  });

  it('completeOauth throws BadRequestException when no pages are found', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: { access_token: 'short' } } as any);
    mockedAxios.get.mockResolvedValueOnce({
      data: { access_token: 'long', expires_in: 3600 },
    } as any);
    mockedAxios.get.mockResolvedValueOnce({ data: { data: [] } } as any);

    await expect(c.completeOauth('code', 'ws_1.x', 'https://api/cb')).rejects.toThrow(
      /No Facebook Page found/,
    );
  });
});

describe('FacebookConnector — publish', () => {
  const c = new FacebookConnector();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseAccount = {
    accessToken: 'page_token',
    platformUserId: 'page_456',
    workspaceId: 'ws_1',
  } as any;

  it('publishes a text-only post to /feed with message', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'post_001' } } as any);

    const result = await c.publish({
      account: baseAccount,
      variant: {
        caption: 'Hello world',
        hashtags: ['foo', '#bar'],
        media: [],
      } as any,
    });

    const [url, , config] = mockedAxios.post.mock.calls[0]!;
    expect(url).toContain('/page_456/feed');
    expect(config!.params.message).toBe('Hello world\n\n#foo #bar');
    expect(config!.params.access_token).toBe('page_token');
    expect(result).toEqual({
      platformPostId: 'post_001',
      platformPostUrl: 'https://facebook.com/post_001',
    });
  });

  it('publishes a single image to /photos with caption', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'photo_002' } } as any);

    const result = await c.publish({
      account: baseAccount,
      variant: {
        caption: 'Look at this',
        hashtags: [],
        media: [
          { order: 0, mediaAsset: { type: 'IMAGE', url: 'https://cdn/img.jpg' } },
        ],
      } as any,
    });

    const [url, , config] = mockedAxios.post.mock.calls[0]!;
    expect(url).toContain('/page_456/photos');
    expect(config!.params.url).toBe('https://cdn/img.jpg');
    expect(config!.params.caption).toBe('Look at this');
    expect(result).toEqual({
      platformPostId: 'photo_002',
      platformPostUrl: 'https://facebook.com/photo_002',
    });
  });

  it('publishes a single video to /videos with file_url and description', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { id: 'vid_003' } } as any);

    await c.publish({
      account: baseAccount,
      variant: {
        caption: 'Watch this',
        hashtags: ['clip'],
        media: [
          { order: 0, mediaAsset: { type: 'VIDEO', url: 'https://cdn/video.mp4' } },
        ],
      } as any,
    });

    const [url, , config] = mockedAxios.post.mock.calls[0]!;
    expect(url).toContain('/page_456/videos');
    expect(config!.params.file_url).toBe('https://cdn/video.mp4');
    expect(config!.params.description).toBe('Watch this\n\n#clip');
  });
});

describe('FacebookConnector — refreshToken', () => {
  const c = new FacebookConnector();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.FACEBOOK_APP_ID = 'app_id';
    process.env.FACEBOOK_APP_SECRET = 'app_secret';
  });

  it('extends the long-lived token via fb_exchange_token and returns a fresh OauthTokenSet', async () => {
    mockedAxios.get.mockResolvedValueOnce({
      data: { access_token: 'new_page_token', expires_in: 5183944 },
    } as any);
    mockedAxios.get.mockResolvedValueOnce({
      data: {
        data: [{ id: 'page_999', name: 'Refreshed Page', access_token: 'new_page_token' }],
      },
    } as any);

    const result = await c.refreshToken!('old_page_token');

    // Confirm fb_exchange_token was used
    const getCall = mockedAxios.get.mock.calls[0]!;
    expect(getCall[1]!.params.grant_type).toBe('fb_exchange_token');
    expect(getCall[1]!.params.fb_exchange_token).toBe('old_page_token');

    expect(result.accessToken).toBe('new_page_token');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.platformUser.id).toBe('page_999');
    expect(result.platformUser.handle).toBe('Refreshed Page');
  });
});
