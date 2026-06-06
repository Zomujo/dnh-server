import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { CommonModule } from './common/common.module';
import { CoreModule } from './core/core.module';
import { FeaturesModule } from './features/features.module';

@Module({
	imports: [CommonModule, CoreModule, FeaturesModule],
	controllers: [AppController],
})
export class AppModule {}
