import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodError, type ZodIssue } from 'zod';

/**
 * Translates Zod validation failures into clean `400 Bad Request` responses.
 *
 * Several controllers validate their request body inline with
 * `Schema.parse(body)` (e.g. AiController's `text` / `image` routes and
 * VideoGenerationController). On malformed input `.parse()` throws a
 * `ZodError`, which — with no filter registered — Nest surfaces as a
 * `500 Internal Server Error`: misleading for clients and noisy in the logs.
 *
 * `@Catch(ZodError)` is deliberately narrow: it only intercepts Zod failures
 * and leaves every other exception (including the `HttpException` /
 * `BadRequestException` instances thrown deeper in the handlers) to Nest's
 * default pipeline, so it composes with the rest of the error handling rather
 * than replacing it.
 *
 * The response mirrors Nest's own ValidationPipe envelope
 * (`{ statusCode, error, message: string[] }`) so client-side code can treat
 * Zod and class-validator failures identically.
 */
@Catch(ZodError)
export class ZodExceptionFilter implements ExceptionFilter<ZodError> {
  private readonly logger = new Logger(ZodExceptionFilter.name);

  catch(exception: ZodError, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    const message = exception.errors.map((issue) => this.describe(issue));
    if (message.length === 0) {
      // ZodError with no issues should never happen in practice, but never
      // hand the client an empty message.
      message.push('Invalid request body');
    }

    // Validation failures are client errors, not server faults — log at debug
    // so they don't pollute error-level monitoring.
    this.logger.debug(`Rejected invalid request body: ${message.join('; ')}`);

    response.status(HttpStatus.BAD_REQUEST).json({
      statusCode: HttpStatus.BAD_REQUEST,
      error: 'Bad Request',
      message,
    });
  }

  /** e.g. `workspaceId: Invalid cuid` — path-prefixed when a path exists. */
  private describe(issue: ZodIssue): string {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  }
}
