'use strict';

/* 
 * Roll20Pixels Chrome Extension
 * This file contains the code that is injected into the Roll20 page.
 */


/* 
 * Only run this code if the Roll20Pixels extension is not already loaded.
 */
if (typeof window.roll20PixelsLoaded == 'undefined') {
    var roll20PixelsLoaded = true;

    /* 
     * Setting 'debug' to true will enable debug messages in the console
     */
    const debug = true;

    logger("Roll20Pixels started");

    /* 
     * Setup parameters for the Bluetooth connection.
     * This is used to filter the devices that are shown in the Bluetooth connection window.
     */
    const PIXELS_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E".toLowerCase()
    const PIXELS_NOTIFY_CHARACTERISTIC = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E".toLowerCase()
    // const PIXELS_WRITE_CHARACTERISTIC = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E".toLowerCase()
    const deviceSetup = { filters: [{ services: [PIXELS_SERVICE_UUID] }] };
    const maxConnectionAttempts = 3;

    /*
     * Create array to store the connected dice.
     * Each die is represented by a Pixel object.
     */
    var pixels = [];

    /* 
     * Helper function to create consistently formated debug messages.
     */
    function logger(msg) { 
        if (!debug) { return; }
        const date = new Date();
        const timestamp = date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
        console.log(`[${timestamp}] ${msg}`);
    }

    /*
     * Generic function to send messages to the popup script (/js/popup.js).
     * This is used by all functions that need to communicate with the popup.
     * Chrome runtime errors are silently ignored.
     * This is done to avoid breaking the extension if the popup is closed.
     */
    function sendMessageToExtension(data) {
        chrome.runtime.sendMessage(data, _ => { if (chrome.runtime.lastError) { } });
        logger("Message sent to extension: " + JSON.stringify(data));
    }

    /* 
     * Function to send message with updated status for all dice.
     * This ensure the popup only gets an update for dice that are enabled.
     */
    function updateDiceStatus() {
        pixels.forEach(pixel => {
            let faceValue = pixel.lastFaceUp + 1;
            if (!pixel.enabled) { pixel.status = "disabled"; faceValue = 'N/A'; }
            else if (pixel.isRolling) { pixel.status = "rolling"; }
            else if (pixel.status != "rolled") { pixel.status = "ready"; }
            sendMessageToExtension({ action: "updateDiceData", diceName: pixel.name, faceValue: faceValue, status: pixel.status });
        });
    }

    /* 
     * Function to send message with all dice info to the popup.
     * This is used by the popup to create the list of connected dice.
     */
    function sendDiceToExtension() {
        pixels.forEach(pixel => { if (!pixel.enabled) { pixel.status = "disabled"; } });
        sendMessageToExtension({ action: "showDice", dice: pixels.map(pixel => ({ name: pixel.name, token: pixel.token, status: pixel.status })) });
        updateDiceStatus();
    }

    /* 
     * Function to connect a Pixel via Bluetooth.
     * This is run when the user clicks the "Connect" button in the popup.
     * The function will show the Bluetooth connection window and allow the user to select a Pixel.
     */
    async function connectToPixel() {
        logger('Requesting Bluetooth device...');
        try {
            const device = await navigator.bluetooth.requestDevice(deviceSetup);
            if (pixels.some(pixel => pixel.name === device.name)) {
                logger('Pixel "' + device.name + '" already connected.');
                return;
            }

            let server, notify;
            const connect = async () => {
                logger('Connecting to Pixel: ' + device.name);
                server = await device.gatt.connect();
                const service = await server.getPrimaryService(PIXELS_SERVICE_UUID);
                notify = await service.getCharacteristic(PIXELS_NOTIFY_CHARACTERISTIC);
            };

            for (let i = maxConnectionAttempts - 1; i >= 0; --i) {
                try {
                    await connect();
                    break;
                } catch (error) {
                    logger('Pixel connection error: ' + error);
                    if (i) {
                        const delay = 2;
                        logger('Try again in ' + delay + ' seconds');
                        await new Promise((resolve) => setTimeout(() => resolve(), delay * 1000));
                    }
                }
            }

            if (server && notify) {
                try {
                    logger('Starting Pixel notifications');
                    const pixel = new Pixel(device.name, server);
                    await notify.startNotifications();
                    notify.addEventListener('characteristicvaluechanged', ev => pixel.handleNotifications(ev));
                    pixels.push(pixel);
                } catch (error) {
                    logger('Pixel notifications connection error: ' + error);
                    await delay(1000);
                }
                sendDiceToExtension();
            }
        } catch (error) {
            logger('Bluetooth device error: ' + error);
        }
        logger('Bluetooth device setup completed');
    }

    /* 
     * Pixel class to represent a connected Pixel.
     */
    class Pixel {
        constructor(name, server) {
            this._name = name;
            this._server = server;
            this._hasMoved = false;
            this._status = 'disabled';
            this._token = `#${name.replace(/\s+/g, '_').toLowerCase()}`;
            this._enabled = false;
        }

        get isConnected() { return this._server != null; }
        get name() { return this._name; }
        get isRolling() { return this._hasMoved };
        get lastFaceUp() { return this._face; }
        get token() { return this._token; }
        get status() { return this._status; }
        set status(value) { this._status = value; }
        get enabled() { return this._enabled; }
        set enabled(value) { this._enabled = value; }

        disconnect() {
            this._server?.disconnect();
            this._server = null;
            logger('Pixel "' + this._name + '" disconnected.');
        }

        handleNotifications(event) {
            let value = event.target.value;
            let arr = [];
            for (let i = 0; i < value.byteLength; i++) {
                arr.push('0x' + ('00' + value.getUint8(i).toString(16)).slice(-2));
            }

            if (value.getUint8(0) == 3) {
                this._handleFaceEvent(value.getUint8(1), value.getUint8(2))
            }
        }

        _handleFaceEvent(eventId, face) {
            this._face = face;
            if (eventId == 1) {
                this._hasMoved = false;
                this._status = "rolled";
            }
            else if (eventId == 3 && !this._hasMoved) {
                this._hasMoved = true;
                this._status = "rolling";
            } 
            else if (eventId == 5) {
                this._hasMoved = false;
                this._status = "forced";
            }
            if (this._enabled) {
                sendMessageToExtension({ action: "updateDiceData", diceName: this.name, faceValue: face+1, status: this.status });
            }
        }
    }

    /* 
     * Create listener for messages from the popup window.
     */
    chrome.runtime.onMessage.addListener((msg, _, __) => {
        logger("Message received from extension: " + JSON.stringify(msg));
        if (msg.action == "connect") { 
            connectToPixel();
        }
        else if (msg.action == "disconnectDie") {
            pixels.find(pixel => pixel.name === msg.name)?.disconnect();
            pixels = pixels.filter(pixel => pixel.name !== msg.name);
            sendDiceToExtension();
        }
        else if (msg.action == "disconnectAll") {
            pixels.forEach(pixel => pixel.disconnect());
            pixels = [];
            sendDiceToExtension();
        }
        else if (msg.action == "getStatus") { 
            sendDiceToExtension();
        }
        else if (msg.action == "updateDieStatus") {
            const pixel = pixels.find(pixel => pixel.name === msg.name);
            if (pixel) { 
                pixel.status = msg.status;
                pixel.enabled = true;
                if (msg.status == "disabled") { pixel.enabled = false; }
            }
        }
    });

    /* 
     * Send message to the popup with the list of connected dice.
     */
    sendDiceToExtension();
}
