/* jslint esversion: 6 */
/* exported GLOBAL_KEYBINDINGS, INTERNAL_KEYBINDINGS, OTHERS */

/*
 * Copyright 2019 Abakkk
 *
 * This file is part of DrawOnYourScreen, a drawing extension for GNOME Shell.
 * https://framagit.org/abakkk/DrawOnYourScreen
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

const Gtk = imports.gi.Gtk;

const GS_VERSION = imports.misc.config.PACKAGE_VERSION;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = ExtensionUtils.getSettings && ExtensionUtils.initTranslations ? ExtensionUtils : Me.imports.convenience;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
 
const internalShortcutsSchema = Convenience.getSettings(Me.metadata['settings-schema'] + '.internal-shortcuts').settings_schema;

const getKeyLabel = function(accel) {
    let [keyval, mods] = Gtk.accelerator_parse(accel);
    return Gtk.accelerator_get_label(keyval, mods);
};

// The setting keys of the "org.gnome.shell.extensions.draw-on-your-screen" schema.
var GLOBAL_KEYBINDINGS = [
    ['toggle-drawing', 'toggle-modal', 'erase-drawings'],
];

// The setting keys of the "org.gnome.shell.extensions.draw-on-your-screen.internal-shortcuts" schema.
var INTERNAL_KEYBINDINGS = [
    ['undo', 'redo', 'delete-last-element', 'smooth-last-element'],
    ['select-none-shape', 'select-line-shape', 'select-ellipse-shape', 'select-rectangle-shape', 'select-polygon-shape', 'select-polyline-shape',
     'select-text-shape', 'select-image-shape', 'select-move-tool', 'select-resize-tool', 'select-mirror-tool'],
    ['switch-fill', 'switch-fill-rule', 'switch-color-palette', 'switch-color-palette-reverse'],
    ['increment-line-width', 'increment-line-width-more', 'decrement-line-width', 'decrement-line-width-more',
     'switch-linejoin', 'switch-linecap', 'switch-dash'],
    ['switch-font-family', 'switch-font-family-reverse', 'switch-font-weight', 'switch-font-style', 'switch-text-alignment'],
    ['switch-image-file', 'switch-image-file-reverse', 'paste-image-files'],
    ['toggle-panel-and-dock-visibility', 'toggle-background', 'toggle-grid', 'toggle-square-area'],
    ['open-next-json', 'open-previous-json', 'save-as-json', 'export-to-svg', 'open-preferences', 'toggle-help'],
];

if (GS_VERSION < '3.36') {
    // Remove 'open-preferences' keybinding.
    INTERNAL_KEYBINDINGS.forEach(settingKeys => {
        let index = settingKeys.indexOf('open-preferences');
        if (index != -1)
           settingKeys.splice(index, 1);
    });
}

const getOthers = function() {
    return [
        [
            [_("Draw"), _("Left click")],
            [_("Menu"), _("Right click")],
            [internalShortcutsSchema.get_key('switch-fill').get_summary(), _("Center click")],
            [_("Increment/decrement line width"), _("Scroll")],
            // Translators: %s are key labels (Ctrl+F1 and Ctrl+F9)
            [_("Select color"), _("%s … %s").format(getKeyLabel('<Primary>1'), getKeyLabel('<Primary>9'))],
            // Translators: %s is a key label
            [_("Ignore pointer movement"), _("%s held").format(getKeyLabel('space'))],
            [_("Leave"), getKeyLabel('Escape')],
        ], [
            [_("Select eraser <span alpha=\"50%\">(while starting drawing)</span>"), getKeyLabel('<Shift>')],
            [_("Duplicate <span alpha=\"50%\">(while starting handling)</span>"), getKeyLabel('<Shift>')],
            [_("Rotate rectangle, polygon, polyline"), getKeyLabel('<Primary>')],
            [_("Extend circle to ellipse"), getKeyLabel('<Primary>')],
            [_("Curve line"), getKeyLabel('<Primary>')],
            [_("Smooth free drawing outline"), getKeyLabel('<Primary>')],
            [_("Rotate <span alpha=\"50%\">(while moving)</span>"), getKeyLabel('<Primary>')],
            [_("Stretch <span alpha=\"50%\">(while resizing)</span>"), getKeyLabel('<Primary>')],
            [_("Inverse <span alpha=\"50%\">(while mirroring)</span>"), getKeyLabel('<Primary>')],
        ],
    ];
};

let _OTHERS;
// Equivalent to "var OTHERS = [[ ... ]]", but as a getter so the translations are got after the initTranslations call.
// 'this' is the module.
Object.defineProperty(this, 'OTHERS', {
    get: function() {
        if (!_OTHERS)
            _OTHERS = getOthers();
        return _OTHERS;
    }
});

