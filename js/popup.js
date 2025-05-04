'use strict';

/* 
 * Roll20Pixels Chrome Extension
 * This file contains the code for the popup window of the extension.
 */


/* 
 * Setting 'debug' to true will enable debug messages in the console
 */
const debug = true;

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
 * Generic function to send messages to the content script (/js/roll20.js).
 * This is used by all functions that need to communicate with the content script.
 */
function sendMessage(data, responseCallback) {
    chrome.tabs.query(
        { active: true, currentWindow: true },
        tabs => chrome.tabs.sendMessage(tabs[0].id, data, responseCallback)
    );
}

/* 
 * Function to send message requesting the Bluetooth connection window.
 * This is used when the user clicks the "Connect" button in the popup.
 */
function connectDie() {
    sendMessage({ action: 'connect' });
    logger('Showing connection window');
}

/* 
 * Function to send message requesting a specific die be disconnected.
 * This is used when the user clicks the "X" button next to a specific Pixel in the popup.
 */
function disconnectDie(name) {
    sendMessage({ action: 'disconnectDie', name });
    logger(`Disconnected die: ${name}`);
}

/* 
 * Function to send message requesting all dice be disconnected.
 * This is used when the user clicks the "Disconnect" button in the popup.
 */
function disconnectAll() {
    sendMessage({ action: 'disconnectAll' });
    logger('Disconnected all dice');
}

/* 
 * Function to send message with updated status for a specific die.
 * This is used when the user checks/unchecks a specific Pixel in the popup.
 */
function updateDiceStatus(name, status) {
    sendMessage({ action: 'updateDieStatus', name, status });
}

/* 
 * Function to create the base user interface for the popup window.
 * This runs whenever the popup opens and does not populate the dice list.
 */
function createUI(validUrl) {
    const container = document.getElementById('container');

    if (validUrl) {
        const title = document.createElement('h1');
        title.id = 'title';
        title.className = 'title';
        title.innerHTML = 'Roll20Pixels';
        container.appendChild(title);

        const connectDiceBtn = document.createElement('button');
        connectDiceBtn.id = 'connectDice';
        connectDiceBtn.className = 'connectedDice';
        connectDiceBtn.innerHTML = '<span>&#10133;</span>Connect';
        connectDiceBtn.addEventListener('click', () => connectDie());
        container.appendChild(connectDiceBtn);

        const disconnectDiceBtn = document.createElement('button');
        disconnectDiceBtn.id = 'disconnectDice';
        disconnectDiceBtn.className = 'connectedDice';
        disconnectDiceBtn.innerHTML = '<span>&#10060;</span>Disconnect';
        disconnectDiceBtn.addEventListener('click', () => disconnectAll());
        container.appendChild(disconnectDiceBtn);

        const blockDice = document.createElement('div');
        blockDice.id = 'blockdice';
        blockDice.className = 'blockdice collapsible';
        container.appendChild(blockDice);

        const diceCount = document.createElement('div');
        diceCount.id = 'dicecount';
        blockDice.appendChild(diceCount);

        const diceList = document.createElement('div');
        diceList.id = 'diceList';
        diceList.className = 'collapsible-content show';
        blockDice.appendChild(diceList);
    }
    else {
        const errorMsg = document.createElement('div');
        errorMsg.className = 'errorMsgLbl';
        errorMsg.innerHTML = 'This extension only works on roll20.net';
        container.appendChild(errorMsg);
    }
}

/* 
 * Function to create the dice list in the popup.
 * This runs when the dice list is created based on a message from the content script.
 */
function showDice(dice) {
    const diceContainer = document.getElementById('diceList');
    const blockDice = document.getElementById('blockdice');

    diceContainer.innerHTML = '';
    if (dice.length > 0) {
        dice.forEach(die => {
            logger(`Creating new die: ${die.name} (${die.status})`);
            const diceElement = document.createElement('div');
            const check = document.createElement('input');
            check.type = 'checkbox';
            check.id = 'check-' + die.name;
            if (die.status == 'disabled') { check.checked = false; }
            else { check.checked = true; }
            check.addEventListener('click', () => {
                if (check.checked) { die.status = 'ready'; } 
                else { die.status = 'disabled'; }
                updateDiceStatus(die.name, die.status);
                logger(`Toggling die: ${die.name} (${die.status})`);
            });
            diceElement.className = `dice ${die.status}`;
            diceElement.setAttribute("data-name", die.name);
            const spanA = document.createElement('span');
            spanA.textContent = die.name
            const spanB = document.createElement('span');
            spanB.className = 'face-value';
            spanB.textContent = die.faceValue || 'N/A';
            const btn = document.createElement('button');
            btn.className = 'connectedDiceSmall';
            btn.innerHTML = '&#10060;';
            btn.addEventListener('click', () => disconnectDie(die.name));
            diceElement.append(check, spanA, spanB, btn);
            diceContainer.append(diceElement);
        });
    }

    diceContainer.removeEventListener('click', function (event) { }, false);
    diceContainer.addEventListener('click', event => {
        const eventId = event.target.nodeName;
        if (!eventId == 'BUTTON') {
            event.stopPropagation();
        }
    }, false);

    blockDice.removeEventListener('click', function (event) { }, false);
    blockDice.addEventListener('click', () => {
        diceContainer.classList.toggle('show');
    });
}

/* 
 * Function to update the status of dice in the popup window.
 * This runs whenever the dice list needs to be updated based on messages from the content script.
 */
function updateDice(diceName, faceValue, status) {
    logger(`Updating die: ${diceName} (${status}) => ${faceValue}`);
    const diceElement = document.querySelector(`[data-name="${diceName}"]`);
    if (diceElement == null) {
        sendMessage({ action: "getStatus" });
        return;
    }
    diceElement.getElementsByClassName('face-value')[0].textContent = faceValue || 'N/A';
    diceElement.classList.remove("disabled", "needs-roll", "rolling", "rolled", "forced");
    diceElement.classList.add(status.toLowerCase());
}

/* 
 * Create listener for messages sent by the content script.
 * This runs whenever the content script sends a message to the popup.
 */
chrome.runtime.onMessage.addListener((request, _, __) => {
    if (request.action == "showDice") {
        showDice(request.dice);
    } else if (request.action == "updateDiceData") {
        updateDice(request.diceName, request.faceValue, request.status);
    }
});

/* 
 * Verify if the current tab is a valid Roll20 page.
 * If it is, inject the content script and create the UI.
 */
chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    let validUrl = false;
    if (tabs[0].url.includes("roll20.net")) {
        validUrl = true;
        chrome.scripting.executeScript({ target: { tabId: tabs[0].id }, files: ["/js/roll20.js"] }, _ => { 
            logger(`Injected script '/js/roll20.js' into tab ${tabs[0].id}.`);
            sendMessage({ action: "getStatus" });
        }); 
    }
    createUI(validUrl);
});
