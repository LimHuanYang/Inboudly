import { BadRequestException } from '@nestjs/common';
import { PinterestConnector } from './pinterest.connector';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('PinterestConnector — OAuth', () => {
  const connector = new PinterestConnector();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PINTEREST_CLIENT_ID = 'test_client_id';
    process.env.PINTEREST_CLIENT_SECRET = 'test_client_secret';
  });

  it('startOauth builds a Pinterest OAuth URL with all 3 scopes and correct state prefix', async () => {
    const { url, state } = await connector.startOauth('ws_42', 'https://api/cb');

    expect(url).toContain('https://www.pinterest.com/oauth/');
    const decoded = decodeURIComponent(url);
    expect(decoded).toContain('boards:read');
    expect(decoded).toContain('pins:read');
    expect(decoded).toContain('pins:write');
    expect(decoded).toContain('response_type=code');
    expect(state.startsWith('ws_42.')).toBe(true);
  });

  it('completeOauth exchanges code for tokens using Basic auth and returns platformUser from user_account', async () => {
    // Token endpoint response
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        access_token: 'pin_access_token',
        refresh_token: 'pin_refresh_token',
        expires_in: 3600,
      },
    } as any);
    // /v5/user_account response
    mockedAxios.get.mockResolvedValueOnce({
      data: { username: 'alice_pins' },
    } as any);

    const result = await connector.completeOauth('auth_code', 'ws_42.abc', 'https://api/cb');

    // Check token + user
    expect(result.accessToken).toBe('pin_access_token');
    expect(result.refreshToken).toBe('pin_refresh_token');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.scopes).toContain('pins:write');
    expect(result.platformUser).toEqual({
      id: 'alice_pins',
      handle: 'alice_pins',
      displayName: 'alice_pins',
      extra: {},
    });

    // Verify Basic auth was used — no client_secret in URL
    const [tokenUrl, , tokenConfig] = mockedAxios.post.mock.calls[0]!;
    expect(tokenUrl).toBe('https://api.pinterest.com/v5/oauth/token');
    expect(tokenConfig!.headers!['Authorization']).toMatch(/^Basic /);
    expect(tokenUrl).not.toContain('client_secret');
  });
});

describe('PinterestConnector — publish', () => {
  const connector = new PinterestConnector();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const baseAccount = {
    accessToken: 'bearer_token',
    platformUserId: 'alice_pins',
    workspaceId: 'ws_42',
    meta: null,
  } as any;

  it('resolves first board and POSTs to /v5/pins with image_url media_source', async () => {
    // GET /v5/boards
    mockedAxios.get.mockResolvedValueOnce({
      data: { items: [{ id: 'board_abc', name: 'Travel' }] },
    } as any);
    // POST /v5/pins
    mockedAxios.post.mockResolvedValueOnce({
      data: { id: 'pin_xyz' },
    } as any);

    const result = await connector.publish({
      account: baseAccount,
      variant: {
        caption: 'A beautiful sunset',
        hashtags: ['travel', '#nature'],
        media: [
          { order: 0, mediaAsset: { type: 'IMAGE', url: 'https://cdn/sunset.jpg' } },
        ],
      } as any,
    });

    // Verify board lookup
    const [boardsUrl] = mockedAxios.get.mock.calls[0]!;
    expect(boardsUrl).toBe('https://api.pinterest.com/v5/boards');

    // Verify pin POST
    const [pinsUrl, pinsBody] = mockedAxios.post.mock.calls[0]!;
    expect(pinsUrl).toBe('https://api.pinterest.com/v5/pins');
    expect(pinsBody).toMatchObject({
      board_id: 'board_abc',
      media_source: {
        source_type: 'image_url',
        url: 'https://cdn/sunset.jpg',
      },
    });

    expect(result).toEqual({
      platformPostId: 'pin_xyz',
      platformPostUrl: 'https://www.pinterest.com/pin/pin_xyz',
    });
  });

  it('throws BadRequestException when a VIDEO-only variant is provided', async () => {
    // GET /v5/boards (still needed to resolve board before media check)
    mockedAxios.get.mockResolvedValueOnce({
      data: { items: [{ id: 'board_abc' }] },
    } as any);

    await expect(
      connector.publish({
        account: baseAccount,
        variant: {
          caption: 'Video only post',
          hashtags: [],
          media: [
            { order: 0, mediaAsset: { type: 'VIDEO', url: 'https://cdn/video.mp4' } },
          ],
        } as any,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException with image-required message when media is empty', async () => {
    // GET /v5/boards — second independent scenario needs its own mock
    mockedAxios.get.mockResolvedValueOnce({
      data: { items: [{ id: 'board_abc' }] },
    } as any);

    await expect(
      connector.publish({
        account: baseAccount,
        variant: {
          caption: 'No media',
          hashtags: [],
          media: [],
        } as any,
      }),
    ).rejects.toThrow(/Pinterest requires an image/);
  });
});

describe('PinterestConnector — refreshToken', () => {
  const connector = new PinterestConnector();

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PINTEREST_CLIENT_ID = 'test_client_id';
    process.env.PINTEREST_CLIENT_SECRET = 'test_client_secret';
  });

  it('exchanges the refresh token via form body + Basic auth and returns fresh OauthTokenSet', async () => {
    // POST /v5/oauth/token (refresh)
    mockedAxios.post.mockResolvedValueOnce({
      data: {
        access_token: 'new_access_token',
        refresh_token: 'new_refresh_token',
        expires_in: 3600,
      },
    } as any);
    // GET /v5/user_account
    mockedAxios.get.mockResolvedValueOnce({
      data: { username: 'alice_pins' },
    } as any);

    const result = await connector.refreshToken!('old_refresh_token');

    // Verify form body has grant_type=refresh_token
    const [, refreshBody, refreshConfig] = mockedAxios.post.mock.calls[0]!;
    const bodyStr = refreshBody?.toString() ?? '';
    expect(bodyStr).toContain('grant_type=refresh_token');
    expect(bodyStr).toContain('refresh_token=old_refresh_token');
    expect(refreshConfig!.headers!['Authorization']).toMatch(/^Basic /);

    expect(result.accessToken).toBe('new_access_token');
    expect(result.refreshToken).toBe('new_refresh_token');
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.platformUser.id).toBe('alice_pins');
  });
});
