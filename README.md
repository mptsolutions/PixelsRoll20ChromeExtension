# Roll20Pixels <img src="src/images/d20.png" width="20"/>

<img src="ui.png" align="right" width="270"/>

This is a Chrome extension that provides a simple interface for connecting [Pixels](https://gamewithpixels.com/) to the [Roll20](https://roll20.net/) website. It enables automatic posting of rolls to the game chat. 

The code is based on the proof-of-concept extension [PixelsRoll20ChromeExtension](https://github.com/Parashoot/PixelsRoll20ChromeExtension).

## What is a Pixel?

Pixels are user-customizable dice containing LEDs. They can be programmed and interacted with using Bluetooth. See the [Game with Pixels](https://gamewithpixels.com/) website or the [API documentation](https://github.com/GameWithPixels/.github/blob/main/doc/DevelopersGuide.md) for more information.

## Install the extension

1. Download the [extension files](https://github.com/mptsolutions/PixelsRoll20ChromeExtension/raw/refs/heads/main/Roll20Pixels.zip).
2. Extract the extension files to a convenient folder.
3. Open the [Chrome extension manager](chrome://extensions/) and enable Developer Mode.
4. Click the "Load Unpacked" button and select the folder you extracted the extension to.

## How To Use

1. Join a game on [Roll20](https://roll20.net/).
2. Click on the Extensions icon in Chrome's address bar.
3. Click the pin icon next to Roll20Pixels extension.
   * This will pin the Roll20Pixels icon <img src="src/images/d20_16.png" width="16"/> to the address bar.
4. Click the Roll20Pixels icon <img src="src/images/d20_disabled_16.png" width="16"/> to open the Pixel connection window. 
   * The icon will normally be gray, but will become colourful when the Pixel connection window has been loaded.
   * The Pixel connection window floats in the main Roll20 game space. It can be moved around anywhere on the page.
5. Click the Connect button and select a Pixel. Once connected, the Pixel will be listed in the connection window.
   * Continue for each Pixel.
6. Click the checkbox to enable / disable each Pixel that should be included in rolls.
7. Click the <i>Show Message Editor</i> button in the top right corner to change the message that is posted.
   * The chat message will respect the [Roll20 text chat markup](https://wiki.roll20.net/Text_Chat).
   * ```%FACE%``` will be replaced with roll value.

## Notes
   * Connections are lost when the Roll20 page is reloaded.
   * Multiple Pixels *should* work but is untested. When more than one Pixel is enabled for a roll, the results will be displayed in sequence separated by a space. (e.g. ```Rolled: 5 2 4```)
