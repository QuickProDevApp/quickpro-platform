import { Badge } from "@/components/ui/badge";

/**
 * Whether a shift suits a worker (D-037): booked on an overlapping job, or
 * inside / outside their weekly availability. Nothing when unknown.
 */
export function AvailabilityFit({
  fits,
  bookedElsewhere,
  whose,
}: {
  fits: boolean | null;
  bookedElsewhere: boolean | null;
  whose: "their" | "your";
}) {
  if (bookedElsewhere) {
    return (
      <Badge dot tone="bad">
        {whose === "your" ? "Clashes with a shift you booked" : "Booked on another job then"}
      </Badge>
    );
  }
  if (fits === true) {
    return (
      <Badge dot tone="ok">
        Within {whose} availability
      </Badge>
    );
  }
  if (fits === false) {
    return (
      <Badge dot tone="warn">
        Outside {whose} availability
      </Badge>
    );
  }
  return null;
}
