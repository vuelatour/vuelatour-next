import { apiServer } from "./server";
import type { FleetUpcoming } from "@/types/engineering";

export function getFleetUpcoming(dias = 60) {
  return apiServer<FleetUpcoming>("/v1/engineering/upcoming", {
    searchParams: { dias },
    cache: "no-store",
  });
}
