import { SortOrder } from 'mongoose';
import type { PaginationRequestDto } from '../dto';

type Filter = {
	pageFilter: {
		offset: number;
		limit: number;
		orderBy:
			| string
			| {
					[key: string]:
						| SortOrder
						| {
								$meta: any;
						  };
			  }
			| [string, SortOrder][];
	};
	searchFilter?: Record<string, any>;
};

export function generateFilter<T extends Partial<PaginationRequestDto>>(
	queryParams: T,
): Filter {
	const page = queryParams.page || 1;
	const pageSize = queryParams.pageSize || 10;

	const offset = (page - 1) * pageSize;
	const orderBy = buildSortObject(
		queryParams.orderBy,
		queryParams.orderDirection,
	);

	const output: Filter = {
		pageFilter: {
			limit: pageSize,
			offset: offset,
			orderBy: orderBy as any,
		},
	};

	if (queryParams.search && queryParams.searchFields) {
		const searchBodies = queryParams.searchFields.map((field) => ({
			[field]: new RegExp(queryParams.search!, 'i'),
		}));
		queryParams.searchQueries = searchBodies;
		output.searchFilter = {
			$or: queryParams.searchQueries,
		};
	}

	return output;
}

function buildSortObject(orderBy?: string, orderDirection?: string) {
	// Default field
	const field = orderBy || 'updatedAt';

	// Normalize direction
	let direction: number;
	if (!orderDirection) {
		direction = -1; // default
	} else if (orderDirection.toLowerCase() === 'asc') {
		direction = 1;
	} else {
		direction = -1;
	}

	return { [field]: direction };
}
