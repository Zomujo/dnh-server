import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
} from '@nestjs/common';
import { ConcernsService } from './concerns.service';
import { CreateConcernDto, UpdateConcernDto } from './dto';

@Controller('concerns')
export class ConcernsController {
	constructor(private readonly concernsService: ConcernsService) {}

	@Post()
	create(@Body() createConcernDto: CreateConcernDto) {
		return this.concernsService.create(createConcernDto);
	}

	@Get()
	findAll() {
		return this.concernsService.findAll();
	}

	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.concernsService.findOne(+id);
	}

	@Patch(':id')
	update(@Param('id') id: string, @Body() updateConcernDto: UpdateConcernDto) {
		return this.concernsService.update(+id, updateConcernDto);
	}

	@Delete(':id')
	remove(@Param('id') id: string) {
		return this.concernsService.remove(+id);
	}
}
