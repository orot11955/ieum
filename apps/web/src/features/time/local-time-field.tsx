import { Field, Notice, Select, Stack } from "@ieum/ui";
import {
  formatOffset,
  resolveLocal,
  type LocalResolution,
} from "../../shared/time";

/** `datetime-local` gives `YYYY-MM-DDTHH:mm`; the server wants seconds too. */
export function withSeconds(local: string): string {
  return local.length === 16 ? `${local}:00` : local;
}

export type ResolvedTime =
  | { ok: true; at: string; offsetMinutes: number; explicitOffset?: number }
  | { ok: false; message: string };

/** Turns a wall time, zone and the user's choice for a repeated hour into one instant. */
export function resolveChoice(
  local: string,
  zone: string,
  chosenOffset: string,
): ResolvedTime {
  const resolution = resolveLocal(withSeconds(local), zone);
  return describe(resolution, chosenOffset);
}

function describe(resolution: LocalResolution, chosen: string): ResolvedTime {
  switch (resolution.kind) {
    case "invalid":
      return { ok: false, message: "날짜와 시각, 시간대를 확인해 주세요." };
    case "gap":
      return {
        ok: false,
        message:
          "이 시각은 시간대의 시계 변경으로 건너뛰어져 존재하지 않습니다. 다른 시각을 골라 주세요.",
      };
    case "unique":
      return {
        ok: true,
        at: resolution.at,
        offsetMinutes: resolution.offsetMinutes,
      };
    case "ambiguous": {
      const picked = resolution.options.find(
        (option) => String(option.offsetMinutes) === chosen,
      );
      if (!picked)
        return {
          ok: false,
          message: "이 시각은 하루에 두 번 있습니다. 어느 쪽인지 골라 주세요.",
        };
      return {
        ok: true,
        at: picked.at,
        offsetMinutes: picked.offsetMinutes,
        explicitOffset: picked.offsetMinutes,
      };
    }
  }
}

/**
 * A wall-clock input for one zone. When the time falls in a clock change it
 * explains the problem and, for a repeated hour, asks which of the two is meant.
 */
export function LocalTimeField({
  label,
  value,
  zone,
  offset,
  onChange,
  onOffsetChange,
  error,
}: {
  label: string;
  value: string;
  zone: string;
  offset: string;
  onChange: (value: string) => void;
  onOffsetChange: (offset: string) => void;
  error?: string | undefined;
}) {
  const resolution: LocalResolution | null = value
    ? resolveLocal(withSeconds(value), zone)
    : null;
  return (
    <Stack>
      <Field
        label={label}
        type="datetime-local"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          onOffsetChange("");
        }}
        error={error}
      />
      {resolution?.kind === "gap" && (
        <Notice tone="warning">
          이 시각은 {zone}의 시계 변경으로 건너뛰어져 존재하지 않습니다. 다른
          시각을 골라 주세요.
        </Notice>
      )}
      {resolution?.kind === "ambiguous" && (
        <Select
          label={`${label}: 하루에 두 번 있는 시각입니다`}
          value={offset}
          onChange={(event) => onOffsetChange(event.target.value)}
          help="시계를 되돌리는 날에는 같은 시각이 두 번 지나갑니다."
        >
          <option value="">선택</option>
          {resolution.options.map((option, index) => (
            <option key={option.offsetMinutes} value={option.offsetMinutes}>
              {index === 0 ? "먼저 지나가는 쪽" : "나중에 지나가는 쪽"} (UTC
              {formatOffset(option.offsetMinutes)})
            </option>
          ))}
        </Select>
      )}
    </Stack>
  );
}

/** Suggestions for the time zone input. */
export function TimeZoneList({ id }: { id: string }) {
  let zones: string[] = [];
  try {
    zones = Intl.supportedValuesOf("timeZone");
  } catch {
    zones = [];
  }
  return (
    <datalist id={id}>
      {zones.map((zone) => (
        <option key={zone} value={zone} />
      ))}
    </datalist>
  );
}
