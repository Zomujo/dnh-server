import { DISABLE_BACKGROUND_JOBS_ENV } from '../common/utils/background-jobs';

// Imported first by every script, before any module that defines a queue
// processor: see src/common/utils/background-jobs.ts.
process.env[DISABLE_BACKGROUND_JOBS_ENV] = 'true';
