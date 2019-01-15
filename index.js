// ISC License
// Original work Copyright (c) 2017, Andreas Bauer
// Modified work Copyright 2018, Sander van Woensel

"use strict";

// -----------------------------------------------------------------------------
// Module variables
// -----------------------------------------------------------------------------
let Service, Characteristic, api;

// -----------------------------------------------------------------------------
// Constants
// -----------------------------------------------------------------------------

const configParser = require("homebridge-http-base").configParser;
const http = require("homebridge-http-base").http;
const notifications = require("homebridge-http-base").notifications;
const PullTimer = require("homebridge-http-base").PullTimer;

const PACKAGE_JSON = require('./package.json');
const MANUFACTURER = PACKAGE_JSON.author.name;
const SERIAL_NUMBER = '001';
const MODEL = PACKAGE_JSON.name;
const FIRMWARE_REVISION = PACKAGE_JSON.version;

const MIN_LUX_VALUE = 0.0;
const MAX_LUX_VALUE =  Math.pow(2, 16) - 1.0; // Default BH1750 max 16bit lux value.

// -----------------------------------------------------------------------------
// Exports
// -----------------------------------------------------------------------------

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    api = homebridge;

    homebridge.registerAccessory(MODEL, "HttpAmbientLightSensor", HttpAmbientLightSensor);
};

// -----------------------------------------------------------------------------
// Module public functions
// -----------------------------------------------------------------------------

function HttpAmbientLightSensor(log, config) {
    this.log = log;
    this.name = config.name;
    this.debug = config.debug || false;
    this.minSensorValue = config.minValue || MIN_LUX_VALUE;
    this.maxSensorValue = config.maxValue || MAX_LUX_VALUE;

    if (config.getUrl) {
        try {
            this.getUrl = configParser.parseUrlProperty(config.getUrl);
        } catch (error) {
            this.log.warn("Error occurred while parsing 'getUrl': " + error.message);
            this.log.warn("Aborting...");
            return;
        }
    }
    else {
        this.log.warn("Property 'getUrl' is required!");
        this.log.warn("Aborting...");
        return;
    }

    this.homebridgeService = new Service.LightSensor(this.name);
    this.homebridgeService.getCharacteristic(Characteristic.CurrentAmbientLightLevel)
        .setProps({
                    minValue: this.minSensorValue,
                    maxValue: this.maxSensorValue
                })
        .on("get", this.getSensorValue.bind(this));

    /** @namespace config.pullInterval */
    if (config.pullInterval) {
        this.pullTimer = new PullTimer(log, config.pullInterval, this.getSensorValue.bind(this), value => {
            this.homebridgeService.setCharacteristic(Characteristic.CurrentAmbientLightLevel, value);
        });
        this.pullTimer.start();
    }

    /** @namespace config.notificationPassword */
    /** @namespace config.notificationID */
    notifications.enqueueNotificationRegistrationIfDefined(api, log, config.notificationID, config.notificationPassword, this.handleNotification.bind(this));
}

HttpAmbientLightSensor.prototype = {

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, MANUFACTURER)
            .setCharacteristic(Characteristic.Model, MODEL)
            .setCharacteristic(Characteristic.SerialNumber, SERIAL_NUMBER)
            .setCharacteristic(Characteristic.FirmwareRevision, FIRMWARE_REVISION);

        return [informationService, this.homebridgeService];
    },

    handleNotification: function(body) {
        const value = body.value;

        /** @namespace body.characteristic */
        let characteristic;
        switch (body.characteristic) {
            case "CurrentAmbientLightLevel":
                characteristic = Characteristic.CurrentAmbientLightLevel;
                break;
            default:
                this.log("Encountered unknown characteristic handling notification: " + body.characteristic);
                return;
        }

        if (this.debug)
            this.log("Updating '" + body.characteristic + "' to new value: " + body.value);
        this.homebridgeService.setCharacteristic(characteristic, value);
    },

    getSensorValue: function (callback) {
        http.httpRequest(this.getUrl, (error, response, body) => {
            if (this.pullTimer)
                this.pullTimer.resetTimer();

            if (error) {
                this.log("getSensorValue() failed: %s", error.message);
                callback(error);
            }
            else if (response.statusCode !== 200) {
                this.log("getSensorValue() returned http error: %s", response.statusCode);
                callback(new Error("Got http error code " + response.statusCode));
            }
            else {
                const sensorValue = parseFloat(body);
                if (this.debug)
                    this.log("Sensor value is currently at %s", sensorValue);

                callback(null, sensorValue);
            }
        });
    },

};
