# Draw On Your Screen 2

![image](https://user-images.githubusercontent.com/51864789/202538664-799678ae-6cd5-46e6-9907-75deeb4bf16b.png)

<p align="center">
  <a href="https://extensions.gnome.org/extension/4937/draw-on-you-screen-2/"><img src="https://img.shields.io/badge/Download-extensions.gnome.org-CB74D9.svg?logo=gnome&logoColor=lightgrey&labelColor=303030" /></a></br>
  <a href="https://www.buymeacoffee.com/zhrexl" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/default-orange.png" alt="Buy Me A Coffee" height="41" width="174"></a>
</p>

Orginally forked from: [Abakkk](https://codeberg.org/som/DrawOnYourScreen)

Start drawing with Super+Alt+D or with your preferred shortcut!

Then save your beautiful work by taking a screenshot.

## Features

* Basic shapes (rectangle, circle, ellipse, line, curve, polygon, polyline, text, image, free)
* Basic transformations (move, rotate, resize, stretch, mirror, inverse)
* Smooth stroke
* Draw over applications
* Keep drawings on desktop background with persistence (notes, children's art ...)
* Multi-monitor support
* Stylus and Multi mouse Pointers Support
* Export to SVG

## Development Goals

* Add Smooth Tool
* Improve Move and Resize Stability
* Improve UI for touch screens
* Improve Perfomance and Stability
* Reorganize the code for better Maintainability

## Instalation 1

1. Install it from [GNOME Extensions](https://extensions.gnome.org/extension/4937/draw-on-you-screen-2/)

## Instalation 2

1. Clone this repository
2. Place the directory (the one that contains `metadata.json`) in `~/.local/share/gnome-shell/extensions`
3. **Change the directory name** to `draw-on-your-screen2@zhrexl.github.com`
4. You might wanna save the gsettings too, running:
  ```
  sudo cp ~/.local/share/gnome-shell/extensions/draw-on-your-screen2@zhrexl.github.com/schemas/org.gnome.shell.extensions.draw-on-your-screen.gschema.xml \
    /usr/share/glib-2.0/schemas/ &&
  sudo glib-compile-schemas /usr/share/glib-2.0/schemas/
  ```
5. Xorg: press `alt + F2`, type`r` and then OK to restart gnome-shell  
   Wayland: restart session
6. Enable the extension with GNOME Extensions or GNOME Tweaks
7. `Super + Alt + D` to test
8. [Click here](https://github.com/zhrexl/DrawOnYourScreen2/issues) to say it doesn't work

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

