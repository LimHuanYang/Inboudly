import { BadRequestException } from '@nestjs/common';
import { HiggsfieldVideoProvider } from './higgsfield-video.provider';

describe('HiggsfieldVideoProvider', () => {
  const provider = new HiggsfieldVideoProvider({} as any, {} as any);

  it('throws a clear error when no Higgsfield key is supplied', async () => {
    await expect(
      provider.generate('', {
        workspaceId: 'w', prompt: 'a cat', durationSec: 5,
        aspectRatio: '9:16', model: 'higgsfield',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('requires a reference image (image-to-video model)', async () => {
    await expect(
      provider.generate('hf-key:hf-secret', {
        workspaceId: 'w', prompt: 'a cat', durationSec: 5,
        aspectRatio: '9:16', model: 'higgsfield',
      }),
    ).rejects.toThrow(/reference image/i);
  });
});
