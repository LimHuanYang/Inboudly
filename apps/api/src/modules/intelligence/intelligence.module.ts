import { Module } from '@nestjs/common';
import { IntelligenceController } from './intelligence.controller';
import { ViralityScoreService } from './virality-score.service';
import { AlgorithmCoachService } from './algorithm-coach.service';

@Module({
  controllers: [IntelligenceController],
  providers: [ViralityScoreService, AlgorithmCoachService],
  exports: [ViralityScoreService, AlgorithmCoachService],
})
export class IntelligenceModule {}
