
let Service, Characteristic, Accessory;

const PlatformConfig = {
    AirPurifier: {
        power: 'Active',
        powerRefer: [
            {
                key: 'CurrentAirPurifierState',
                on: 2,
                off: 0
            },
            {
                key: 'TargetAirPurifierState',
                on: 2,
                off: 0
            }
        ],
        volume: 'RotationSpeed',
        channel: 'SwingMode'
    },
    GarageDoorOpener: {
        power: 'TargetDoorState',
        reversalPower: true,
        powerRefer: [
            {
                key: 'CurrentDoorState',
                on: 1,
                off: 0
            },
            {
                key: 'TargetDoorState',
                on: 1,
                off: 0
            }
        ]
    },
    HumidifierDehumidifier: {
        power: 'Active',
        volume: 'RelativeHumidityHumidifierThreshold',
        default: [
            ['CurrentRelativeHumidity', 0],
            ['CurrentHumidifierDehumidifierState', 1],
            ['TargetHumidifierDehumidifierState', 1],
        ]
    },
    Lightbulb: {
        power: 'On',
        volume: 'Brightness'
    },
    Fan: {
        power: 'On',
        volume: 'RotationSpeed',
        channel: 'RotationDirection'
    },
    HeaterCooler: {
        power: 'Active',
        volume: 'CoolingThresholdTemperature',
        channel: 'TargetHeatingCoolingState'
    },
    Valve: {
        power: 'Active',
        volume: 'RemainingDuration',
        powerRefer: [
            {
                key: 'InUse',
                on: 1,
                off: 0
            }
        ],
        channel: 'ValveType'
    },
    // Window: {
    //     volume: 'TargetPosition',
    //     powerRefer: [
    //         {
    //             key: 'PositionState',
    //             on: 2,
    //             off: 2
    //         }
    //     ]
    // },
    // WindowCovering: {
    //     volume: 'TargetPosition',
    //     powerRefer: [
    //         {
    //             key: 'PositionState',
    //             on: 2,
    //             off: 2
    //         }
    //     ]
    // },
    // Door: {
    //     volume: 'TargetPosition',
    //     channel: 'PositionState',
    //     powerRefer: [
    //         {
    //             key: 'CurrentPosition',
    //             on: { ref: 'volume' },
    //             off: 0
    //         }
    //     ]
    // }
}

class Radio {
    constructor(config, platform) {

        this.platform = platform;
        this.log = platform.log;
        this.config = config;
        this.name = config['name'];

        this.syncInterval = config["interval"] || 30000;

        Accessory = platform.Accessory;
        Service = platform.Service;
        Characteristic = platform.Characteristic;

        let platformKey = PlatformConfig[config.perform] ? config.perform : 'Lightbulb'

        this.platformConfig = PlatformConfig[platformKey]

        this.service = new Service[platformKey](this.name);

        if (this.platformConfig.power) {
            this.onState = this.service
                .getCharacteristic(Characteristic[this.platformConfig.power])
                .on('set', this.setState.bind(this))
        } else {
            this._onState
        }

        if (this.platformConfig.powerRefer) {
            this._powerRefer = this.platformConfig.powerRefer.map(v => this.service
                .getCharacteristic(Characteristic[v.key])
                .on('get', (callback) => {
                    callback(null, v[this.onState.value ? 'on' : 'off'])
                })
            )
        }

        if (this.platformConfig.volume) {
            this.volume = this.service
                .getCharacteristic(Characteristic[this.platformConfig.volume])
                .setProps({
                    maxValue: 100,
                    minValue: 0,
                    minStep: 1
                })
                .on('set', this.setVolume.bind(this))
        }

        if (this.platformConfig.default) {
            this._constValueMap = this.platformConfig.default.reduce((r, kv) => {
                r[kv[0]] = this.service
                    .getCharacteristic(Characteristic[kv[0]])
                    .setValue(kv[1])
                    .on('set', this.constValueSetFunction.bind(this, kv))
                return r
            }, {})
        }

        if (this.syncInterval > 0) {
            this.syncTimer = setInterval(() => {
                this._stateSync();
            }, this.syncInterval);
        }
    }

    constValueSetFunction(kv, value, callback) {
        callback(null, kv[1])
        setTimeout(() => {
            this._constValueMap[kv[0]].updateValue(kv[1])
        }, 0);
    }

    powerReferCallback(value) {
        if (this.platformConfig.powerRefer) {
            setTimeout(() => {
                this.platformConfig.powerRefer.forEach((v, i) => {
                    this._powerRefer[i].updateValue(v[value ? 'on' : 'off'])
                });
            }, 0);
        }
    }

    setState(value, callback) {
        let _value = value
        if (this.platformConfig.reversalPower) {
            _value = !value
        }
        this.platform.device.call('play_fm', [_value ? 'on' : 'off'])
            .then(res => {
                callback()
                this.powerReferCallback(value)
            })
            .catch(err => {
                this.log('play_fm failed:', err)
                callback()
            });
    }

    setVolume(value, callback) {
        if (this.onState === undefined) {
            this.setState(value != 0, () => { })
        }
        this.platform.device.call('volume_ctrl_fm', [value.toString()])
            .then(res => callback())
            .catch(err => {
                this.log('volume_ctrl_fm failed:', err)
                callback()
            });
    }
    getPropFm() {
        return this.platform.device.call('get_prop_fm', [])
            .catch(err => {
                this.log('get_prop_fm failed:', err)
                return {}
            })
    }
    _stateSync() {
        this.getPropFm().then(prop => {
            let _volume = +prop['current_volume'] || 0
            let _power = prop['current_status'] == 'run'
            if (this.platformConfig.reversalPower) {
                _power = !_power
            }

            this.volume !== undefined && this.volume.updateValue(_volume)
            if (this.onState !== undefined) {
                this.onState.updateValue(_power)
                this.powerReferCallback(_power)
            } else {
                this._onState = _power
            }
        })
    }
    getServices() {
        return [this.service];
    }
}

module.exports = Radio;