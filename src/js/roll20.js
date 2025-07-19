'use strict';

/* 
 * Roll20Pixels Chrome Extension
 * This file contains the code that is injected into the Roll20 page.
 * It sets up the user interface for the extension, allowing users to connect and manage their Pixels.
 * It is injected by the background service worker when the extension icon is clicked.
 * The injected script creates a floating dialog in the Roll20 interface.
 */

/* 
 * Determine if the Roll20Pixels extension is already loaded.
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
     * Create an array to store the connected dice.
     * Each die is represented by a Pixel object.
     */
    var pixels = [];

    /* 
     * Get the chat area element from the Roll20 page.
     * This is where the floating dialog will be injected.
     */
    const chatArea = document.getElementById('textchat-input');

    /* 
     * Helper function to create consistently formated debug messages.
     * This function will log messages to the console with a timestamp if debug mode is enabled.
     */
    function logger(msg) { 
        if (!debug) { return; }
        const date = new Date();
        const timestamp = date.toISOString().replace(/T/, ' ').replace(/\..+/, '');
        console.log(`[${timestamp}] ${msg}`);
    }

    /* 
     * Function to create the UI for the extension.
     * This function creates the floating dialog that is injected into the Roll20 interface.
     */
    function setupUI() {
        const container = document.createElement('div');
        container.setAttribute('class', 'pixelsFrame');
        chatArea.appendChild(container);
        
        let offsetX, offsetY, isDown = false;
        container.addEventListener('mousedown', function(e) {
            isDown = true;
            offsetX = e.clientX - container.offsetLeft;
            offsetY = e.clientY - container.offsetTop;
            document.body.style.userSelect = 'none';
        });

        document.addEventListener('mousemove', function(e) {
            if (!isDown) return;
            container.style.left = (e.clientX - offsetX) + 'px';
            container.style.top = (e.clientY - offsetY) + 'px';
        });

        document.addEventListener('mouseup', function() {
            isDown = false;
            document.body.style.userSelect = '';
        });
      
        const title = document.createElement('div');
        title.className = 'title';
        title.innerHTML = 'Roll20Pixels';
        container.appendChild(title);

        const connectDiceBtn = document.createElement('button');
        connectDiceBtn.className = 'connectButtons';
        connectDiceBtn.innerHTML = '<span>&#10133;</span>Connect';
        connectDiceBtn.addEventListener('click', () => connectToPixel());
        container.appendChild(connectDiceBtn);

        const disconnectDiceBtn = document.createElement('button');
        disconnectDiceBtn.className = 'connectButtons';
        disconnectDiceBtn.innerHTML = '<span>&#10060;</span>Disconnect';
        disconnectDiceBtn.addEventListener('click', () => disconnectAllPixels());
        container.appendChild(disconnectDiceBtn);

        const blockDice = document.createElement('div');
        blockDice.id = 'blockdice';
        blockDice.className = 'blockdice collapsible';
        container.appendChild(blockDice);

        const diceList = document.createElement('div');
        diceList.id = 'diceList';
        diceList.className = 'collapsible-content show';
        blockDice.appendChild(diceList);
    }

    /* 
     * Function to update the status of all dice in the floating dialog.
     */
    function updateDiceStatus() {
        pixels.forEach(pixel => {
            if (!pixel.enabled) { pixel.status = "disabled"; pixel.lastFaceUp = 'N/A'; }
            else if (pixel.isRolling) { pixel.status = "rolling"; }
            else if (pixel.status != "rolled") { pixel.status = "ready"; }
            const diceElement = document.querySelector(`[data-name="${pixel.name}"]`);
            diceElement.getElementsByClassName('face-value')[0].textContent = pixel.lastFaceUp || 'N/A';
            logger(`Updating Pixel: ${pixel.name} (${pixel.status}) => ${pixel.lastFaceUp}`);
        });
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
                showDice();
            }
        } catch (error) {
            logger('Bluetooth device error: ' + error);
        }
        logger('Bluetooth device setup completed');
    }

    /* 
     * Function to disconnect all Pixels.
     */
    function disconnectAllPixels() {
        logger('Disconnecting all Pixels...');
        pixels.forEach(pixel => pixel.disconnect());
        pixels = [];
        showDice();
    }

    /* 
     * Function to update the dice list in the UI.
     */
    function showDice() {
        const diceContainer = document.getElementById('diceList');
        const blockDice = document.getElementById('blockdice');
        diceContainer.innerHTML = '';

        pixels.forEach(pixel => { 
            logger(`Creating new Pixel: ${pixel.name} (${pixel.status})`);
            if (!pixel.enabled) { pixel.status = "disabled"; } 
            const diceElement = document.createElement('div');
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.id = 'check-' + pixel.name;
            if (pixel.status == 'disabled') { check.checked = false; }
            else { check.checked = true; }
            check.addEventListener('click', () => {
                if (check.checked) { 
                    pixel.enabled = true;
                    pixel.status = 'ready'; 
                } 
                else { 
                    pixel.enabled = false;
                    pixel.status = 'disabled'; 
                }
                logger(`Toggling Pixel: ${pixel.name} (${pixel.status})`);
            });
            diceElement.className = `dice ${pixel.status}`;
            diceElement.setAttribute("data-name", pixel.name);
            const spanA = document.createElement('span');
            spanA.textContent = pixel.name
            const spanB = document.createElement('span');
            spanB.className = 'face-value';
            spanB.textContent = pixel.faceValue || 'N/A';
            const btn = document.createElement('button');
            btn.className = 'connectedDiceSmall';
            btn.innerHTML = '&#10060;';
            btn.addEventListener('click', () => {
                pixel.disconnect();
                pixels = pixels.filter(p => p.name !== pixel.name);
                showDice();
            });
            diceElement.append(check, spanA, spanB, btn);
            diceContainer.append(diceElement);
        });
        diceContainer.removeEventListener('click', function (event) { }, false);
        diceContainer.addEventListener('click', event => {
            const eventId = event.target.nodeName;
            if (!eventId == 'BUTTON') { event.stopPropagation(); }
        }, false);

        blockDice.removeEventListener('click', function (event) { }, false);
        blockDice.addEventListener('click', () => { diceContainer.classList.toggle('show'); });
        updateDiceStatus();
    }

    /* 
     * Function to post a chat message.
     * This is run when all enabled dice have a status of 'rolled'.
     */
    function postChatMessage() {
        let result = [];
        pixels.forEach(pixel => {
            if (pixel.enabled) { result.push(pixel.lastFaceUp.toString()); }
        });
        let message = `ROLLED: ${result.join(' ')}`;
        try {
            const chatArea = document.getElementById("textchat-input");
            const chatText = chatArea?.getElementsByTagName("textarea")[0];
            const submitBtn = chatArea?.getElementsByTagName("button")[0];
            const current_msg = chatText.value;
            chatText.value = message;
            submitBtn.click();
            chatText.value = current_msg;
        }
        catch (_) {
            logger("Unable to find Roll20 chat textarea and/or button");
        }
        logger("Posted chat message: " + message);
    }

    /* 
     * Function to identify when all enabled dice have been rolled.
     * This is run when any die has a status of 'rolled'.
     * The function will verify that all enabled dice have been rolled.
     * The postChatMessage() function will be called if all enabled dice are ready.
     * The updateDiceStatus() function will be called if any enabled die is not ready.
     */
    const rolled = () => {
        let ready = false;
        pixels.forEach(pixel => {
            if (pixel.enabled && pixel.status != "rolled") {
                logger(`Pixel ${pixel.name} is not rolled yet.`);
                ready = false;
                return;
            }
            ready = true;
        });
        if (ready) { postChatMessage(); }
        else { updateDiceStatus(); }
    };

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
        get isRolling() { return this._hasMoved; }
        get lastFaceUp() { return this._face; }
        set lastFaceUp(value) { this._face = value; }
        get token() { return this._token; }
        get status() { return this._status; }
        set status(value) { this._status = value; }
        get enabled() { return this._enabled; }
        set enabled(value) { this._enabled = value; }

        disconnect() {
            this._server?.disconnect();
            this._server = null;
            logger(`Pixel ${this._name} has been disconnected.`);
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
            this._face = face + 1;
            if (eventId == 1) {
                this._hasMoved = false;
                this._status = "rolled";
                rolled();
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
                updateDiceStatus();
            }
        }
    }

    /* 
     * Create the floating dialog UI.
     * This will be called when the Roll20 chat area is found.
     */
    if (chatArea) { setupUI(); }
    else { logger("Unable to find Roll20 chat area. UI will not be injected."); }
}
