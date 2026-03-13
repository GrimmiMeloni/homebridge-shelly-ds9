import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  PlatformConfig,
} from 'homebridge';

import {
  Device,
  DeviceDiscoverer,
  DeviceId,
  DeviceIdentifiers,
  MdnsDeviceDiscoverer,
  Shellies,
} from 'shellies-ds9';

import { CustomCharacteristics, createCharacteristics } from './utils/characteristics';
import { CustomServices, createServices } from './utils/services';
import { DeviceCache } from './utils/device-cache';
import { DeviceDelegate } from './device-delegates';
import { PlatformOptions } from './config';
import { ShellyPlusRGBWPM } from './custom-devices';

// Import all device delegates to ensure they are registered
import './device-delegates';

type AccessoryUuid = string;

/**
 * The name of this plugin.
 */
export const PLUGIN_NAME = 'homebridge-shelly-ds9';

/**
 * The name of this homebridge platform.
 */
export const PLATFORM_NAME = 'ShellyDS9';

/**
 * Utility class that "discovers" devices from the configuration options.
 */
export class ConfigDeviceDiscoverer extends DeviceDiscoverer {
  /**
   * @param options - The platform configuration options.
   * @param emitInterval - The interval, in milliseconds, to wait between each emitted device.
   */
  constructor(readonly options: PlatformOptions, readonly emitInterval = 20) {
    super();
  }

  /**
   * Runs this discoverer.
   */
  async run() {
    // emit all devices that have a configured hostname
    for (const [id, opts] of this.options.deviceOptions) {
      if (opts.hostname) {
        await this.emitDevice({
          deviceId: id,
          hostname: opts.hostname,
        });
      }
    }
  }

  /**
   * Emits a device after the configured time interval has passed.
   */
  protected emitDevice(identifiers: DeviceIdentifiers): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        super.handleDiscoveredDevice(identifiers);
        resolve();
      }, this.emitInterval);
    });
  }
}

/**
 * Utility class that retries discovery of devices that previously failed.
 */
export class RetryDeviceDiscoverer extends DeviceDiscoverer {
  /**
   * Triggers re-discovery of a device.
   */
  retryDevice(identifiers: DeviceIdentifiers) {
    this.handleDiscoveredDevice(identifiers);
  }
}

/**
 * Utility class that "discovers" devices from a cache.
 */
export class CacheDeviceDiscoverer extends DeviceDiscoverer {
  /**
   * @param deviceCache - The cached devices.
   * @param emitInterval - The interval, in milliseconds, to wait between each emitted device.
   */
  constructor(readonly deviceCache: DeviceCache, readonly emitInterval = 20) {
    super();
  }

  /**
   * Runs this discoverer.
   */
  async run() {
    // emit all cached devices
    for (const d of this.deviceCache) {
      await this.emitDevice({
        deviceId: d.id,
        hostname: d.hostname,
      });
    }
  }

  /**
   * Emits a device after the configured time interval has passed.
   */
  protected emitDevice(identifiers: DeviceIdentifiers): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(() => {
        super.handleDiscoveredDevice(identifiers);
        resolve();
      }, this.emitInterval);
    });
  }
}

/**
 * Implements a homebridge dynamic platform plugin.
 */
export class ShellyPlatform implements DynamicPlatformPlugin {
  /**
   * The configuration options for this platform.
   */
  readonly options: PlatformOptions;

  /**
   * A set of custom HomeKit characteristics.
   */
  readonly customCharacteristics: CustomCharacteristics;

  /**
   * A set of custom HomeKit services.
   */
  readonly customServices: CustomServices;

  /**
   * A reference to the shellies-ds9 library.
   */
  protected readonly shellies: Shellies;

  /**
   * Holds all platform accessories that were loaded from cache during launch,
   * as well as accessories that have been created since launch.
   */
  protected readonly accessories: Map<AccessoryUuid, PlatformAccessory> = new Map();

  /**
   * A reference to our cached devices.
   */
  readonly deviceCache: DeviceCache;

  /**
   * Holds all device delegates.
   */
  readonly deviceDelegates: Map<DeviceId, DeviceDelegate> = new Map();

  /**
   * A discoverer used to retry failed device discoveries.
   */
  protected retryDiscoverer: RetryDeviceDiscoverer | null = null;

  /**
   * Tracks pending discovery retry timers and attempt counts per device.
   */
  protected readonly discoveryRetryTimers: Map<DeviceId, { timer: ReturnType<typeof setTimeout>; attempts: number }> = new Map();

  /**
   * Retry intervals in seconds for failed device discoveries.
   */
  protected static readonly DISCOVERY_RETRY_INTERVALS = [30, 60, 120, 300];

  /**
   * Maximum number of discovery retry attempts.
   */
  protected static readonly MAX_DISCOVERY_RETRIES = ShellyPlatform.DISCOVERY_RETRY_INTERVALS.length;

  /**
   * This constructor is invoked by homebridge.
   * @param log - A logging device for this platform.
   * @param config - Configuration options for this platform.
   * @param api - A reference to the homebridge API.
   */
  constructor(
    readonly log: Logger,
    config: PlatformConfig,
    readonly api: API,
  ) {
    // get the platform options
    this.options = new PlatformOptions(config);

    this.customCharacteristics = Object.freeze(createCharacteristics(api));
    this.customServices = Object.freeze(createServices(api, this.customCharacteristics));

    // register custom device classes that are not yet supported in shellies-ds9
    Device.registerClass(ShellyPlusRGBWPM);

    // setup shellies-ds9
    this.shellies = new Shellies({
      websocket: { ...this.options.websocket, clientId: 'homebridge-shelly-ds9-' + Math.round(Math.random() * 1000000) },
      autoLoadStatus: true,
      autoLoadConfig: true,
      deviceOptions: this.options.deviceOptions,
    });
    this.shellies
      .on('add', this.handleAddedDevice, this)
      .on('remove', this.handleRemovedDevice, this)
      .on('exclude', this.handleExcludedDevice, this)
      .on('unknown', this.handleUnknownDevice, this)
      .on('error', this.handleError, this);

    this.deviceCache = new DeviceCache(api.user.storagePath(), log);

    // wait for homebridge to finish launching
    api.on('didFinishLaunching', this.initialize.bind(this));
  }

  /**
   * Configures cached accessories.
   * This method is invoked once for each cached accessory that is loaded during launch.
   */
  configureAccessory(accessory: PlatformAccessory) {
    // store it for later
    this.accessories.set(accessory.UUID, accessory);
  }

  /**
   * Returns the platform accessory with the given UUID.
   * @param uuid - The UUID.
   */
  getAccessory(uuid: AccessoryUuid): PlatformAccessory | undefined {
    return this.accessories.get(uuid);
  }

  /**
   * Adds one or more platform accessories to this platform.
   * This method will also register the accessories with homebridge.
   * @param accessories - The platform accessories to add.
   */
  addAccessory(...accessories: PlatformAccessory[]) {
    if (accessories.length === 0) {
      return;
    }

    const accs: PlatformAccessory[] = [];

    // add the accessories to our list
    for (const pa of accessories) {
      // skip if this accessory has already been added
      if (this.accessories.has(pa.UUID)) {
        continue;
      }

      this.accessories.set(pa.UUID, pa);
      accs.push(pa);
    }

    // register the accessories with homebridge
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accs);
  }

  /**
   * Removes one or more platform accessories from this platform.
   * This method will also unregister the accessories from homebridge.
   * @param accessories - The platform accessories to remove.
   */
  removeAccessory(...accessories: PlatformAccessory[]) {
    if (accessories.length === 0) {
      return;
    }

    // remove the accessories from our list
    for (const pa of accessories) {
      this.accessories.delete(pa.UUID);
    }

    // unregister the accessories from homebridge
    this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories);
  }

  /**
   * Initializes this platform.
   */
  protected async initialize() {
    this.log.debug(
      this.accessories.size === 1
        ? 'Loaded 1 accessory from cache'
        : `Loaded ${this.accessories.size} accessories from cache`,
    );

    // create and register the retry discoverer
    this.retryDiscoverer = new RetryDeviceDiscoverer();
    this.shellies.registerDiscoverer(this.retryDiscoverer);

    await this.runConfigDeviceDiscoverer();

    // load cached devices
    try {
      await this.deviceCache.load();
    } catch (e) {
      this.log.error(
        'Failed to load cached devices:',
        e instanceof Error ? e.message : e,
      );
    }

    await this.runCacheDeviceDiscoverer();

    if (this.options.mdns.enable === true) {
      this.startMdnsDeviceDiscovery();
    } else {
      this.log.debug('mDNS device discovery disabled');
    }
  }

  /**
   * Discovers all devices found in the configuration.
   */
  protected runConfigDeviceDiscoverer(): Promise<void> {
    // create a device discoverer
    const discoverer = new ConfigDeviceDiscoverer(this.options);
    // register it
    this.shellies.registerDiscoverer(discoverer);
    // run it
    return discoverer.run();
  }

  /**
   * Discovers all devices found in cache.
   */
  protected runCacheDeviceDiscoverer(): Promise<void> {
    // create a device discoverer
    const discoverer = new CacheDeviceDiscoverer(this.deviceCache);
    // register it
    this.shellies.registerDiscoverer(discoverer);
    // run it
    return discoverer.run();
  }

  /**
   * Starts device discovery over mDNS.
   */
  protected async startMdnsDeviceDiscovery() {
    // create a device discoverer
    const discoverer = new MdnsDeviceDiscoverer(this.options.mdns);
    // register it
    this.shellies.registerDiscoverer(discoverer);

    // log errors
    discoverer.on('error', (error: Error) => {
      this.log.error('An error occurred in the mDNS device discovery service:', error.message);
      this.log.debug(error.stack || '');
    });

    try {
      // start the service
      await discoverer.start();

      this.log.info('mDNS device discovery started');
    } catch (e) {
      this.log.error('Failed to start the mDNS device discovery service:', e instanceof Error ? e.message : e);
      if (e instanceof Error && e.stack) {
        this.log.debug(e.stack);
      }
    }
  }

  /**
   * Handles 'add' events from the shellies-ds9 library.
   */
  protected async handleAddedDevice(device: Device) {
    // cancel any pending discovery retry for this device
    const pendingRetry = this.discoveryRetryTimers.get(device.id);
    if (pendingRetry) {
      clearTimeout(pendingRetry.timer);
      this.discoveryRetryTimers.delete(device.id);
    }

    // make sure this device hasn't already been added
    if (this.deviceDelegates.has(device.id)) {
      this.log.error(`Device with ID ${device.id} has already been added`);
      return;
    }

    // get the device delegate class for this device
    const cls = DeviceDelegate.getDelegate(device.model);
    if (cls === undefined) {
      // this is an unknown device
      this.handleUnknownDevice(device.id, device.model);
      return;
    }

    // get the configuration options for this device (and copy them)
    const opts = { ...this.options.getDeviceOptions(device.id) };

    // if no name has been specified...
    if (!opts.name) {
      // use the name from the API
      opts.name = device.system.config?.device?.name;
    }

    // create a delegate for this device
    const delegate = new cls(device, opts, this);

    // store the delegate
    this.deviceDelegates.set(device.id, delegate);

    // store info about this device in cache
    this.deviceCache.storeDevice(device);
  }

  /**
   * Handles 'remove' events from the shellies-ds9 library.
   */
  protected handleRemovedDevice(device: Device) {
    // destroy and remove the device delegate
    this.deviceDelegates.get(device.id)?.destroy();
    this.deviceDelegates.delete(device.id);

    // delete this device from cache
    this.deviceCache.delete(device.id);
  }

  /**
   * Handles 'exclude' events from the shellies-ds9 library.
   */
  protected handleExcludedDevice(deviceId: DeviceId) {
    this.log.info(`[${deviceId}] Device excluded`);

    // delete this device from cache
    this.deviceCache.delete(deviceId);

    if (this.deviceDelegates.has(deviceId)) {
      // destroy and remove the device delegate
      this.deviceDelegates.get(deviceId)!.destroy();
      this.deviceDelegates.delete(deviceId);
    } else {
      // find all of its platform accessories
      const pas: PlatformAccessory[] = [];

      for (const pa of this.accessories.values()) {
        if (pa.context.device?.id === deviceId) {
          pas.push(pa);
        }
      }

      // unregister them
      if (pas.length > 0) {
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, pas);
      }

      this.log.debug(
        pas.length === 1
          ? '1 platform accessory unregistered'
          : `${pas.length} platform accessories unregistered`,
      );
    }
  }

  /**
   * Handles 'unknown' events from the shellies-ds9 library.
   */
  protected handleUnknownDevice(deviceId: DeviceId, model: string) {
    this.log.warn(`[${deviceId}] Unknown device of model "${model}" discovered.`);
  }

  /**
   * Handles 'error' events from the shellies-ds9 library.
   */
  protected handleError(deviceId: DeviceId, error: Error) {
    // When a Shelly device advertises itself via mDNS using its user-assigned name
    // (e.g. "Shelly-Büro") but Shelly.GetDeviceInfo returns a hardware-based ID
    // (e.g. "shellyplus2pm-<mac>"), the library reports an ID mismatch error.
    // If we already know the device by its hardware ID, this is harmless noise —
    // the device is connected and the mDNS name is simply stale.
    const match = error.message.match(/Unexpected device ID \(returned: ([^,]+), expected:/);
    if (match !== null && this.deviceDelegates.has(match[1])) {
      this.log.debug(
        `[${deviceId}] mDNS name does not match hardware device ID (${match[1]}); device is already connected`,
      );
      return;
    }

    // Handle failed device discovery (e.g. "Request timeout", connection errors).
    // When mDNS re-discovers a device that recently disconnected, the library opens
    // a new WebSocket and calls Shelly.GetDeviceInfo. If that times out (e.g. because
    // the device's limited WebSocket slots are occupied by a stale connection), the
    // device is left without a delegate and never recovers.
    const discoveryMatch = error.message.match(/Failed to add discovered device \(id: ([^)]+)\): (.+)/);
    if (discoveryMatch !== null) {
      const failedDeviceId = discoveryMatch[1];
      const reason = discoveryMatch[2];

      // If the device already has a working delegate, this error is harmless
      if (this.deviceDelegates.has(failedDeviceId)) {
        this.log.debug(
          `[${failedDeviceId}] Discovery failed (${reason}) but device is already connected`,
        );
        return;
      }

      // If the library already tracks this device (e.g. connected under same ID),
      // no action is needed
      if (this.shellies.has(failedDeviceId)) {
        this.log.debug(
          `[${failedDeviceId}] Discovery failed (${reason}) but device is already known`,
        );
        return;
      }

      this.log.warn(
        `[${failedDeviceId}] Discovery failed (${reason})`,
      );

      this.scheduleDiscoveryRetry(failedDeviceId);
      return;
    }

    // print the error to the log
    this.log.error(error.message);
    this.log.debug(error.stack || '');
  }

  /**
   * Schedules a retry for a failed device discovery using cached device info.
   */
  protected scheduleDiscoveryRetry(deviceId: DeviceId) {
    // look up the device in cache to get its hostname
    const cached = this.deviceCache.get(deviceId);
    if (!cached || !cached.hostname) {
      this.log.debug(`[${deviceId}] No cached hostname available for discovery retry`);
      return;
    }

    // get current retry state
    const existing = this.discoveryRetryTimers.get(deviceId);
    const attempts = existing ? existing.attempts : 0;

    // clear any existing timer
    if (existing) {
      clearTimeout(existing.timer);
    }

    // check if we've exhausted retries
    if (attempts >= ShellyPlatform.MAX_DISCOVERY_RETRIES) {
      this.log.warn(
        `[${deviceId}] Giving up discovery retry after ${attempts} failed attempt(s)`,
      );
      this.discoveryRetryTimers.delete(deviceId);
      return;
    }

    const delay = ShellyPlatform.DISCOVERY_RETRY_INTERVALS[attempts];

    this.log.info(
      `[${deviceId}] Scheduling discovery retry in ${delay} second(s) (attempt ${attempts + 1}/${ShellyPlatform.MAX_DISCOVERY_RETRIES})`,
    );

    const timer = setTimeout(() => {
      this.discoveryRetryTimers.delete(deviceId);

      // if the device was added in the meantime, skip
      if (this.deviceDelegates.has(deviceId) || this.shellies.has(deviceId)) {
        this.log.debug(`[${deviceId}] Device recovered before retry; skipping`);
        return;
      }

      this.log.info(`[${deviceId}] Retrying device discovery (attempt ${attempts + 1})`);

      this.retryDiscoverer?.retryDevice({
        deviceId: cached.id,
        hostname: cached.hostname,
      });
    }, delay * 1000);

    this.discoveryRetryTimers.set(deviceId, { timer, attempts: attempts + 1 });
  }
}