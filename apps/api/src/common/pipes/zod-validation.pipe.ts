import { Injectable, PipeTransform } from '@nestjs/common';
import { ZodSchema } from 'zod';

/**
 * Validates (and parses) a handler argument against a Zod schema, so routes can
 * declare `@Body(new ZodValidationPipe(SomeSchema)) input: SomeInput` instead
 * of calling `SomeSchema.parse(body)` by hand inside the handler.
 *
 * On failure it lets the raw `ZodError` propagate; `ZodExceptionFilter`
 * (registered globally in `main.ts`) turns that into a `400 Bad Request`. Keeping
 * the formatting in the filter means the inline-`parse` style and this pipe
 * produce identical error responses.
 */
@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    return this.schema.parse(value);
  }
}
