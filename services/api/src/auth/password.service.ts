import { Injectable } from '@nestjs/common';
import { hash as argon2Hash, verify as argon2Verify } from '@node-rs/argon2';
import { AppConfigService } from '../config/app-config.service.js';

const ARGON2ID_ALGORITHM = 2;

@Injectable()
export class PasswordService {
  constructor(private readonly config: AppConfigService) {}

  async hash(password: string): Promise<string> {
    return argon2Hash(password, {
      algorithm: ARGON2ID_ALGORITHM,
      memoryCost: this.config.argon2MemoryCost,
      timeCost: this.config.argon2TimeCost,
      parallelism: this.config.argon2Parallelism,
    });
  }

  async verify(password: string, encoded: string): Promise<boolean> {
    return argon2Verify(encoded, password);
  }
}
