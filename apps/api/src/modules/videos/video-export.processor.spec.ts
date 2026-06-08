import { Job } from 'bullmq';
import { VideoExportProcessor } from './video-export.processor';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock axios BEFORE importing the processor (Jest hoists jest.mock calls)
jest.mock('axios', () => ({
  get: jest.fn(),
}));

// Mock fs/promises so we never touch real disk
jest.mock('fs/promises', () => ({
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn().mockResolvedValue(Buffer.from('mp4data')),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

import axios from 'axios';
import { writeFile, readFile, unlink } from 'fs/promises';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeJob(projectId: string): Job<{ projectId: string }> {
  return { data: { projectId } } as Job<{ projectId: string }>;
}

function makeScene(order: number, videoUrl: string) {
  return { id: `scene-${order}`, projectId: 'proj-1', order, videoUrl };
}

function buildDeps(scenesRows: ReturnType<typeof makeScene>[]) {
  const prisma = {
    videoScene: {
      findMany: jest.fn().mockResolvedValue(scenesRows),
    },
    videoProject: {
      update: jest.fn().mockResolvedValue({}),
    },
  } as any;

  const r2 = {
    putObject: jest.fn().mockResolvedValue('https://cdn.example.com/final.mp4'),
  } as any;

  const ffmpeg = {
    stitchClips: jest.fn().mockResolvedValue(undefined),
  } as any;

  return { prisma, r2, ffmpeg };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('VideoExportProcessor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: axios returns an ArrayBuffer for each download
    (axios.get as jest.Mock).mockResolvedValue({ data: new ArrayBuffer(8) });
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('downloads scenes in order, stitches, uploads, and sets READY + finalUrl', async () => {
    const scenes = [
      makeScene(0, 'https://storage.example.com/scene-0.mp4'),
      makeScene(1, 'https://storage.example.com/scene-1.mp4'),
      makeScene(2, 'https://storage.example.com/scene-2.mp4'),
    ];
    const { prisma, r2, ffmpeg } = buildDeps(scenes);
    const processor = new VideoExportProcessor(prisma, r2, ffmpeg);

    await processor.process(makeJob('proj-1'));

    // Scene query ordered by order
    expect(prisma.videoScene.findMany).toHaveBeenCalledWith({
      where: { projectId: 'proj-1', videoUrl: { not: null } },
      orderBy: { order: 'asc' },
    });

    // Each scene URL was downloaded
    expect(axios.get).toHaveBeenCalledTimes(3);
    const [scene0, scene1, scene2] = scenes;
    expect(axios.get).toHaveBeenNthCalledWith(1, scene0!.videoUrl, { responseType: 'arraybuffer' });
    expect(axios.get).toHaveBeenNthCalledWith(2, scene1!.videoUrl, { responseType: 'arraybuffer' });
    expect(axios.get).toHaveBeenNthCalledWith(3, scene2!.videoUrl, { responseType: 'arraybuffer' });

    // Each download was written to a temp file
    expect(writeFile).toHaveBeenCalledTimes(3);

    // stitchClips was called with an array of 3 paths + an outPath
    expect(ffmpeg.stitchClips).toHaveBeenCalledTimes(1);
    const [inputPaths, outPath] = (ffmpeg.stitchClips as jest.Mock).mock.calls[0];
    expect(inputPaths).toHaveLength(3);
    expect(typeof outPath).toBe('string');
    // outPath ends with .mp4
    expect(outPath).toMatch(/\.mp4$/);
    // Paths are different (each scene has a distinct temp file)
    expect(new Set(inputPaths).size).toBe(3);

    // The stitched file was read and uploaded to R2
    expect(readFile).toHaveBeenCalledWith(outPath);
    expect(r2.putObject).toHaveBeenCalledTimes(1);
    const [key, buf, mime] = (r2.putObject as jest.Mock).mock.calls[0];
    expect(key).toMatch(/^videos\/proj-1\/final-\d+\.mp4$/);
    expect(buf).toBeInstanceOf(Buffer);
    expect(mime).toBe('video/mp4');

    // Project updated to READY with the public URL
    expect(prisma.videoProject.update).toHaveBeenCalledWith({
      where: { id: 'proj-1' },
      data: {
        exportStatus: 'READY',
        finalUrl: 'https://cdn.example.com/final.mp4',
        errorMessage: null,
      },
    });
  });

  it('cleans up temp files (including outPath) even on success', async () => {
    const scenes = [makeScene(0, 'https://storage.example.com/scene-0.mp4')];
    const { prisma, r2, ffmpeg } = buildDeps(scenes);
    const processor = new VideoExportProcessor(prisma, r2, ffmpeg);

    await processor.process(makeJob('proj-1'));

    // unlink called for 1 temp input + 1 outPath = 2 calls
    expect(unlink).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Empty-scenes → FAILED
  // -------------------------------------------------------------------------

  it('sets exportStatus=FAILED with message when no scenes have videoUrl', async () => {
    const { prisma, r2, ffmpeg } = buildDeps([]); // no scenes
    const processor = new VideoExportProcessor(prisma, r2, ffmpeg);

    await processor.process(makeJob('proj-empty'));

    expect(prisma.videoProject.update).toHaveBeenCalledWith({
      where: { id: 'proj-empty' },
      data: {
        exportStatus: 'FAILED',
        errorMessage: 'No scene videos to export',
      },
    });

    // Should not try to stitch or upload
    expect(ffmpeg.stitchClips).not.toHaveBeenCalled();
    expect(r2.putObject).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Stitch error → FAILED
  // -------------------------------------------------------------------------

  it('sets exportStatus=FAILED with error message when stitchClips throws', async () => {
    const scenes = [makeScene(0, 'https://storage.example.com/scene-0.mp4')];
    const { prisma, r2, ffmpeg } = buildDeps(scenes);
    ffmpeg.stitchClips = jest.fn().mockRejectedValue(new Error('ffmpeg exited with code 1'));

    const processor = new VideoExportProcessor(prisma, r2, ffmpeg);

    await processor.process(makeJob('proj-fail'));

    expect(prisma.videoProject.update).toHaveBeenCalledWith({
      where: { id: 'proj-fail' },
      data: {
        exportStatus: 'FAILED',
        errorMessage: 'ffmpeg exited with code 1',
      },
    });

    // R2 upload should not have been attempted
    expect(r2.putObject).not.toHaveBeenCalled();
  });

  it('still cleans up temp files when stitchClips throws', async () => {
    const scenes = [makeScene(0, 'https://storage.example.com/scene-0.mp4')];
    const { prisma, r2, ffmpeg } = buildDeps(scenes);
    ffmpeg.stitchClips = jest.fn().mockRejectedValue(new Error('ffmpeg crashed'));

    const processor = new VideoExportProcessor(prisma, r2, ffmpeg);

    await processor.process(makeJob('proj-fail-cleanup'));

    // unlink should still be called for temp input + outPath
    expect(unlink).toHaveBeenCalledTimes(2);
  });

  // -------------------------------------------------------------------------
  // Download error → FAILED
  // -------------------------------------------------------------------------

  it('sets exportStatus=FAILED when downloading a scene clip fails', async () => {
    const scenes = [makeScene(0, 'https://storage.example.com/scene-0.mp4')];
    const { prisma, r2, ffmpeg } = buildDeps(scenes);
    (axios.get as jest.Mock).mockRejectedValueOnce(new Error('Network timeout'));

    const processor = new VideoExportProcessor(prisma, r2, ffmpeg);

    await processor.process(makeJob('proj-dl-fail'));

    expect(prisma.videoProject.update).toHaveBeenCalledWith({
      where: { id: 'proj-dl-fail' },
      data: {
        exportStatus: 'FAILED',
        errorMessage: 'Network timeout',
      },
    });
    expect(ffmpeg.stitchClips).not.toHaveBeenCalled();
  });
});
