import { ShellyPlusRGBWPM } from '../custom-devices';
import { DeviceDelegate } from './base';

/**
 * Handles Shelly Plus RGBW PM devices.
 *
 * This is a workaround implementation that provides basic on/off and brightness
 * control using the Light components (light:0 through light:3). Each channel
 * appears as a separate dimmable lightbulb in HomeKit.
 * Full RGB/color support is not available as it requires RGB component
 * support in the shellies-ds9 library.
 */
export class ShellyPlusRGBWPMDelegate extends DeviceDelegate {
  protected setup() {
    const d = this.device as ShellyPlusRGBWPM;

    // Add all 4 light channels
    this.addLight(d.light0);
    this.addLight(d.light1);
    this.addLight(d.light2);
    this.addLight(d.light3);
  }
}

DeviceDelegate.registerDelegate(
  ShellyPlusRGBWPMDelegate,
  ShellyPlusRGBWPM,
);
