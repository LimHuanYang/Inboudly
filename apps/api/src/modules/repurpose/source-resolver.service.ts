import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import axios from 'axios';
import { tmpdir } from 'os';
import { mkdtempSync, createWriteStream } from 'fs';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuid } from 'uuid';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import youtubedl from 'youtube-dl-exec';
import { PrismaService } from '../../common/prisma/prisma.service';

export type SourceKind = 'upload' | 'youtube' | 'podcast' | 'blog';

export interface ResolvedSource {
  kind: SourceKind;
  /** Local file path (video/audio) — present for upload, youtube, podcast */
  localPath?: string;
  /** Plain-text content — present for blog (no audio to transcribe) */
  textContent?: string;
  /** Display title from the source */
  title?: string;
  /** Source URL or media URL */
  sourceUrl?: string;
  /** Original media MIME type */
  mimeType?: string;
}

/**
 * Source Resolver — turns any of the 4 ingestion source kinds into a uniform
 * payload the rest of the repurpose pipeline can consume.
 *
 * - upload    → fetch the user's already-uploaded MediaAsset from R2, save locally
 * - youtube   → use yt-dlp to download best-quality video
 * - podcast   → parse RSS feed, fetch the latest enclosure (mp3)
 * - blog      → fetch HTML, extract <article> text (no audio path)
 *
 * NOTE: yt-dlp must be installed on the worker host (apt: yt-dlp, brew: yt-dlp,
 * scoop: yt-dlp). The youtube-dl-exec package wraps the binary.
 */
@Injectable()
export class SourceResolverService {
  private readonly logger = new Logger(SourceResolverService.name);
  private readonly rssParser = new Parser();

  constructor(private prisma: PrismaService) {}

  async resolve(source: {
    kind: SourceKind;
    mediaAssetId?: string;
    url?: string;
  }): Promise<ResolvedSource> {
    switch (source.kind) {
      case 'upload':
        return this.resolveUpload(source.mediaAssetId!);
      case 'youtube':
        return this.resolveYouTube(source.url!);
      case 'podcast':
        return this.resolvePodcast(source.url!);
      case 'blog':
        return this.resolveBlog(source.url!);
      default:
        throw new BadRequestException(`Unknown source kind: ${source.kind}`);
    }
  }

  private async resolveUpload(mediaAssetId: string): Promise<ResolvedSource> {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id: mediaAssetId } });
    if (!asset) throw new BadRequestException('Media asset not found');

    const dir = mkdtempSync(join(tmpdir(), 'inb-src-'));
    const ext = asset.mimeType.split('/')[1] ?? 'bin';
    const localPath = join(dir, `${uuid()}.${ext}`);
    const res = await axios.get<ArrayBuffer>(asset.url, { responseType: 'arraybuffer' });
    await writeFile(localPath, Buffer.from(res.data));

    return {
      kind: 'upload',
      localPath,
      title: asset.filename,
      sourceUrl: asset.url,
      mimeType: asset.mimeType,
    };
  }

  private async resolveYouTube(url: string): Promise<ResolvedSource> {
    if (!/youtube\.com|youtu\.be/.test(url)) {
      throw new BadRequestException('Not a recognised YouTube URL');
    }
    const dir = mkdtempSync(join(tmpdir(), 'inb-yt-'));
    const localPath = join(dir, `${uuid()}.mp4`);

    // yt-dlp: best mp4 ≤ 1080p, with audio, single file
    const info = await youtubedl(url, {
      output: localPath,
      format: 'bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
      mergeOutputFormat: 'mp4',
      noPlaylist: true,
      printJson: true,
      noWarnings: true,
    });

    return {
      kind: 'youtube',
      localPath,
      title: (info as { title?: string }).title,
      sourceUrl: url,
      mimeType: 'video/mp4',
    };
  }

  private async resolvePodcast(url: string): Promise<ResolvedSource> {
    // Try parsing as RSS first; if that fails, treat the URL as a direct audio URL.
    try {
      const feed = await this.rssParser.parseURL(url);
      const latest = feed.items[0];
      const audioUrl = latest?.enclosure?.url;
      if (!audioUrl) throw new Error('No enclosure on latest podcast item');

      const dir = mkdtempSync(join(tmpdir(), 'inb-pod-'));
      const localPath = join(dir, `${uuid()}.mp3`);
      const res = await axios.get<ArrayBuffer>(audioUrl, { responseType: 'arraybuffer' });
      await writeFile(localPath, Buffer.from(res.data));

      return {
        kind: 'podcast',
        localPath,
        title: latest.title ?? feed.title,
        sourceUrl: audioUrl,
        mimeType: latest.enclosure?.type ?? 'audio/mpeg',
      };
    } catch (err) {
      this.logger.debug(`RSS parse failed for ${url}, trying direct download`);
      const dir = mkdtempSync(join(tmpdir(), 'inb-pod-'));
      const localPath = join(dir, `${uuid()}.mp3`);
      const res = await axios.get<ArrayBuffer>(url, { responseType: 'arraybuffer' });
      await writeFile(localPath, Buffer.from(res.data));
      return { kind: 'podcast', localPath, sourceUrl: url, mimeType: 'audio/mpeg' };
    }
  }

  private async resolveBlog(url: string): Promise<ResolvedSource> {
    const res = await axios.get<string>(url, {
      headers: { 'User-Agent': 'InboudlyBot/1.0 (+https://inboudly.com)' },
      responseType: 'text',
    });
    const $ = cheerio.load(res.data);
    const title = $('title').first().text() || $('h1').first().text();

    // Prefer <article>, fall back to <main>, then to body. Strip script/style/nav.
    $('script, style, nav, header, footer, aside').remove();
    let body = $('article').first().text();
    if (!body) body = $('main').first().text();
    if (!body) body = $('body').text();

    const textContent = body.replace(/\s+/g, ' ').trim().slice(0, 50_000);

    return {
      kind: 'blog',
      textContent,
      title,
      sourceUrl: url,
    };
  }
}
