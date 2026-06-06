import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
} from '@nestjs/common';
import { ChronicConditionsService } from './chronic-conditions.service';
import { CreateChronicConditionDto } from './dto/create.dto';
import { UpdateChronicConditionDto } from './dto/update.dto';

@Controller('chronic-conditions')
export class ChronicConditionsController {
	constructor(
		private readonly chronicConditionsService: ChronicConditionsService,
	) {}

	@Post()
	create(@Body() createChronicConditionDto: CreateChronicConditionDto) {
		return this.chronicConditionsService.create(createChronicConditionDto);
	}

	@Get()
	findAll() {
		return this.chronicConditionsService.findAll();
	}

	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.chronicConditionsService.findOne(+id);
	}

	@Patch(':id')
	update(
		@Param('id') id: string,
		@Body() updateChronicConditionDto: UpdateChronicConditionDto,
	) {
		return this.chronicConditionsService.update(+id, updateChronicConditionDto);
	}

	@Delete(':id')
	remove(@Param('id') id: string) {
		return this.chronicConditionsService.remove(+id);
	}
}
