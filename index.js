"use strict";

let Service, Characteristic, api;

const configParser = require("homebridge-http-base").configParser;
const http = require("homebridge-http-base").http;
const notifications = require("homebridge-http-base").notifications;
const PullTimer = require("homebridge-http-base").PullTimer;

const packageJSON = require("./package.json");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;

    api = homebridge;

    homebridge.registerAccessory("homebridge-http-temperature-sensor", "HTTP-TEMPERATURE", HTTP_TEMPERATURE);
};

function HTTP_TEMPERATURE(log, config) {
    this.log = log;
    this.name = config.name;
    this.debug = config.debug || false;

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

    this.homebridgeService = new Service.TemperatureSensor(this.name);
    this.homebridgeService.getCharacteristic(Characteristic.CurrentTemperature)
        .on("get", this.getTemperature.bind(this));

    /** @namespace config.pullInterval */
    if (config.pullInterval) {
        this.pullTimer = new PullTimer(log, config.pullInterval, this.getTemperature.bind(this), value => {
            this.homebridgeService.setCharacteristic(Characteristic.CurrentTemperature, value);
        });
        this.pullTimer.start();
    }

    /** @namespace config.notificationPassword */
    /** @namespace config.notificationID */
    notifications.enqueueNotificationRegistrationIfDefined(api, log, config.notificationID, config.notificationPassword, this.handleNotification.bind(this));
}

HTTP_TEMPERATURE.prototype = {

    identify: function (callback) {
        this.log("Identify requested!");
        callback();
    },

    getServices: function () {
        const informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "Andreas Bauer")
            .setCharacteristic(Characteristic.Model, "HTTP Temperature Sensor")
            .setCharacteristic(Characteristic.SerialNumber, "TS01")
            .setCharacteristic(Characteristic.FirmwareRevision, packageJSON.version);

        return [informationService, this.homebridgeService];
    },

    handleNotification: function(body) {
        const value = body.value;

        /** @namespace body.characteristic */
        let characteristic;
        switch (body.characteristic) {
            case "CurrentTemperature":
                characteristic = Characteristic.CurrentTemperature;
                break;
            default:
                this.log("Encountered unknown characteristic handling notification: " + body.characteristic);
                return;
        }

        this.log("Updating '" + body.characteristic + "' to new value: " + body.value);
        this.homebridgeService.setCharacteristic(characteristic, value);
    },

    getTemperature: function (callback) {
        http.httpRequest(this.getUrl, (error, response, body) => {
            if (this.pullTimer)
                this.pullTimer.resetTimer();

            if (error) {
                this.log("getTemperature() failed: %s", error.message);
                callback(error);
            }
            else if (response.statusCode !== 200) {
                this.log("getTemperature() returned http error: %s", response.statusCode);
                callback(new Error("Got http error code " + response.statusCode));
            }
            else {
                const temperature = parseFloat(body);
                if (this.debug)
                    this.log("Temperature is currently at %s", temperature);

                callback(null, temperature);
            }
        });
    },

};
