import { SortOrder } from 'mongoose';
import { escapeRegExp, resolveSearchableFields } from '@/common/utils/helpers';
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

/**
 * @param searchableFieldsSource The same projection passed to `.select()` by
 * the caller's query — the single source of truth for which fields are safe
 * to run a search regex against. Omit to disable client-supplied
 * `searchFields` entirely (the safe default) for endpoints that don't
 * project a fixed field set.
 */
export function generateFilter<T extends Partial<PaginationRequestDto>>(
	queryParams: T,
	searchableFieldsSource?: string | string[],
	allFields?: string[],
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

	const allowedSearchFields = resolveSearchableFields(
		searchableFieldsSource,
		allFields,
	);
	const requestedFields = (queryParams.searchFields || []).filter((field) =>
		allowedSearchFields.includes(field),
	);

	if (queryParams.search && requestedFields.length) {
		const escapedSearch = escapeRegExp(queryParams.search);
		const searchBodies = requestedFields.map((field) => ({
			[field]: new RegExp(escapedSearch, 'i'),
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
