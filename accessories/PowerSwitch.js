
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

        //Device is not ready
        this.ReadyState = false;
        platform.startEvent.once(this.deviceIndex, () => {
            this.log.debug("[%s]Ready", this.name);
            this._startAcc();
        })

        //Characteristic
        this.onState;

        //switch state
        this.active

        this._setCharacteristic();

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
        //Update CurrentTemperature
        const p1 = this.platform.deviceMap[this.config['deviceIp']].call('get_prop', ["on", "usb_on", "temperature", "wifi_led"])
            .then(([on, usb_on, temperature, wifi_led]) => {
                this.active = !!usb_on

                this.onState.updateValue(this.active);

                this.log.debug("[PowerSwitch]on -> %s", on);
                this.log.debug("[PowerSwitch]usb_on -> %s", usb_on);
                this.log.debug("[PowerSwitch]temperature -> %s", temperature);
                this.log.debug("[PowerSwitch]wifi_led -> %s", wifi_led);
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
        this.climateService = new Service.Switch(this.name);

        this.onState = this.climateService
            .getCharacteristic(Characteristic.On)
            .on('set', this.setActive.bind(this))
            .on('get', this.getActive.bind(this));

        this.services.push(this.climateService);
    }

    setActive(value, callback) {
        this._sendCmdAsync(value ? 'set_usb_on' : 'set_usb_off', callback)
    }
    getActive(callback) {
        setImmediate(() => { this._stateSync(); });
        callback(null, !!this.active);
    }

    _sendCmdAsync(command, callback) {
        this.platform.deviceMap[this.config['deviceIp']].call(command, [])
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