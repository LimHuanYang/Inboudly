import { FfmpegService } from './ffmpeg.service';
import ffmpeg from 'fluent-ffmpeg';

jest.mock('fluent-ffmpeg');
const mockedFfmpeg = ffmpeg as jest.MockedFunction<typeof ffmpeg>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a chainable fluent-ffmpeg command stub. */
function makeCommandStub() {
  const handlers: Record<string, ((...args: any[]) => void)[]> = {};

  const stub: any = {
    input: jest.fn().mockReturnThis(),
    complexFilter: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    on: jest.fn((event: string, cb: (...args: any[]) => void) => {
      handlers[event] = handlers[event] ?? [];
      handlers[event].push(cb);
      return stub;
    }),
    save: jest.fn().mockReturnThis(),
    // helpers for tests to fire events
    _emit(event: string, ...args: any[]) {
      (handlers[event] ?? []).forEach((cb) => cb(...args));
    },
  };

  return stub;
}

// ---------------------------------------------------------------------------
// FfmpegService — stitchClips
// ---------------------------------------------------------------------------

describe('FfmpegService.stitchClips', () => {
  let service: FfmpegService;
  let cmdStub: ReturnType<typeof makeCommandStub>;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FfmpegService();
    cmdStub = makeCommandStub();
    mockedFfmpeg.mockReturnValue(cmdStub as any);
  });

  it('throws immediately when inputPaths is empty', async () => {
    await expect(service.stitchClips([], '/out/result.mp4')).rejects.toThrow(
      /inputPaths must not be empty/,
    );
    expect(mockedFfmpeg).not.toHaveBeenCalled();
  });

  it('adds each input path via .input()', async () => {
    const paths = ['/a/clip1.mp4', '/b/clip2.mp4', '/c/clip3.mp4'];

    const promise = service.stitchClips(paths, '/out/stitched.mp4');
    cmdStub._emit('end');
    await promise;

    expect(cmdStub.input).toHaveBeenCalledTimes(3);
    expect(cmdStub.input).toHaveBeenNthCalledWith(1, '/a/clip1.mp4');
    expect(cmdStub.input).toHaveBeenNthCalledWith(2, '/b/clip2.mp4');
    expect(cmdStub.input).toHaveBeenNthCalledWith(3, '/c/clip3.mp4');
  });

  it('sets complexFilter with the correct concat expression', async () => {
    const paths = ['/a/clip1.mp4', '/b/clip2.mp4'];

    const promise = service.stitchClips(paths, '/out/stitched.mp4');
    cmdStub._emit('end');
    await promise;

    expect(cmdStub.complexFilter).toHaveBeenCalledTimes(1);
    const filterArg: string = cmdStub.complexFilter.mock.calls[0][0];
    expect(filterArg).toContain('[0:v][0:a][1:v][1:a]');
    expect(filterArg).toContain('concat=n=2:v=1:a=1[v][a]');
  });

  it('passes H.264, AAC, and faststart outputOptions', async () => {
    const promise = service.stitchClips(['/a/clip1.mp4', '/b/clip2.mp4'], '/out/stitched.mp4');
    cmdStub._emit('end');
    await promise;

    expect(cmdStub.outputOptions).toHaveBeenCalledTimes(1);
    const opts: string[] = cmdStub.outputOptions.mock.calls[0][0];
    expect(opts).toContain('-c:v libx264');
    expect(opts).toContain('-preset fast');
    expect(opts).toContain('-c:a aac');
    expect(opts).toContain('-movflags +faststart');
    expect(opts).toContain('-map [v]');
    expect(opts).toContain('-map [a]');
  });

  it('calls .save() with the provided outPath', async () => {
    const promise = service.stitchClips(['/a/clip1.mp4'], '/out/result.mp4');
    cmdStub._emit('end');
    await promise;

    expect(cmdStub.save).toHaveBeenCalledWith('/out/result.mp4');
  });

  it('resolves (returns void) when the end event fires', async () => {
    const promise = service.stitchClips(['/a/clip1.mp4', '/b/clip2.mp4'], '/out/stitched.mp4');
    cmdStub._emit('end');
    const result = await promise;

    expect(result).toBeUndefined();
  });

  it('rejects with the ffmpeg error when the error event fires', async () => {
    const boom = new Error('codec not found');

    const promise = service.stitchClips(['/a/clip1.mp4'], '/out/stitched.mp4');
    cmdStub._emit('error', boom);

    await expect(promise).rejects.toThrow('codec not found');
  });

  it('builds the concat filter with the correct n= count for a single clip', async () => {
    const promise = service.stitchClips(['/only/clip.mp4'], '/out/single.mp4');
    cmdStub._emit('end');
    await promise;

    const filterArg: string = cmdStub.complexFilter.mock.calls[0][0];
    expect(filterArg).toContain('[0:v][0:a]');
    expect(filterArg).toContain('concat=n=1:v=1:a=1[v][a]');
  });
});
