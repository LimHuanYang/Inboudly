import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ApprovalsService } from './approvals.service';
import { SupabaseAuthGuard } from '../../common/auth/auth.guard';
import {
  CreateApprovalWorkflowSchema,
  ApproveOrRejectSchema,
  type CreateApprovalWorkflowInput,
  type ApproveOrRejectInput,
} from '@inboudly/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@ApiTags('approvals')
@Controller('approvals')
export class ApprovalsController {
  constructor(private approvals: ApprovalsService) {}

  @Post()
  @UseGuards(SupabaseAuthGuard)
  @ApiBearerAuth()
  create(@Body(new ZodValidationPipe(CreateApprovalWorkflowSchema)) input: CreateApprovalWorkflowInput) {
    return this.approvals.create(input);
  }

  // Public — used by external clients via shareable link, no auth required
  @Get('shareable/:token')
  getShareable(@Param('token') token: string) {
    return this.approvals.getByShareableToken(token);
  }

  // Public decision endpoint for shareable-link approvers
  @Post('decide')
  decide(@Body(new ZodValidationPipe(ApproveOrRejectSchema)) input: ApproveOrRejectInput) {
    return this.approvals.decide(input);
  }
}
