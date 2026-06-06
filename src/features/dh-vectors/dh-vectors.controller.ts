import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
	Query,
} from '@nestjs/common';
import { DhVectorsService } from './dh-vectors.service';
import { CreateDhVectorDto, QueryDhVectorsDto, UpdateDhVectorDto } from './dto';

@Controller('dh-vectors')
export class DhVectorsController {
	constructor(private readonly dhVectorsService: DhVectorsService) {}

	@Post()
	create(@Body() createDhVectorDto: CreateDhVectorDto) {
		return this.dhVectorsService.create(createDhVectorDto);
	}

	@Get()
	findAll(@Query() query: QueryDhVectorsDto) {
		return this.dhVectorsService.findAll(query);
	}

	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.dhVectorsService.findOne(+id);
	}

	@Patch(':id')
	update(
		@Param('id') id: string,
		@Body() updateDhVectorDto: UpdateDhVectorDto,
	) {
		return this.dhVectorsService.update(+id, updateDhVectorDto);
	}

	@Delete(':id')
	remove(@Param('id') id: string) {
		return this.dhVectorsService.remove(+id);
	}
}
