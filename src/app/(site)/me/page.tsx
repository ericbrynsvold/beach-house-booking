import {
  getBookingBlackoutDateStrings,
  getMaxStayNights,
  getStayEndExclusiveDateString,
  getStayStartDateString,
} from "@/lib/config";
import { MeClient } from "./MeClient";

export default function MePage() {
  return (
    <MeClient
      stayStart={getStayStartDateString()}
      stayEndExclusive={getStayEndExclusiveDateString()}
      blackoutDates={getBookingBlackoutDateStrings()}
      maxStayNights={getMaxStayNights()}
    />
  );
}
