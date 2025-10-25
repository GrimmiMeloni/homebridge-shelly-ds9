# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Homebridge plugin for Shelly DS9 devices, enabling HomeKit integration for next-generation Shelly devices. It's built as a TypeScript npm package using the Homebridge platform architecture.

## Development Commands

### Build
```bash
npm run build
```
- Compiles TypeScript to `dist/` directory
- Automatically runs during `npm run preversion`

### Linting and Code Quality
```bash
npm run lint        # ESLint with --max-warnings=0
npm run pretty      # Prettier formatting
```

### Testing
```bash
npm test           # Run Jest tests
```
Note: Currently no test files exist in the codebase (*.spec.ts or *.test.ts files).

## Architecture

### Core Structure
- **Entry Point**: `src/index.ts` - Registers the ShellyPlatform with Homebridge
- **Platform**: `src/platform.ts` - Main platform class that handles device discovery and management
- **Device Delegates**: `src/device-delegates/` - Device-specific implementations for different Shelly models
- **Abilities**: `src/abilities/` - Reusable HomeKit service implementations (switch, outlet, cover, light, etc.)
- **Utilities**: `src/utils/` - Helper classes for device caching, logging, and HomeKit services/characteristics

### Key Dependencies
- **shellies-ds9**: Core library for Shelly device communication
- **homebridge**: HomeKit platform framework

### Device Support Pattern
Each Shelly device model has its own delegate class in `src/device-delegates/` that:
1. Extends the base `DeviceDelegate` class
2. Defines which abilities/components the device supports
3. Maps device components to HomeKit services

### Abilities System
The plugin uses an ability-based architecture where each HomeKit service type (switch, outlet, cover, etc.) is implemented as a separate ability class in `src/abilities/`. This allows for flexible composition of device capabilities.

## Configuration
- Platform name: "ShellyDS9"
- Configuration schema: `config.schema.json`
- Supports device discovery via mDNS and manual device configuration
- TypeScript compilation targets ES2018 with CommonJS modules