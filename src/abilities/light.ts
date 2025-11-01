import { CharacteristicValue } from 'homebridge';
import { CharacteristicValue as ShelliesCharacteristicValue, Light } from 'shellies-ds9';

import { Ability, ServiceClass } from './base';

export class LightAbility extends Ability {
  /**
   * Tracks the target on/off state being sent to the device.
   * Used to prevent race conditions when multiple commands are sent rapidly.
   */
  private pendingOutputState: boolean | null = null;

  /**
   * Tracks the target brightness being sent to the device.
   * Used to prevent race conditions when multiple commands are sent rapidly.
   */
  private pendingBrightness: number | null = null;

  /**
   * @param component - The light component to control.
   */
  constructor(readonly component: Light) {
    super(
      `Light ${component.id + 1}`,
      `light-${component.id}`,
    );

  }

  protected get serviceClass(): ServiceClass {
    return this.Service.Lightbulb;
  }

  protected initialize() {
    // set the initial value
    this.service.setCharacteristic(
      this.Characteristic.On,
      this.component.output,
    );

    // listen for commands from HomeKit
    this.service.getCharacteristic(this.Characteristic.On)
      .onSet(this.onSetHandler.bind(this))
      .onGet(this.onGetHandler.bind(this));
    this.service.getCharacteristic(this.Characteristic.Brightness)
      .onSet(this.brightnessSetHandler.bind(this))
      .onGet(this.brightnessGetHandler.bind(this));

    // listen for updates from the device
    this.component.on('change:output', this.outputChangeHandler, this);
    this.component.on('change:brightness', this.brightnessChangeHandler, this);
  }

  detach() {
    this.component.off('change:output', this.outputChangeHandler, this);
    this.component.off('change:brightness', this.brightnessChangeHandler, this);
  }

  /**
   * Handles changes to the Light.On characteristic.
   */
  protected async onSetHandler(value: CharacteristicValue) {
    const targetState = value as boolean;

    // Check against both current state AND pending state to avoid race conditions
    // when multiple commands are sent rapidly
    if (targetState === this.component.output && targetState === this.pendingOutputState) {
      this.log.debug(
        `Light ${this.component.id} on/off: skipping redundant command (target: ${targetState}, current: ${this.component.output}, pending: ${this.pendingOutputState})`,
      );
      return;
    }

    // Check if the device is connected before sending commands
    if (!this.component.device.rpcHandler.connected) {
      this.log.error(`Light ${this.component.id}: cannot set on/off - device is not connected`);
      throw this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE;
    }

    this.log.info(
      `Light ${this.component.id}: setting on/off to ${targetState} (current: ${this.component.output}, pending: ${this.pendingOutputState})`,
    );

    // Track the pending state
    this.pendingOutputState = targetState;

    try {
      await this.component.set(targetState);
      // Clear pending state after successful command
      this.pendingOutputState = null;
    } catch (e) {
      // Clear pending state on error
      this.pendingOutputState = null;
      this.log.error(
        `Light ${this.component.id} failed to set on/off:`,
        e instanceof Error ? e.message : e,
      );
      throw this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE;
    }
  }

  /**
   * Handles requests for the current value of the Light.On characteristic.
   */
  protected onGetHandler(): CharacteristicValue {
    return this.component.output;
  }

  /**
   * Handles changes to the `output` property.
   */
  protected outputChangeHandler(value: ShelliesCharacteristicValue) {
    const outputState = value as boolean;

    if (outputState){
      this.log.info('Light Status('+this.component.id+'): on');
    }else{
      this.log.info('Light Status('+this.component.id+'): off');
    }

    // Clear pending state when device confirms the change
    if (this.pendingOutputState === outputState) {
      this.pendingOutputState = null;
    }

    this.service.getCharacteristic(this.Characteristic.On)
      .updateValue(outputState);
  }

  /**
   * Handles changes to the Light.Brightness characteristic.
   */
  protected async brightnessSetHandler(value: CharacteristicValue) {
    const targetBrightness = value as number;

    // Check against both current brightness AND pending brightness to avoid race conditions
    // when multiple commands are sent rapidly
    if (targetBrightness === this.component.brightness && targetBrightness === this.pendingBrightness) {
      this.log.debug(
        `Light ${this.component.id} brightness: skipping redundant command (target: ${targetBrightness}, current: ${this.component.brightness}, pending: ${this.pendingBrightness})`,
      );
      return;
    }

    // Check if the device is connected before sending commands
    if (!this.component.device.rpcHandler.connected) {
      this.log.error(`Light ${this.component.id}: cannot set brightness - device is not connected`);
      throw this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE;
    }

    this.log.info(
      `Light ${this.component.id}: setting brightness to ${targetBrightness} (current: ${this.component.brightness}, pending: ${this.pendingBrightness})`,
    );

    // Track the pending brightness
    this.pendingBrightness = targetBrightness;

    try {
      await this.component.set(undefined, targetBrightness);
      // Clear pending brightness after successful command
      this.pendingBrightness = null;
    } catch (e) {
      // Clear pending brightness on error
      this.pendingBrightness = null;
      this.log.error(
        `Light ${this.component.id} failed to set brightness:`,
        e instanceof Error ? e.message : e,
      );
      throw this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE;
    }
  }

  /**
   * Handles requests for the current value of the Light.Brightness characteristic.
   */
  protected brightnessGetHandler(): CharacteristicValue {
    return this.component.brightness;
  }

  /**
   * Handles changes to the `brightness` property.
   */
  protected brightnessChangeHandler(value: ShelliesCharacteristicValue) {
    const brightness = value as number;

    this.log.info('Light Status('+this.component.id+'): '+brightness);

    // Clear pending brightness when device confirms the change
    if (this.pendingBrightness === brightness) {
      this.pendingBrightness = null;
    }

    this.service.getCharacteristic(this.Characteristic.Brightness)
      .updateValue(brightness);
  }
}
