import { ZodError } from 'zod';
import { GenerateVideoSchema } from '@inboudly/shared';
import { ZodValidationPipe } from './zod-validation.pipe';

// A syntactically valid cuid (zod v3: /^c[^\s-]{8,}$/i) for the happy path.
const WS = 'clh1234567890abcdefghijkl';

describe('ZodValidationPipe', () => {
  it('returns the parsed value (with schema defaults) for a valid body', () => {
    const pipe = new ZodValidationPipe(GenerateVideoSchema);

    const out = pipe.transform({ workspaceId: WS, prompt: 'a cat surfing' });

    expect(out.workspaceId).toBe(WS);
    expect(out.prompt).toBe('a cat surfing');
    // Proves the value really went through zod (defaults applied), not passed
    // through untouched.
    expect(out.durationSec).toBe(5);
    expect(out.aspectRatio).toBe('9:16');
  });

  it('throws a ZodError on an invalid body (so ZodExceptionFilter maps it to 400)', () => {
    const pipe = new ZodValidationPipe(GenerateVideoSchema);

    expect(() => pipe.transform({})).toThrow(ZodError);
  });
});
