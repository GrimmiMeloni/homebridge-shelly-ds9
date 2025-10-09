import { ShellyProDualCoverPm } from 'shellies-ds9';

import { DeviceDelegate } from './base';

/**
 * Handles Shelly Pro Dual Cover PM devices.
 */
export class ShellyProDualCoverPmDelegate extends DeviceDelegate {
  protected setup() {
    const d = this.device as ShellyProDualCoverPm;
    this.addCover(d.cover0, { active: true });
    this.addCover(d.cover1, { active: true });
    //TODO fix it ...
  }
}

DeviceDelegate.registerDelegate(
  ShellyProDualCoverPmDelegate,
  ShellyProDualCoverPm,
);
