//import { Perms } from "homebridge";
import {
  CharacteristicValue as ShelliesCharacteristicValue,
  Pm1,
  Pm1AenergyStatus,
} from 'shellies-ds9';

import { Ability, ServiceClass } from './base';

/**
 * This ability sets up a custom service that reports power meter readings.
 */
export class Pm1Ability extends Ability {
  /**
   * @param componentPm1 - The switch or cover component to get readings from.
   */
  constructor(readonly componentPm1: Pm1) {
    super(`Pm1 ${componentPm1.id + 1}`, `Pm1-${componentPm1.id}`);
  }

  protected get serviceClass(): ServiceClass {
    return this.customServices.Pm1;
  }

  protected initialize() {
    const s = this.service;
    const cPm1 = this.componentPm1;
    const cc = this.customCharacteristics;

    // setup Current Consumption
    s.setCharacteristic(cc.CurrentConsumption, cPm1.apower ?? 0);
    // set the initial value
    s.setCharacteristic(this.Characteristic.On, false);

    cPm1.on('change:apower', this.apowerChangeHandler, this);

    // setup Voltage
    if (cPm1.voltage !== undefined) {
      s.setCharacteristic(cc.Voltage, cPm1.voltage);

      cPm1.on('change:voltage', this.voltageChangeHandler, this);
    } else {
      this.removeCharacteristic(cc.Voltage);
    }

    // setup Electric Current
    if (cPm1.current !== undefined) {
      s.setCharacteristic(cc.ElectricCurrent, cPm1.current);

      cPm1.on('change:current', this.currentChangeHandler, this);
    } else {
      this.removeCharacteristic(cc.ElectricCurrent);
    }

    // setup Total Consumption
    if (cPm1.aenergy !== undefined) {
      s.setCharacteristic(cc.TotalConsumption, cPm1.aenergy.total / 1000);

      cPm1.on('change:aenergy', this.aenergyChangeHandler, this);
    } else {
      this.removeCharacteristic(cc.TotalConsumption);
    }
  }

  detach() {
    this.componentPm1
      .off('change:apower', this.apowerChangeHandler, this)
      .off('change:voltage', this.voltageChangeHandler, this)
      .off('change:current', this.currentChangeHandler, this)
      .off('change:aenergy', this.aenergyChangeHandler, this);
  }

  /**
   * Handles changes to the `apower` property.
   */
  protected apowerChangeHandler(value: ShelliesCharacteristicValue) {
    this.service.updateCharacteristic(
      this.customCharacteristics.CurrentConsumption,
      value as number,
    );
    // set status
    if (typeof value === 'number') {
      //value is definitely a number and not null
      if (value >= 1) {
        //this.log.info('Switch Status('+this.component.id+'): on');
        this.service.updateCharacteristic(this.Characteristic.On, true);
      } else {
        // this.log.info('Switch Status('+this.component.id+'): off');
        this.service.updateCharacteristic(this.Characteristic.On, false);
      }
    }
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
    const attr = value as unknown as Pm1AenergyStatus;

    this.service.updateCharacteristic(
      this.customCharacteristics.TotalConsumption,
      attr.total / 1000,
    );
  }
}
