/**
 * Set to `true` by one-off scripts (src/scripts) that boot Nest modules
 * against a live database: queue workers then don't take jobs and startup
 * maintenance doesn't run, so the script does only its own work. It is read
 * when the processor classes are defined, so it must be set before they are
 * imported (see src/scripts/disable-background-jobs.ts). Never set it on the
 * API server.
 */
export const DISABLE_BACKGROUND_JOBS_ENV = 'DISABLE_BACKGROUND_JOBS';

export function backgroundJobsEnabled() {
	return process.env[DISABLE_BACKGROUND_JOBS_ENV] !== 'true';
}
