import { ArgumentsHost } from '@nestjs/common';
import { ZodError } from 'zod';
import { GenerateVideoSchema } from '@inboudly/shared';
import { ZodExceptionFilter } from './zod-exception.filter';

/**
 * Minimal Express-style ArgumentsHost whose response object records the status
 * code and JSON body the filter writes. Mirrors how Nest hands an Express
 * `Response` to a filter, without booting the whole app.
 */
function mockHost() {
  const captured: { statusCode?: number; body?: unknown } = {};
  const response = {
    status(code: number) {
      captured.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      captured.body = payload;
      return this;
    },
  };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({}),
    }),
  } as unknown as ArgumentsHost;
  return { host, captured };
}

/** Produce a real ZodError exactly as the controllers do (Schema.parse). */
function makeZodError(): ZodError {
  const result = GenerateVideoSchema.safeParse({}); // missing workspaceId + prompt
  if (result.success) {
    throw new Error('fixture should be invalid — GenerateVideoSchema accepted {}');
  }
  return result.error;
}

describe('ZodExceptionFilter', () => {
  it('maps a ZodError to a 400 with a friendly, field-aware message', () => {
    const filter = new ZodExceptionFilter();
    const { host, captured } = mockHost();

    filter.catch(makeZodError(), host);

    expect(captured.statusCode).toBe(400);
    expect(captured.body).toMatchObject({
      statusCode: 400,
      error: 'Bad Request',
    });

    const { message } = captured.body as { message: string[] };
    expect(Array.isArray(message)).toBe(true);
    expect(message.length).toBeGreaterThan(0);
    // The offending fields surface so the client can point the user at them.
    const joined = message.join(' ');
    expect(joined).toContain('workspaceId');
    expect(joined).toContain('prompt');
  });

  it('keeps cross-package instanceof intact so @Catch(ZodError) dispatches', () => {
    // The shared schemas import their own copy of `zod`. If the monorepo ever
    // split zod into two physical instances, `instanceof ZodError` — and thus
    // `@Catch(ZodError)` — would silently stop matching and malformed bodies
    // would 500 again. Lock the single-instance invariant here.
    expect(makeZodError() instanceof ZodError).toBe(true);
  });
});
