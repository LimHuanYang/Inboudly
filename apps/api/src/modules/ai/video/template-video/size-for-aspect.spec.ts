import { sizeForAspect } from './size-for-aspect';

it('maps each aspect ratio to standard portrait/square/landscape dims', () => {
  expect(sizeForAspect('9:16')).toEqual({ width: 1080, height: 1920 });
  expect(sizeForAspect('1:1')).toEqual({ width: 1080, height: 1080 });
  expect(sizeForAspect('16:9')).toEqual({ width: 1920, height: 1080 });
});

it('falls back to 9:16 for an unknown ratio', () => {
  expect(sizeForAspect('weird' as never)).toEqual({ width: 1080, height: 1920 });
});
