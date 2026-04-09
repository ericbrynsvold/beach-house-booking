import {
  getStayEndExclusiveDateString,
  getStayStartDateString,
} from "@/lib/config";
import { CalendarClient } from "./CalendarClient";

export default function CalendarPage() {
  return (
    <CalendarClient
      stayStart={getStayStartDateString()}
      stayEndExclusive={getStayEndExclusiveDateString()}
    />
  );
}
