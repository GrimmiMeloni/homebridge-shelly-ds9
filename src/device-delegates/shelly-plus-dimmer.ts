import { ShellyPlusDimmer } from 'shellies-ds9';

import { DeviceDelegate } from './base';

/**
 * Handles Shelly Pro Dimmer 1PM devices.
 */
export class ShellyPlusDimmer010Delegate extends DeviceDelegate {
  protected setup() {
    const d = this.device as ShellyPlusDimmer;

    this.addLight(d.light0, { single: true });
  }
}

DeviceDelegate.registerDelegate(ShellyPlusDimmer010Delegate, ShellyPlusDimmer);
