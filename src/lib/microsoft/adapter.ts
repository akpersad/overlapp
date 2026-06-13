import "server-only";

import type { CalendarAdapter } from "@/lib/calendar/types";
import { fetchAccountEmail, refreshAccessToken } from "./oauth";
import {
  deleteCalendarEvent,
  fetchCalendarEvents,
  insertCalendarEvent,
} from "./calendar";

// The Microsoft seam for the provider-agnostic orchestrator (calendar/sync.ts).
// All provider I/O is delegated to the oauth.ts + calendar.ts helpers.
export const microsoftAdapter: CalendarAdapter = {
  provider: "microsoft",
  label: "Microsoft",
  refreshAccessToken,
  fetchAccountEmail,
  fetchCalendarEvents,
  insertCalendarEvent,
  deleteCalendarEvent,
};
