import {
	Body,
	Controller,
	Delete,
	Get,
	Param,
	Patch,
	Post,
} from '@nestjs/common';
import { AdherencesService } from './adherences.service';
import { CreateAdherenceDto } from './dto/create.dto';
import { UpdateAdherenceDto } from './dto/update.dto';

@Controller('adherences')
export class AdherencesController {
	constructor(private readonly adherencesService: AdherencesService) {}

	@Post()
	create(@Body() createAdherenceDto: CreateAdherenceDto) {
		return this.adherencesService.create(createAdherenceDto);
	}

	@Get()
	findAll() {
		return this.adherencesService.findAll();
	}

	@Get(':id')
	findOne(@Param('id') id: string) {
		return this.adherencesService.findOne(+id);
	}

	@Patch(':id')
	update(
		@Param('id') id: string,
		@Body() updateAdherenceDto: UpdateAdherenceDto,
	) {
		return this.adherencesService.update(+id, updateAdherenceDto);
	}

	@Delete(':id')
	remove(@Param('id') id: string) {
		return this.adherencesService.remove(+id);
	}
}
