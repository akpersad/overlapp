import "server-only";

import type { CalendarAdapter } from "@/lib/calendar/types";
import { fetchAccountEmail, refreshAccessToken } from "./oauth";
import {
  deleteCalendarEvent,
  fetchCalendarEvents,
  insertCalendarEvent,
} from "./calendar";

// The Google seam for the provider-agnostic orchestrator (calendar/sync.ts).
// All provider I/O is delegated to the existing oauth.ts + calendar.ts helpers.
export const googleAdapter: CalendarAdapter = {
  provider: "google",
  label: "Google",
  refreshAccessToken,
  fetchAccountEmail,
  fetchCalendarEvents,
  insertCalendarEvent,
  deleteCalendarEvent,
};
