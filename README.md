# Draw On Your Screen

Start drawing with Super+Alt+D.
Then save your beautiful work by taking a screenshot.

![](https://framagit.org/abakkk/DrawOnYourScreen/raw/ressources/screenshot.jpg)

## Features

* Basic shapes (rectangle, circle, ellipse, line, curve, text, image, free)
* Basic transformations (move, rotate, resize, stretch, mirror, inverse)
* Smooth stroke
* Draw over applications
* Keep drawings on desktop background with persistence (notes, children's art ...)
* Multi-monitor support
* Export to SVG

## Install

1. Download and decompress or clone the repository
2. Place the resulting directory in `~/.local/share/gnome-shell/extensions`
3. **Change the directory name** to `drawOnYourScreen@abakkk.framagit.org`
4. Xorg: type `alt + F2` and `r` to restart gnome-shell  
   Wayland: restart or re-login
5. Enable the extension in gnome-tweaks or gnome-shell-extension-prefs
6. `Super + Alt + D` to test
7. [https://framagit.org/abakkk/DrawOnYourScreen/issues](https://framagit.org/abakkk/DrawOnYourScreen/issues) to say it doesn't work

## Tips and tricks

* Draw arrows:

 Intersect two lines and curve the second thanks to the `Ctrl` key.

 ![How to draw an arrow](https://framagit.org/abakkk/DrawOnYourScreen/uploads/af8f96d33cfeff49bb922a1ef9f4a4ce/arrow-screencast.webm)

* Duplicate an element:

 Hold the `Shift` key while starting moving.
 
 ![How to duplicate an element](https://framagit.org/abakkk/DrawOnYourScreen/-/raw/ressources/duplicate.webm)

* Insertable images:

 You can insert images (jpeg, png, svg) in your drawings. By default images are sought in `~/.local/share/drawOnYourScreen/images/` but the location is configurable in the preferences. Another way is to copy-past the images from Nautilus or any clipboard source by using the usual `Ctrl + V` shortcut inside the drawing mode.

* Eraser and SVG:

 There is no eraser in SVG so when you export elements made with the eraser to a SVG file, they are colored with the background color, transparent if it is disabled. See `“Add a drawing background”` or edit the SVG file afterwards.

* Screenshot Tool extension:

 [Screenshot Tool](https://extensions.gnome.org/extension/1112/screenshot-tool/) is a convenient extension to “create, copy, store and upload screenshots”. In order to select a screenshoot area with your pointer while keeping the drawing in place, you need first to tell DrawOnYourScreen to ungrab the pointer (`Ctrl + Super + Alt + D`).

