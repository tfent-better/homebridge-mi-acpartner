
let Service, Characteristic, Accessory;

class Fan {
    constructor(config, platform) {

        this.platform = platform;
        this.log = platform.log;
        this.config = config;
        this.name = config['name'];

        this.deviceIndex = 0;
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

        Accessory = platform.Accessory;
        Service = platform.Service;
        Characteristic = platform.Characteristic;

        //Config
        this.maxTemp = parseInt(config.maxTemp, 10) || 30;
        this.minTemp = parseInt(config.minTemp, 10) || 17;
        this.syncInterval = parseInt(config.interval, 10) || 60 * 1000;

        //customize
        if (config.customize) {
            this.customi = config.customize;
            this.log.debug("[DEBUG]Using customized AC signal...");
        }

        //Characteristic
        this.Active;

        this.RotationSpeed;
        this.SwingMode;

        //AC state
        this.model;
        this.active;
        this.mode;
        this.temperature;
        this.speed;
        this.swing;
        this.led;

        this._setCharacteristic();

        this.service = new Service.Fanv2(this.name);

        if (this.syncInterval > 0) {
            this.syncTimer = setInterval(() => {
                this._stateSync();
            }, this.syncInterval);
        }
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
    setTargetHeatingCoolingState(TargetHeatingCoolingState, callback) {

        if (!this.customi) {
            console.log('customi missing')
            callback();
            return;
        }

        this.TargetHeatingCoolingState.updateValue(TargetHeatingCoolingState)

        let code;

        this.active = 1
        switch (TargetHeatingCoolingState) {
            case Characteristic.TargetHeatingCoolingState.HEAT:
                this.mode = 0
                break;
            case Characteristic.TargetHeatingCoolingState.COOL:
                this.mode = 1
                break;
            case Characteristic.TargetHeatingCoolingState.AUTO:
                this.mode = 2
                break;
            case Characteristic.TargetHeatingCoolingState.OFF:
                this.active = 0
                break;
            default:
                break;
        }
        if (code === null) {
            callback();
            return;
        }
        this._sendCmdAsync(this.customiUtil(), callback)

    }
    setTargetTemperature(value, callback) {
        this._sendCmdAsync(this.customiUtil(value), callback)
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
        this._fastSync();
        callback(null, this.active === "1" ? Characteristic.Active.ON : Characteristic.Active.OFF);
    }
    customiUtil(targetTemperatureValue = this.TargetTemperature.value) {
        let code = null;
        //Note: Some AC need 'on' signal to active. Add later.

        switch (this.TargetHeatingCoolingState.value) {
            case Characteristic.TargetHeatingCoolingState.HEAT:
                //HEAT
                if (!this.customi.heat || !this.customi.heat[targetTemperatureValue]) {
                    this.log.warn("[WARN]'HEAT' signal not define");
                } else {
                    code = this.customi.heat[targetTemperatureValue];
                }
                break;
            case Characteristic.TargetHeatingCoolingState.COOL:
                //COOL
                if (!this.customi.cool || !this.customi.cool[targetTemperatureValue]) {
                    this.log.warn("[WARN]'COOL' signal not define");
                } else {
                    code = this.customi.cool[targetTemperatureValue];
                }
                break;
            case Characteristic.TargetHeatingCoolingState.AUTO:
                //AUTO
                if (!this.customi.auto) {
                    this.log.warn("[WARN]'AUTO' signal not define");
                } else {
                    code = this.customi.auto;
                }
                break;
            case Characteristic.TargetHeatingCoolingState.OFF:
                //OFF
                if (!this.customi.off) {
                    this.log.warn("[WARN]'OFF' signal not define");
                } else {
                    code = this.customi.off;
                }
                break;
            default:
                break;
        }
        return code;
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
        this.platform.devices[this.deviceIndex].call(command, [code])
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
    }
    _stateSync() {
        this.log.debug("[%s]Syncing...", this.name);
        //Update AC state
        const p2 = this.platform.devices[this.deviceIndex].call('get_model_and_state', [])
            .then((ret) => {
                this.log.debug("Partner state----------------------");
                const model = ret[0],
                    state = ret[1],
                    power = ret[2];

                if (this.model !== model) {
                    this.model = model;
                }
                this.log.debug("Model -> %s", this.model.substr(0, 2) + this.model.substr(8, 8));

                //Save all parameter to global
                this.active = state.substr(2, 1);
                this.mode = state.substr(3, 1);
                this.temperature = parseInt(state.substr(6, 2), 16);
                this.speed = state.substr(4, 1);
                this.swing = 1 - state.substr(5, 1);
                this.led = state.substr(8, 1);
                this.log.debug("Active -> %s", this.active);
                this.log.debug("Mode -> %s", this.mode);
                this.log.debug("Temperature -> %s", this.temperature);
                this.log.debug("RotationSpeed -> %s", this.speed);
                this.log.debug("SwingMode -> %s", this.swing);
                this.log.debug("LED -> %s", this.led);
                this.log.debug("-----------------------------------");

                //Use independence function to update accessory state
                this._updateState();
            })
            .catch((err) => {
                this.log.error("[ERROR]Failed to update AC state! %s", err);
            });

        p2
            .then(() => {
                this.log.debug("[%s]Complete", this.name);
            })
            .catch((err) => {
                this.log.error("[%s]Sync failed! %s", this.name, err);
            })
    }
    _fastSync() {
        //this function will  start _stateSync every 5 sec. And will end in 30 sec
        if (this.syncInterval <= 0) return;
        if (this.fastSyncTimer) {
            //Clear last fastSync timer
            clearInterval(this.fastSyncTimer);
            clearTimeout(this.fastSyncEnd);
        }
        //Clear normal syncState timer
        clearInterval(this.syncTimer);
        this.log.debug("[DEBUG]Enter fastSync");
        setImmediate(() => this._stateSync());
        this.fastSyncTimer = setInterval(() => {
            this._stateSync();
        }, 2 * 1000);
        this.fastSyncEnd = setTimeout(() => {
            clearInterval(this.fastSyncTimer);
            this.log.debug("[DEBUG]Exit fastSync");
            //Resume normal sync interval
            this.syncTimer = setInterval(() => {
                this._stateSync();
            }, this.syncInterval);
        }, 30 * 1000);
    }
    _updateState() {
        //Update AC mode and active state
        this.Active.updateValue(this.active === "1" ? Characteristic.Active.ON : Characteristic.Active.OFF);
        this.SwingMode.updateValue(this.swing === "1" ? Characteristic.SwingMode.SWING_ENABLED : Characteristic.SwingMode.SWING_DISABLED);
        this.RotationSpeed.updateValue(+this.speed || 0);

    }
    getServices() {
        return this.services
    }
}

module.exports = Fan;