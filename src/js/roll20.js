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
    const PIXELS_WRITE_CHARACTERISTIC = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E".toLowerCase()
    const deviceSetup = { filters: [{ services: [PIXELS_SERVICE_UUID] }] };
    const maxConnectionAttempts = 5;

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
     * Helper function to convert a byte array to a hexadecimal string.
     */
    function uint32ToHexString(uint32) {
        let uint32Array = [ (uint32 & 0xFF), ((uint32 >> 8) & 0xFF), ((uint32 >> 16) & 0xFF), ((uint32 >> 24) & 0xFF) ]
        return uint32Array.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /* 
     * Function to create the UI for the extension.
     * This function creates the floating dialog that is injected into the Roll20 interface.
     */
    function setupUI() {
        const container = document.createElement('div');
        container.setAttribute('class', 'pixelsFrame');
        chatArea.appendChild(container);

        const title = document.createElement('div');
        title.className = 'title';
        title.innerHTML = 'Roll20Pixels';
        container.appendChild(title);

        let offsetX, offsetY, isDown = false;
        title.addEventListener('mousedown', function(e) {
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

        container.style.left = (document.documentElement.clientWidth-300) + 'px';
        container.style.top = '100px';
        logger('Moved PixelFrame to: ' + container.style.left + '/' + container.style.top);

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

            let server, notify, write;
            const connect = async () => {
                logger('Connecting to Pixel: ' + device.name);
                server = await device.gatt.connect();
                const service = await server.getPrimaryService(PIXELS_SERVICE_UUID);
                notify = await service.getCharacteristic(PIXELS_NOTIFY_CHARACTERISTIC);
                write = await service.getCharacteristic(PIXELS_WRITE_CHARACTERISTIC);
                logger('Connected to Pixel: ' + device.name);
                if (!notify || !write) {
                    throw new Error('Required characteristics not found');
                }
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

            if (server && notify && write) {
                try {
                    logger('Starting Pixel notifications');
                    const pixel = new Pixel(device.name, server, write);
                    await notify.startNotifications();
                    notify.addEventListener('characteristicvaluechanged', ev => pixel.handleNotifications(ev));
                    pixel.sendMessage(new Uint8Array([0x01]));
                    pixel.animator.sparkleAnimation(null, 4000, 50);
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
                    pixel.animator.sparkleAnimation(null, 4000, 50);
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
            spanA.addEventListener('click', () => {
                pixel.animator.spinAnimation(0xFF0000);
                logger("Clicked on Pixel: " + pixel.name);
            });

            const spanB = document.createElement('span');
            spanB.className = 'face-value';
            spanB.textContent = pixel.faceValue || 'N/A';
            spanB.addEventListener('click', () => {
                pixel.animator.waveAnimation();
                logger("Clicked on face value: " + (pixel.faceValue || 'N/A'));
            });

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
        if (result.length == 0) {
            logger("No enabled dice to post.");
            return;
        }
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

    class PixelAnimator {
        constructor(pixel) {
            this._pixel = pixel;
            this._animation = null;
            this._loops = 0;
            this._isRunning = false;
        }

        get isRunning() { return this._isRunning; }
        get animation() { return this._animation; }
        
        /*
         * Function to set lights on the Pixel.
         * @param {number} count - Number of blinks.
         * @param {number} duration - Duration of the blink in milliseconds.
         * @param {number} color - Color in 32 bits ARGB format (alpha value is ignored).
         * @param {string} faceMask - Select which faces to light up (0000 0000 0000 0000 0000 0000 0000 0000).
         * @param {number} fade - Amount of in and out fading (0-255).
         * @param {number} loopCount - How many times this animation should play.
         * This function sends a message to the Pixel to start blinking.
         */
        _setLights(count, duration, color, faceMask, fade, loopCount) {
            faceMask = parseInt(faceMask.replace(/\s+/g, ''), 2);
            let msg = [29 & 0xFF];              // Id	        1 byte	    Value: 29
            msg.push(count & 0xFF);             // Count	    1 byte	    Number of blinks
            msg.push(duration & 0xFF);          // Duration	    2 bytes	    Animation duration in milliseconds
            msg.push((duration >> 8) & 0xFF);   // Color	    4 bytes	    Color in 32 bits ARGB format (alpha value is ignored)
            msg.push(color & 0xFF); 
            msg.push((color >> 8) & 0xFF); 
            msg.push((color >> 16) & 0xFF); 
            msg.push((color >> 24) & 0xFF); 
            msg.push(faceMask & 0xFF);          // Face Mask	4 bytes	    Select which faces to light up
            msg.push((faceMask >> 8) & 0xFF);
            msg.push((faceMask >> 16) & 0xFF);
            msg.push((faceMask >> 24) & 0xFF);
            msg.push(fade);                     // Fade         1 byte	    Amount of in and out fading (*)
            msg.push(loopCount);                // Loop Count	1 byte	    How many times this animation should play
            this._pixel.sendMessage(new Uint8Array(msg));
            logger(`Pixel ${this._pixel._name} is blinking.`);
        }

        async spinAnimation(color = 0x00FF00) {
            if (this._isRunning) {
                logger(`Animation ${this._animation} is already running on Pixel ${this._pixel.name}`);
                return;
            }
            this._isRunning = true;
            this._animation = "spinAnimation";
            logger(`Starting ${this._animation} on Pixel ${this._pixel.name}`);

            let leds = [
                "0000 0000 0000 1000 0000 0000 0000 0000",
                "0000 0000 0000 0000 0000 0000 0000 0010",
                "0000 0000 0000 0010 0000 0000 0000 0000",
                "0000 0000 0000 0000 0000 0000 0001 0000",
                "0000 0000 0000 0000 0001 0000 0000 0000",
                "0000 0000 0000 0000 0000 0000 0000 0001",
                "0000 0000 0000 0100 0000 0000 0000 0000",
                "0000 0000 0000 0000 0000 0000 0000 0100",
                "0000 0000 0000 0000 1000 0000 0000 0000",
                "0000 0000 0000 0000 0000 0000 1000 0000"
            ]
            for (let j = 0; j < 5; j++) {
                for (let i = 0; i < 10; i++) {
                    this._setLights(1, 500, color, leds[i], 0, 1);
                    await new Promise((resolve) => setTimeout(() => resolve(), 100));
                }
            }
            this.stopAnimation();
        }

        async pulseAnimation(color = 0x00FF00) {
            if (this._isRunning) {
                logger(`Animation ${this._animation} is already running on Pixel ${this._pixel.name}`);
                return;
            }
            this._isRunning = true;
            this._animation = "pulseAnimation";
            logger(`Starting ${this._animation} on Pixel ${this._pixel.name}`);

            let leds = "0000 0000 0000 1111 1111 1111 1111 1111";
            this._setLights(1, 750, color, leds, 255, 5);
            await new Promise((resolve) => setTimeout(() => resolve(), 3750));
            this.stopAnimation();
        }

        sparkleAnimation(color = null, duration = 3000, interval = 100) {
            if (this._isRunning) {
                logger(`Animation ${this._animation} is already running on Pixel ${this._pixel.name}`);
                return;
            }
            this._isRunning = true;
            this._animation = "sparkleAnimation";
            logger(`Starting ${this._animation} on Pixel ${this._pixel.name}`);

            const totalLights = 20;
            let lights = new Array(totalLights).fill(null);
            let random_color = null;
            let lightColors = [0xFF0000, 0x00FF00, 0x0000FF];
            const sparkleInterval = setInterval(() => {
                const lightsToChange = Math.floor(Math.random() * 5) + 1;
                if (!color) { random_color = lightColors[Math.floor(Math.random() * lightColors.length)];
                } else { random_color = color; }
                for (let i = 0; i < lightsToChange; i++) {
                    const id = Math.floor(Math.random() * totalLights);
                    lights[id] = lights[id] ? null : random_color;
                }
                this._setLights(1, duration, random_color, lights.map(l => l ? '1' : '0').join(''), 0, 1);
            }, interval);

            setTimeout(() => {
                clearInterval(sparkleInterval);
                this.stopAnimation();
            }, duration);
        }

        waveAnimation(duration = 3000, interval = 100) {
            if (this._isRunning) {
                logger(`Animation ${this._animation} is already running on Pixel ${this._pixel.name}`);
                return;
            }
            this._isRunning = true;
            this._animation = "waveAnimation";
            logger(`Starting ${this._animation} on Pixel ${this._pixel.name}`);

            const totalLights = 20;
            const lightColors = [0xFF0000, 0x00FF00, 0x0000FF, 0xFFFF00, 0xFF00FF];
            let lights = new Array(totalLights).fill(null);
            let waveStart = 0;

            const waveInterval = setInterval(() => {
                // Clear all lights
                lights.fill(null);

                // Pick a color for this wave frame
                const waveColor = lightColors[Math.floor(Math.random() * lightColors.length)];

                // Light up a wave of 3 lights
                for (let i = 0; i < 3; i++) {
                    const pos = (waveStart + i) % totalLights;
                    lights[pos] = waveColor;
                }

                // Advance the wave
                waveStart = (waveStart + 1) % totalLights;

                // Send the light pattern
                this._setLights(1, duration, waveColor, lights.map(l => l ? '1' : '0').join(''), 0, 1);
            }, interval);

            setTimeout(() => {
                clearInterval(waveInterval);
                this.stopAnimation();
            }, duration);
        }

        stopAnimation() {
            logger(`Stopping ${this._animation} on Pixel ${this._pixel.name}`);
            this._isRunning = false;
            this._animation = null;
        }

    }

    /* 
     * Pixel class to represent a connected Pixel.
     */
    class Pixel {
        constructor(name, server, writeCharacteristic) {
            this._name = name;
            this._server = server;
            this._writeCharacteristic = writeCharacteristic;
            this._hasMoved = false;
            this._status = 'disabled';
            this._token = `#${name.replace(/\s+/g, '_').toLowerCase()}`;
            this._enabled = false;
            this._info = {};
            this._animator = new PixelAnimator(this);
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
        get animator() { return this._animator; }

        disconnect() {
            this.animator.pulseAnimation(0xFF0000);
            setTimeout(function() {
                this._server?.disconnect();
                this._server = null;
            }, 5000);
            logger(`Pixel ${this._name} has been disconnected.`);
        }

        async sendMessage(bytes) {
            if (!this._writeCharacteristic) {
               logger(`Unable to send message to Pixel ${this._name}`);
            return;
        }
            try {
                await this._writeCharacteristic.writeValue(bytes);
                logger(`Sent message to Pixel ${this._name}: ${Array.from(new Uint8Array(bytes.buffer)).map(b => '0x' + b.toString(16).padStart(2, '0')).join(' ')}`);
            } catch (err) {
                logger(`Failed to send message to Pixel ${this._name}: ${err}`);
            }
        }

        handleNotifications(event) {
            let value = event.target.value;
            let arr = [];
            for (let i = 0; i < value.byteLength; i++) {
                arr.push('0x' + ('00' + value.getUint8(i).toString(16)).slice(-2));
            }

            // IAmADie Message: https://github.com/GameWithPixels/.github/blob/main/doc/CommunicationsProtocol.md#iamadie
            if (value.getUint8(0) == 2) { this._handleInfoEvent(value); }

            // RollState Message: https://github.com/GameWithPixels/.github/blob/main/doc/CommunicationsProtocol.md#rollstate
            else if (value.getUint8(0) == 3) { this._handleFaceEvent(value.getUint8(1), value.getUint8(2)); }

            // BatteryLevel Message: https://github.com/GameWithPixels/.github/blob/main/doc/CommunicationsProtocol.md#batterylevel
            else if (value.getUint8(0) == 34) { this._handleBatteryEvent(value); }
        }

        _handleInfoEvent(msg) {
            // Get the Pixel information from the message.
            this._info["ledCount"] = msg.getUint8(1);               //  1 Led Count	        1 byte	    Number of LEDs
            this._info["designColour"] = msg.getUint8(2);           //  2 Design & Color	1 byte	    Physical look of the die
            this._info["msg3"] = msg.getUint8(3);                   //  3 N/A	            1 byte
            this._info["dataSetHash"] = msg.getUint32(4, true);     //  4 Data Set Hash	    4 bytes	    Internal
            this._info["pixelId"] = msg.getUint32(8, true);         //  5 Pixel Id	        4 bytes	    Unique identifier
            this._info["availableFlash"] = msg.getUint16(12, true); //  6 Available Flash	2 bytes	    Unique identifier
            this._info["buildTimestamp"] = msg.getUint32(14, true); //  7 Build Timestamp	4 bytes	    Firmware build timestamp (UNIX)
            this._info["rollState"] = msg.getUint8(18);             //  8 Roll State	    1 byte	    Current rolling state
            this._info["currentFace"] = msg.getUint8(19);           //  9 Current Face	    1 byte	    Current face up (face index)
            this._info["batLevel"] = msg.getUint8(20);              // 10 Battery Level	    1 byte	    Battery level in percentage
            this._info["batState"] = msg.getUint8(21);              // 11 Battery State	    1 byte	    Battery state (charging or else)

            // Convert the information to a more readable format.
            this._info["dataSetHash"] = uint32ToHexString(this._info["dataSetHash"], 4);
            this._info["pixelId"] = uint32ToHexString(this._info["pixelId"], 4);
            let date = new Date(this._info["buildTimestamp"] * 1000);
            this._info["buildTimestamp"] = date.toISOString().slice(0, 19);
            this._info["currentFace"] = this._info["currentFace"] + 1;
            this._info["batState"] = this._info["batState"] == 0 ? "Not Charging" : "Charging";
            logger(`Received info for Pixel ${this._name} => ${JSON.stringify(this._info, null, 2)}`);
        }

        _handleBatteryEvent(msg) {
            // Get the battery level and state from the message.
            this._info["batLevel"] = msg.getUint8(1);
            this._info["batState"] = msg.getUint8(2) == 0 ? "Not Charging" : "Charging";
            logger(`Received battery info for Pixel ${this._name} => ${this._info["batLevel"]}% and ${this._info["batState"]}`);
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
