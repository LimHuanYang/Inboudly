import { YouTubeConnector } from './youtube.connector';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('YouTubeConnector — OAuth', () => {
  const c = new YouTubeConnector();
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.YOUTUBE_CLIENT_ID = 'cid';
    process.env.YOUTUBE_CLIENT_SECRET = 'csec';
  });

  it('startOauth builds a Google consent URL with offline access + upload scope', async () => {
    const { url, state } = await c.startOauth('ws_1', 'https://api/cb');
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('access_type=offline');
    expect(url).toContain('prompt=consent');
    expect(decodeURIComponent(url)).toContain('youtube.upload');
    expect(state.startsWith('ws_1.')).toBe(true);
  });

  it('completeOauth exchanges the code and returns tokens + channel identity', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { access_token: 'at', refresh_token: 'rt', expires_in: 3600 } } as any);
    mockedAxios.get.mockResolvedValueOnce({ data: { items: [{ id: 'UC123', snippet: { title: 'Acme', thumbnails: { default: { url: 'http://a/x.png' } } } }] } } as any);
    const t = await c.completeOauth('code', 'ws_1.x', 'https://api/cb');
    expect(t.accessToken).toBe('at');
    expect(t.refreshToken).toBe('rt');
    expect(t.expiresAt).toBeInstanceOf(Date);
    expect(t.platformUser).toEqual({ id: 'UC123', handle: '@Acme', displayName: 'Acme', avatarUrl: 'http://a/x.png', extra: { channelId: 'UC123' } });
  });
});

describe('YouTubeConnector — publish', () => {
  const c = new YouTubeConnector();
  beforeEach(() => { jest.clearAllMocks(); });
  const videoVariant = (platformOptions?: any) => ({
    account: { accessToken: 'at', workspaceId: 'ws_1' } as any,
    variant: { caption: 'A great clip\nsecond line', hashtags: ['fun', '#wow'], platformOptions,
      media: [{ order: 0, mediaAsset: { type: 'VIDEO', url: 'https://r2/x.mp4' } }] } as any,
  });

  it('uploads the clip (resumable) with metadata + privacy and returns the watch url', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: new Uint8Array([1, 2, 3]).buffer } as any);
    mockedAxios.post.mockResolvedValueOnce({ headers: { location: 'https://upload/session' }, data: {} } as any);
    mockedAxios.put.mockResolvedValueOnce({ data: { id: 'vid123' } } as any);
    const r = await c.publish(videoVariant({ youtube: { privacyStatus: 'public' } }));
    const initBody = mockedAxios.post.mock.calls[0]![1] as any;
    expect(initBody.snippet.title).toBe('A great clip');
    expect(initBody.snippet.tags).toEqual(['fun', 'wow']);
    expect(initBody.status.privacyStatus).toBe('public');
    expect(mockedAxios.put.mock.calls[0]![0]).toBe('https://upload/session');
    expect(r).toEqual({ platformPostId: 'vid123', platformPostUrl: 'https://youtu.be/vid123' });
  });

  it('defaults privacy to unlisted when platformOptions is absent', async () => {
    mockedAxios.get.mockResolvedValueOnce({ data: new Uint8Array([1]).buffer } as any);
    mockedAxios.post.mockResolvedValueOnce({ headers: { location: 'https://upload/s' }, data: {} } as any);
    mockedAxios.put.mockResolvedValueOnce({ data: { id: 'v' } } as any);
    await c.publish(videoVariant());
    expect((mockedAxios.post.mock.calls[0]![1] as any).status.privacyStatus).toBe('unlisted');
  });

  it('rejects an image-only variant before any HTTP call', async () => {
    await expect(c.publish({ account: { accessToken: 'at' } as any,
      variant: { caption: 'x', hashtags: [], media: [{ order: 0, mediaAsset: { type: 'IMAGE', url: 'u' } }] } as any,
    })).rejects.toThrow(/video/i);
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('refreshToken exchanges the refresh token for a fresh access token', async () => {
    mockedAxios.post.mockResolvedValueOnce({ data: { access_token: 'at2', expires_in: 3600 } } as any);
    mockedAxios.get.mockResolvedValueOnce({ data: { items: [{ id: 'UC1', snippet: { title: 'Acme' } }] } } as any);
    const t = await c.refreshToken!('rt');
    expect(t.accessToken).toBe('at2');
    expect(t.refreshToken).toBe('rt');
  });
});
