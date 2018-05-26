"use strict";

let Service, Characteristic, api;

const request = require("request");
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

    this.getUrl = config.getUrl;

    this.homebridgeService = new Service.TemperatureSensor(this.name);
    this.homebridgeService.getCharacteristic(Characteristic.CurrentTemperature)
        .on("get", this.getTemperature.bind(this));

    this.notificationID = config.notificationID;
    this.notificationPassword = config.notificationPassword;

    if (this.notificationID) {
        api.on("didFinishLaunching", function () {
            if (api.notificationRegistration && typeof api.notificationRegistration === "function") {
                try {
                    api.notificationRegistration(this.notificationID, this.handleNotification.bind(this), this.notificationPassword);
                    this.log("Detected running notification server. Registered successfully!");
                } catch (error) {
                    this.log("Could not register notification handler. ID '" + this.notificationID + "' is already taken!")
                }
            }
        }.bind(this));
    }
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
        this._doRequest("getTemperature", this.getUrl, "GET", "getUrl", callback, function (body) {
            const temperature = parseFloat(body);
            this.log("temperature is currently at %s", temperature);

            callback(null, temperature);
        }.bind(this))
    },

    _doRequest: function (methodName, url, httpMethod, urlName, callback, successCallback) {
        if (!url) {
            this.log.warn("Ignoring " + methodName + "() request, '" + urlName + "' is not defined!");
            callback(new Error("No '" + urlName + "' defined!"));
            return;
        }

        request(
            {
                url: url,
                body: "",
                method: httpMethod,
                rejectUnauthorized: false
            },
            function (error, response, body) {
                if (error) {
                    this.log(methodName + "() failed: %s", error.message);
                    callback(error);
                }
                else if (response.statusCode !== 200) {
                    this.log(methodName + "() returned http error: %s", response.statusCode);
                    callback(new Error("Got http error code " + response.statusCode));
                }
                else {
                    successCallback(body);
                }
            }.bind(this)
        );
    }

};