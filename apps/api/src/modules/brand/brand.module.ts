import { Module } from '@nestjs/common';
import { BrandController } from './brand.controller';
import { BrandService } from './brand.service';
import { WorkspacesService } from '../workspaces/workspaces.service';

@Module({
  controllers: [BrandController],
  providers: [BrandService, WorkspacesService],
  exports: [BrandService],
})
export class BrandModule {}
