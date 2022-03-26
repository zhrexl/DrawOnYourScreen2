# Draw On Your Screen 2

Orginally forked from: https://codeberg.org/som/DrawOnYourScreen

Start drawing with Super+Alt+D.
Then save your beautiful work by taking a screenshot.

![](https://codeberg.org/som/DrawOnYourScreen/raw/branch/media/screenshot.jpg)

## Features

* Basic shapes (rectangle, circle, ellipse, line, curve, polygon, polyline, text, image, free)
* Basic transformations (move, rotate, resize, stretch, mirror, inverse)
* Smooth stroke
* Draw over applications
* Keep drawings on desktop background with persistence (notes, children's art ...)
* Multi-monitor support
* Initial stylus support
* Export to SVG

## Development Goals

* Better support for tablet, stylus and touchscreen
* Migrate to GTK4 and libadwaita
* Improve Perfomance

## Install

1. Download and decompress or clone the repository
2. Place the directory (the one that contains `metadata.json`) in `~/.local/share/gnome-shell/extensions`
3. **Change the directory name** to `draw-on-your-screen2@zhrexl.github.com`
4. Xorg: type `alt + F2` and `r` to restart gnome-shell  
   Wayland: restart session
5. Enable the extension with GNOME Extensions or GNOME Tweaks application
6. `Super + Alt + D` to test
7. [https://github.com/zhrexl/DrawOnYourScreen2/issues](https://github.com/zhrexl/DrawOnYourScreen2/issues) to say it doesn't work

## Tips and tricks

* Power is nothing without control:

 The `Ctrl` key provides an extra functionality for each tool.

 [Range of Ctrl key possibilities](https://codeberg.org/som/DrawOnYourScreen/src/branch/media/ctrl.webm)

* Draw arrows:

 Intersect two lines and curve the second thanks to the `Ctrl` key.

 [How to draw an arrow](https://codeberg.org/som/DrawOnYourScreen/src/branch/media/arrow.webm)

* Duplicate an element:

 Hold the `Shift` key while starting moving.
 
 [How to duplicate an element](https://codeberg.org/som/DrawOnYourScreen/src/branch/media/duplicate.webm)

* Insertable images:

 You can insert images (jpeg, png, svg) in your drawings. By default images are sought in `~/.local/share/draw-on-your-screen/images/` but the location is configurable in the preferences. Another way is to copy-past the images from Nautilus or any clipboard source by using the usual `Ctrl + V` shortcut inside the drawing mode.
 
 [How to add images from Nautilus](https://codeberg.org/som/DrawOnYourScreen/src/branch/media/ctrl-plus-v.webm)

* Eraser and SVG:

 There is no eraser in SVG so when you export elements made with the eraser to a SVG file, they are colored with the background color, transparent if it is disabled. See `“Add a drawing background”` or edit the SVG file afterwards.

* Screenshot Tool extension:

 [Screenshot Tool](https://extensions.gnome.org/extension/1112/screenshot-tool/) is a convenient extension to “create, copy, store and upload screenshots”. In order to select a screenshoot area with your pointer while keeping the drawing in place, you need first to tell DrawOnYourScreen to ungrab the pointer (`Ctrl + Super + Alt + D`).

* Color Picker extension:

 If the GNOME Shell built-in color picker is too basic for you, have a look at the [Color Picker extension](https://extensions.gnome.org/extension/3396/color-picker), which let's you select the pixel accurately, preview the color and adjust its values. Once installed and enabled, it will be transparently integrated into DrawOnYourScreen.

 ![Color Picker extension in action](https://codeberg.org/som/DrawOnYourScreen/raw/branch/media/color-picker-extension.jpg)

