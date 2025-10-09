import { CharacteristicValue } from 'homebridge';
import { Cover } from 'shellies-ds9';

import { Ability, ServiceClass } from './base';

const names = {
  door: 'Door',
  window: 'Window',
  windowCovering: 'Window Covering',
};

export class CoverAbility extends Ability {
  /**
   * Flag to track if the ability is fully initialized and active.
   */
  private _isInitialized = false;

  /**
   * @param component - The cover component to control.
   * @param type - The type of cover.
   */
  constructor(
    readonly component: Cover,
    readonly type: 'door' | 'window' | 'windowCovering' = 'window',
  ) {
    super(`${names[type]} ${component.id + 1}`, `${type}-${component.id}`);
  }

  protected get serviceClass(): ServiceClass {
    if (this.type === 'door') {
      return this.Service.Door;
    } else if (this.type === 'windowCovering') {
      return this.Service.WindowCovering;
    }
    return this.Service.Window;
  }

  /**
   * The current state of the cover.
   */
  protected get positionState(): CharacteristicValue {
    const state = this.component.state;

    if (state === 'opening') {
      return this.Characteristic.PositionState.INCREASING;
    } else if (state === 'closing') {
      return this.Characteristic.PositionState.DECREASING;
    }

    return this.Characteristic.PositionState.STOPPED;
  }

  /**
   * The current position of the cover.
   */
  protected get currentPosition(): number {
    return this.component.current_pos ?? 0;
  }

  /**
   * The target position that the cover is moving towards.
   */
  protected get targetPosition(): number {
    return this.component.target_pos ?? this.currentPosition;
  }

  protected initialize() {
    // abort if this cover hasn't been calibrated
    if (!this.component.pos_control) {
      this.log.warn('Only calibrated covers are supported.');
      return;
    }

    // set the initial values
    this.service
      .setCharacteristic(this.Characteristic.PositionState, this.positionState)
      .setCharacteristic(
        this.Characteristic.CurrentPosition,
        this.currentPosition,
      )
      .setCharacteristic(
        this.Characteristic.TargetPosition,
        this.targetPosition,
      );

    // listen for commands from HomeKit
    this.service
      .getCharacteristic(this.Characteristic.TargetPosition)
      .onSet(this.targetPositionSetHandler.bind(this))
      .onGet(this.targetPositionGetHandler.bind(this));

    // add onGet handlers for state retrieval
    this.service
      .getCharacteristic(this.Characteristic.PositionState)
      .onGet(this.positionStateGetHandler.bind(this));

    this.service
      .getCharacteristic(this.Characteristic.CurrentPosition)
      .onGet(this.currentPositionGetHandler.bind(this));

    // listen for updates from the device
    this.component
      .on('change:state', this.stateChangeHandler, this)
      .on('change:current_pos', this.currentPosChangeHandler, this)
      .on('change:target_pos', this.targetPosChangeHandler, this);

    // mark as initialized after all setup is complete
    this._isInitialized = true;
  }

  detach() {
    // mark as no longer initialized to prevent race conditions with event handlers
    this._isInitialized = false;

    this.component
      .off('change:state', this.stateChangeHandler, this)
      .off('change:current_pos', this.currentPosChangeHandler, this)
      .off('change:target_pos', this.targetPosChangeHandler, this);
  }

  /**
   * Refreshes the state of the cover after device reconnection.
   */
  refreshState() {
    this.log.debug(`Refreshing cover ${this.component.id} state after reconnection`);
    this.updateStates();
  }

  /**
   * Handles changes to the TargetPosition characteristic.
   */
  protected async targetPositionSetHandler(value: CharacteristicValue) {
    if (value === this.component.target_pos) {
      return;
    }

    // check if the device is connected before sending commands
    if (!this.component.device.rpcHandler.connected) {
      this.log.error('Cannot set target position: device is not connected');
      throw this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE;
    }

    try {
      await this.component.goToPosition(value as number);
    } catch (e) {
      this.log.error(
        'Failed to set target position:',
        e instanceof Error ? e.message : e,
      );
      throw this.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE;
    }
  }

  /**
   * Handles requests for the current value of the TargetPosition characteristic.
   */
  protected targetPositionGetHandler(): CharacteristicValue {
    return this.targetPosition;
  }

  /**
   * Handles requests for the current value of the PositionState characteristic.
   */
  protected positionStateGetHandler(): CharacteristicValue {
    return this.positionState;
  }

  /**
   * Handles requests for the current value of the CurrentPosition characteristic.
   */
  protected currentPositionGetHandler(): CharacteristicValue {
    return this.currentPosition;
  }

  /**
   * Handles changes to the `state` property.
   */
  protected stateChangeHandler() {
    if (!this._isInitialized) {
      return;
    }

    this.log.debug(
      `${this.component.id} state changed to ${this.positionState}`,
      {
        target: this.targetPosition,
        current: this.currentPosition,
      },
    );
    this.updateStates();
  }

  /**
   * Updates all states.
   *
   * Shelly does not send all attributes in a single notification.
   * We apparently need to update all states when any of them change, otherwise HomeKit
   * gets confused and thinks the cover is in a different state than it actually is.
   */
  protected updateStates() {
    this.service
      .getCharacteristic(this.Characteristic.PositionState)
      .updateValue(this.positionState);
    this.service
      .getCharacteristic(this.Characteristic.TargetPosition)
      .updateValue(this.targetPosition);
    this.service
      .getCharacteristic(this.Characteristic.CurrentPosition)
      .updateValue(this.currentPosition);
  }

  /**
   * Handles changes to the `current_pos` property.
   */
  protected currentPosChangeHandler() {
    if (!this._isInitialized) {
      return;
    }

    this.log.debug(
      `${this.component.id} position changed to ${this.currentPosition}`,
      {
        target: this.targetPosition,
        state: this.positionState,
      },
    );
    this.updateStates();

    // Shelly does not update the target position when it is triggered with a physical switch.
    // If we don't change the target position, HomeKit waits for the original position forever.
    // Only update the target when the cover has stopped and target doesn't match current position.
    if (this.positionState === this.Characteristic.PositionState.STOPPED &&
        this.targetPosition !== this.currentPosition) {
      this.service
        .getCharacteristic(this.Characteristic.TargetPosition)
        .updateValue(this.currentPosition);
    }
  }

  /**
   * Handles changes to the `target_pos` property.
   */
  protected targetPosChangeHandler() {
    if (!this._isInitialized) {
      return;
    }

    this.log.debug(
      `${this.component.id} target position changed to ${this.targetPosition}`,
      {
        state: this.positionState,
        current: this.currentPosition,
      },
    );
    this.updateStates();
  }
}
