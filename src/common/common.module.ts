import { Module } from '@nestjs/common';
import {
  CreateActionInterceptor,
  SuccessActionInterceptor,
  SuccessNullActionInterceptor,
  UpdateActionInterceptor,
} from './interceptors/handler-wrappers';

@Module({
  providers: [
    CreateActionInterceptor,
    SuccessNullActionInterceptor,
    SuccessActionInterceptor,
    UpdateActionInterceptor,
  ],
})
export class CommonModule {}
