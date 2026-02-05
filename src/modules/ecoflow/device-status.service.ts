import { Injectable } from '@nestjs/common';
import { ChargeDto, DeviceStatusDto } from './dto/device-status.dto';

/**
 * Each entry describes how to pull one value out of the flat raw-properties
 * object that the EcoFlow API returns.  Adding a new field later is a single
 * entry here — no other code needs to change.
 *
 * NOTE: raw keys contain literal dots (e.g. "pd.soc").  They are NOT nested
 * paths — use bracket notation: props['pd.soc'].
 */
interface FieldExtractor {
  /** Where to write the value on the output (used only for documentation) */
  key: string;
  /** Human-readable label (can be used by CLI display layer) */
  label: string;
  /** Pure function: flat raw props → extracted value */
  extract: (props: Record<string, unknown>) => unknown;
}

const FIELD_EXTRACTORS: FieldExtractor[] = [
  {
    key: 'charge.percent',
    label: 'Battery %',
    extract: (p) => Number(p['pd.soc'] ?? p['bms_bmsStatus.soc'] ?? 0),
  },
  {
    key: 'inputWatts',
    label: 'Input watts',
    extract: (p) => Number(p['pd.wattsInSum'] ?? p['inv.inputWatts'] ?? 0),
  },
  {
    key: 'outputWatts',
    label: 'Output watts',
    extract: (p) => Number(p['pd.wattsOutSum'] ?? p['inv.outputWatts'] ?? 0),
  },
  {
    key: 'gridConnected',
    label: 'Grid connected',
    extract: (p) => p['bms_emsStatus.chgLinePlug'] === 1,
  },
];

@Injectable()
export class DeviceStatusService {
  /**
   * Transform the flat raw-properties object into a typed DeviceStatusDto.
   * @param rawProps  The flat Record returned inside the EcoFlow quota envelope's `.data`
   * @param deviceName  The human-readable name from the device-list response
   */
  parse(rawProps: Record<string, unknown>, deviceName: string): DeviceStatusDto {
    const charge = new ChargeDto();
    charge.percent = FIELD_EXTRACTORS.find((f) => f.key === 'charge.percent')!.extract(rawProps) as number;

    const dto       = new DeviceStatusDto();
    dto.name        = deviceName;
    dto.charge      = charge;
    dto.inputWatts  = FIELD_EXTRACTORS.find((f) => f.key === 'inputWatts')!.extract(rawProps) as number;
    dto.outputWatts = FIELD_EXTRACTORS.find((f) => f.key === 'outputWatts')!.extract(rawProps) as number;
    dto.gridConnected = FIELD_EXTRACTORS.find((f) => f.key === 'gridConnected')!.extract(rawProps) as boolean;

    return dto;
  }
}
