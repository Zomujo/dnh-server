import { APP_TIME_ZONE } from './common/utils/time-zone';

// Imported first in main.ts, before any module computes a date. Pinning the
// zone here means moving the server to another region (or a host whose TZ
// is unset) can't shift which day a dose or reading falls on.
process.env.TZ = APP_TIME_ZONE;
