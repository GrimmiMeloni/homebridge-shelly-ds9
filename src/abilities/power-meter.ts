import {
  CharacteristicValue as ShelliesCharacteristicValue,
  Cover,
  Switch,
  SwitchEnergyCounterAttributes,
} from 'shellies-ds9';

import { Ability, ServiceClass } from './base';

/**
* This ability sets up a custom service that reports power meter readings.
 */
export class PowerMeterAbility extends Ability {
  /**
   * @param component - The switch or cover component to get readings from.
   */
  constructor(readonly component: Switch | Cover) {
    super(
      `Power Meter ${component.id + 1}`,
      `power-meter-${component.id}`,
    );
  }

  protected get serviceClass(): ServiceClass {
    return this.customServices.PowerMeter;
  }

  protected initialize() {
    const s = this.service;
    const c = this.component;
    const cc = this.customCharacteristics;

    // setup Current Consumption
    s.setCharacteristic(
      cc.CurrentConsumption,
      c.apower ?? 0,
    );

    c.on('change:apower', this.apowerChangeHandler, this);

    // setup Voltage
    if (c.voltage !== undefined) {
      s.setCharacteristic(
        cc.Voltage,
        c.voltage,
      );

      c.on('change:voltage', this.voltageChangeHandler, this);
    } else {
      this.removeCharacteristic(cc.Voltage);
    }

    // setup Electric Current
    if (c.current !== undefined) {
      s.setCharacteristic(
        cc.ElectricCurrent,
        c.current,
      );

      c.on('change:current', this.currentChangeHandler, this);
    } else {
      this.removeCharacteristic(cc.ElectricCurrent);
    }

    // setup Total Consumption
    if (c.aenergy !== undefined) {
      s.setCharacteristic(
        cc.TotalConsumption,
        c.aenergy.total / 1000,
      );

      c.on('change:aenergy', this.aenergyChangeHandler, this);
    } else {
      this.removeCharacteristic(cc.TotalConsumption);
    }
  }

  detach() {
    this.component
      .off('change:apower', this.apowerChangeHandler, this)
      .off('change:voltage', this.voltageChangeHandler, this)
      .off('change:current', this.currentChangeHandler, this)
      .off('change:aenergy', this.aenergyChangeHandler, this);
  }

  /**
   * Handles changes to the `apower` property.
   */
  protected apowerChangeHandler(value: ShelliesCharacteristicValue) {
    /**
     * Handles changes to the 'apower' property. HomeKit does not support negative values for the 'Current Consumption' characteristic.
     * For the use case of this plugin, knowing the negative voltage is not necessary, so we ensure that the value is never negative.
     */
    const positiveValue = Math.max(0, value as number);
    this.service.updateCharacteristic(
      this.customCharacteristics.CurrentConsumption,
      positiveValue,
    );
  }

  /**
   * Handles changes to the `voltage` property.
   */
  protected voltageChangeHandler(value: ShelliesCharacteristicValue) {
    this.service.updateCharacteristic(
      this.customCharacteristics.Voltage,
      value as number,
    );
  }

  /**
   * Handles changes to the `current` property.
   */
  protected currentChangeHandler(value: ShelliesCharacteristicValue) {
    this.service.updateCharacteristic(
      this.customCharacteristics.ElectricCurrent,
      value as number,
    );
  }

  /**
   * Handles changes to the `aenergy` property.
   */
  protected aenergyChangeHandler(value: ShelliesCharacteristicValue) {
    const attr = (value as unknown) as SwitchEnergyCounterAttributes;

    this.service.updateCharacteristic(
      this.customCharacteristics.TotalConsumption,
      attr.total / 1000,
    );
  }
}
