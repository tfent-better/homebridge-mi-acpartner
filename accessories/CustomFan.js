
const FanAccessory = require('./Fan');
let Service, Characteristic, Accessory;

class CustomFan extends FanAccessory {
    constructor(config, platform) {
        config.interval = 0
        super(config, platform)
    }
    _stateSync() {

    }
}

module.exports = CustomFan;