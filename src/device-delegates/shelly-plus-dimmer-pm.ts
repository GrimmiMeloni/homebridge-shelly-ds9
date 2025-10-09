import { ShellyPlusPMDimmer } from 'shellies-ds9';

import { DeviceDelegate } from './base';

/**
 * Handles Shelly Pro Dimmer 1PM devices.
 */
export class ShellyPlusDimmer010PmDelegate extends DeviceDelegate {
  protected setup() {
    const d = this.device as ShellyPlusPMDimmer;

    this.addLight(d.light0, { single: true });
  }
}

DeviceDelegate.registerDelegate(
  ShellyPlusDimmer010PmDelegate,
  ShellyPlusPMDimmer,
);
