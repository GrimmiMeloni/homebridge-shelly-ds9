import {
  Device,
  component,
  BluetoothLowEnergy,
  Cloud,
  Ethernet,
  Input,
  Light,
  Mqtt,
  OutboundWebSocket,
  Script,
  Ui,
  WiFi,
} from 'shellies-ds9';

/**
 * Custom device class for Shelly Plus RGBW PM.
 *
 * This is a workaround implementation that treats the RGBW PM as a 4-channel dimmer
 * with basic on/off and brightness control via Light components (light:0 through light:3).
 * Full RGB/color support is not implemented as it requires RGB component
 * support in the shellies-ds9 library.
 *
 * Note: This assumes the device exposes 'light:0' through 'light:3' components in its API.
 * If the actual API uses 'rgb:0' instead, this workaround will not function
 * and proper RGB component support will be needed in shellies-ds9.
 */
export class ShellyPlusRGBWPM extends Device {
  static readonly model = 'SNDC-0D4P10WW';
  static readonly modelName = 'Shelly Plus RGBW PM';

  @component
  readonly wifi!: WiFi;

  @component
  readonly ethernet!: Ethernet;

  @component
  readonly bluetoothLowEnergy!: BluetoothLowEnergy;

  @component
  readonly cloud!: Cloud;

  @component
  readonly mqtt!: Mqtt;

  @component
  readonly outboundWebSocket!: OutboundWebSocket;

  @component
  readonly input0!: Input;

  @component
  readonly light0!: Light;

  @component
  readonly light1!: Light;

  @component
  readonly light2!: Light;

  @component
  readonly light3!: Light;

  @component
  readonly script!: Script;

  @component
  readonly ui!: Ui;

  constructor(...args: ConstructorParameters<typeof Device>) {
    super(...args);

    this.wifi = new WiFi(this);
    this.ethernet = new Ethernet(this);
    this.bluetoothLowEnergy = new BluetoothLowEnergy(this);
    this.cloud = new Cloud(this);
    this.mqtt = new Mqtt(this);
    this.outboundWebSocket = new OutboundWebSocket(this);
    this.input0 = new Input(this, 0);
    this.light0 = new Light(this, 0);
    this.light1 = new Light(this, 1);
    this.light2 = new Light(this, 2);
    this.light3 = new Light(this, 3);
    this.script = new Script(this);
    this.ui = new Ui(this);
  }
}
