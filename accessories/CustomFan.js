
let Service, Characteristic, Accessory;
class CustomFan {
    constructor(config, platform) {
        this.platform = platform;
        this.log = platform.log;
        this.config = config;
        this.name = config['name'];

        Accessory = platform.Accessory;
        Service = platform.Service;
        Characteristic = platform.Characteristic;

        //Search device position
        this.deviceIndex = 0;
        this.powerDeviceIndex = -1;
        if (config['deviceIp']) {
            let index = 0;
            for (var elem in platform.config.devices) {
                if (elem == config['deviceIp']) {
                    this.deviceIndex = index;
                    break;
                }
                index++;
            }
        }
        if (config['powerDeviceIp']) {
            let index = 0;
            for (var elem in platform.config.devices) {
                if (elem == config['powerDeviceIp']) {
                    this.powerDeviceIndex = index;
                    break
                }
                index++;
            }
        }

        //customize
        if (config.customize) {
            this.customi = config.customize;
            this.log.debug("[DEBUG]Using customized AC signal...");
        }

        //Device is not ready
        this.ReadyState = false;
        platform.startEvent.once(this.deviceIndex, () => {
            this.log.debug("[%s]Ready", this.name);
            this._startAcc();
        })


        //Characteristic
        this.Active;
        this.CurrentFanState;

        this.RotationSpeed;
        this.SwingMode;

        //FAN state
        this.active
        this.speed

        this._setCharacteristic();

        this.service = new Service.Fanv2(this.name);

        if (this.syncInterval > 0) {
            this.syncTimer = setInterval(() => {
                this._stateSync();
            }, this.syncInterval);
        }
    }

    _startAcc() {
        this.ReadyState = true;
        //Sync
        this._stateSync();
        if (this.syncInterval > 0) {
            this.syncTimer = setInterval(() => {
                this._stateSync();
            }, this.syncInterval);
        } else {
            this.log.warn("[WARN]Sync off");
        }
    }
    getServices() {
        return this.services;
    }
    identify(callback) {
        this.log("[INFO]%s indetify!!!", this.name);
        callback();
    }

    _fastSync() {
        //this function will  start _stateSync every 15 sec. And will end after 60 sec
        if (this.syncInterval <= 0) {
            return;
        }
        if (this.fastSyncTimer) {
            //Clear last fastSync timer
            clearInterval(this.fastSyncTimer);
            clearTimeout(this.fastSyncEnd);
        }
        //Clear normal syncState timer
        clearInterval(this.syncTimer);
        this.log.debug("[DEBUG]FastSync...");
        setImmediate(() => this._stateSync());
        this.fastSyncTimer = setInterval(() => {
            this._stateSync();
        }, 5 * 1000);
        this.fastSyncEnd = setTimeout(() => {
            clearInterval(this.fastSyncTimer);
            //Resume normal sync interval
            this.syncTimer = setInterval(() => {
                this._stateSync();
            }, this.syncInterval);
        }, 60 * 1000);
    }
    _stateSync() {
        if (!this.ReadyState) {
            return;
        }
        if (!this.platform.syncLock._enterSyncState(() => {
            this._stateSync();
        })) {
            return;
        }
        if (!this.platform.deviceMap[this.config['powerDeviceIp']]) {
            return
        }
        //Update CurrentTemperature
        const p1 = this.platform.deviceMap[this.config['powerDeviceIp']].call('get_power', [])
            .then(([power]) => {
                if (power > 1000) {
                    this.active = 1
                    if (power > 3500) {
                        this.speed = 3
                    } else if (power < 3300) {
                        this.speed = 1
                    } else {
                        this.speed = 2
                    }
                    console.log(this.speed)
                    this.RotationSpeed.updateValue(this.speed);
                    this.Active.updateValue(Characteristic.Active.ACTIVE);
                } else {
                    this.active = 0
                    this.Active.updateValue(Characteristic.Active.INACTIVE);
                }

                this.log.debug("[FAN]power -> %s", power);
                this.log.debug("[FAN]Active -> %s", this.Active.value);
                this.log.debug("[FAN]RotationSpeed -> %s", this.RotationSpeed.value);
            })
            .catch((err) => {
                this.log.error("[%s]Sync failed! %s", this.name, err);
            })
            .then(() => {
                this.platform.syncLock._exitSyncState();
            })
    }

    _setCharacteristic() {
        this.services = [];

        this.serviceInfo = new Service.AccessoryInformation();

        this.serviceInfo
            .setCharacteristic(Characteristic.Manufacturer, 'XiaoMi')
            .setCharacteristic(Characteristic.Model, 'AC Partner(Fan)')
            .setCharacteristic(Characteristic.SerialNumber, "Undefined");

        this.services.push(this.serviceInfo);

        //Register as Thermostat
        this.climateService = new Service.Fanv2(this.name);

        this.Active = this.climateService
            .getCharacteristic(Characteristic.Active)
            .on('set', this.setActive.bind(this))
            .on('get', this.getActive.bind(this));

        this.RotationSpeed = this.climateService
            .getCharacteristic(Characteristic.RotationSpeed)
            .setProps({
                maxValue: 3,
                minValue: 0,
                minStep: 1
            })
            .on('set', this.setRotationSpeed.bind(this))

        this.SwingMode = this.climateService
            .getCharacteristic(Characteristic.SwingMode)
            .on('set', this.setSwingMode.bind(this))

        this.services.push(this.climateService);
    }

    setActive(value, callback) {
        if (!this.customi) {
            console.log('customi missing')
            callback();
            return;
        }
        this._sendCmdAsync(value ? this.customi.on : this.customi.off, callback)
    }
    setRotationSpeed(value, callback) {
        if (!this.customi) {
            console.log('customi missing')
            callback();
            return;
        }
        this._sendCmdAsync(this.customi.speed[value] || this.customi.speed.auto, callback)
    }
    setSwingMode(value, callback) {
        if (!this.customi) {
            console.log('customi missing')
            callback();
            return;
        }
        this._sendCmdAsync(value ? this.customi.swing.on : this.customi.swing.off, callback)
    }
    getActive(callback) {
        setImmediate(() => { this._stateSync(); });
        callback(null, this.active === 1 ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
    }
    getCurrentFanState(callback) {
        setImmediate(() => { this._stateSync(); });
        callback(null, this.active === 1 ? Characteristic.CurrentFanState.BLOWING_AIR : Characteristic.CurrentFanState.INACTIVE);
    }

    _sendCmdAsync(code, callback) {
        let command;
        if (code.substr(0, 2) === "FE") {
            this.log.debug("[DEBUG]Sending IR code: %s", code);
            command = 'send_ir_code';
        } else {
            this.log.debug("[DEBUG]Sending AC code: %s", code);
            command = 'send_cmd';
        }
        this.platform.deviceMap[this.config['deviceIp']].call(command, [code])
            .then((data) => {
                if (data[0] === "ok") {
                    this.log.debug("[DEBUG]Success")
                }
                callback();
            })
            .catch((err) => {
                this.log.error("[%s]Send code failed! %s", this.name, err);
                callback(err);
            })
            .then(() => {
                this._stateSync()
            })
    }
}

//util.inherits(baseAC, base);
module.exports = CustomFan;