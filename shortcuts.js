/*
 * Copyright 2019 Abakkk
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-FileCopyrightText: 2019 Abakkk
 * SPDX-License-Identifier: GPL-3.0-or-later
 */


// The setting keys of the "org.gnome.shell.extensions.draw-on-your-screen" schema.
export const GLOBAL_KEYBINDINGS = [
    'toggle-drawing', 'toggle-modal', 'erase-drawings',
];
export const GLOBAL_KEYBINDINGS_SWITCHES = [
    'persistent-over-toggles', 'persistent-over-restarts', 'drawing-on-desktop', 'osd-disabled', 'indicator-disabled', 'quicktoggle-disabled', 'copy-picked-hex',
];
// The setting keys of the "org.gnome.shell.extensions.draw-on-your-screen.internal-shortcuts" schema.
export const INTERNAL_KEYBINDINGS = [
    'undo', 'redo', 'delete-last-element', 'smooth-last-element',
    'select-none-shape', 'select-line-shape', 'select-ellipse-shape', 'select-rectangle-shape', 'select-polygon-shape', 'select-polyline-shape',
     'select-text-shape', 'select-image-shape', 'select-move-tool', 'select-resize-tool', 'select-mirror-tool',
    'switch-fill', 'switch-fill-rule', 'switch-color-palette', 'switch-color-palette-reverse', 'pick-color',
    'increment-line-width', 'increment-line-width-more', 'decrement-line-width', 'decrement-line-width-more',
     'switch-linejoin', 'switch-linecap', 'switch-dash',
    'switch-font-family', 'switch-font-family-reverse', 'switch-font-weight', 'switch-font-style', 'switch-text-alignment',
    'switch-image-file', 'switch-image-file-reverse', 'paste-image-files',
    'toggle-panel-and-dock-visibility', 'toggle-background', 'toggle-grid', 'toggle-square-area',
    'open-next-json', 'open-previous-json', 'save-as-json', 'export-to-svg', 'open-preferences', 'toggle-help',
];
