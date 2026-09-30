import { Controller, Get } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';

// Liveness must stay reachable without credentials so the container orchestrator
// and the POS connectivity probe can reach it before any user has signed in.
@Public()
@Controller('health')
export class HealthController {
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'minimart-api',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    };
  }
}
