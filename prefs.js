/* jslint esversion: 6 */
/* exported GLOBAL_KEYBINDINGS, INTERNAL_KEYBINDINGS, OTHER_SHORTCUTS, init, buildPrefsWidget */

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

const Atk = imports.gi.Atk;
const Gdk = imports.gi.Gdk;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = ExtensionUtils.getSettings && ExtensionUtils.initTranslations ? ExtensionUtils : Me.imports.convenience;
const gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const _ = function(string) {
    if (!string)
        return "";
    return gettext(string);
};
const _GTK = imports.gettext.domain('gtk30').gettext;

const GS_VERSION = Config.PACKAGE_VERSION;
const MARGIN = 10;
const ROWBOX_MARGIN_PARAMS = { margin_top: MARGIN / 2, margin_bottom: MARGIN / 2, margin_left: MARGIN, margin_right: MARGIN };

var GLOBAL_KEYBINDINGS = ['toggle-drawing', 'toggle-modal', 'erase-drawings'];
var INTERNAL_KEYBINDINGS = [
    ['undo', 'undo', 'delete-last-element', 'smooth-last-element'],
    ['select-none-shape', 'select-line-shape', 'select-ellipse-shape', 'select-rectangle-shape', 'select-polygon-shape', 'select-polyline-shape',
     'select-text-shape', 'select-image-shape', 'select-move-tool', 'select-resize-tool', 'select-mirror-tool'],
    ['switch-fill', 'switch-fill-rule', 'switch-color-palette', 'switch-color-palette-reverse'],
    ['increment-line-width', 'decrement-line-width', 'increment-line-width-more', 'decrement-line-width-more',
     'switch-linejoin', 'switch-linecap', 'switch-dash'],
    ['switch-font-family', 'switch-font-family-reverse', 'switch-font-weight', 'switch-font-style', 'switch-text-alignment', 'switch-image-file'],
    ['toggle-panel-and-dock-visibility', 'toggle-background', 'toggle-grid', 'toggle-square-area'],
    ['open-previous-json', 'open-next-json', 'save-as-json', 'save-as-svg', 'open-preferences', 'toggle-help']
];

if (GS_VERSION < '3.36')
    delete INTERNAL_KEYBINDINGS[INTERNAL_KEYBINDINGS.length - 1]['open-preferences'];

const getKeyLabel = function(accel) {
    let [keyval, mods] = Gtk.accelerator_parse(accel);
    return Gtk.accelerator_get_label(keyval, mods);
};

var OTHER_SHORTCUTS = [{
    get "Draw"() { return _("Left click"); },
    get "Menu"() { return _("Right click"); },
    get "Toggle fill/outline"() { return _("Center click"); },
    get "Increment/decrement line width"() { return _("Scroll"); },
    get "Select color"() { return _("%s … %s").format(getKeyLabel('<Primary>1'), getKeyLabel('<Primary>9')); },
    get "Ignore pointer movement"() { return _("%s held").format(getKeyLabel('space')); },
    "Leave": getKeyLabel('Escape'),
    }, {
    "Select eraser <span alpha=\"50%\">(while starting drawing)</span>": getKeyLabel('<Shift>'),
    "Duplicate <span alpha=\"50%\">(while starting handling)</span>": getKeyLabel('<Shift>'),
    "Rotate rectangle, polygon, polyline": getKeyLabel('<Primary>'),
    "Extend circle to ellipse": getKeyLabel('<Primary>'),
    "Curve line": getKeyLabel('<Primary>'),
    "Smooth free drawing outline": getKeyLabel('<Primary>'),
    "Rotate <span alpha=\"50%\">(while moving)</span>": getKeyLabel('<Primary>'),
    "Stretch <span alpha=\"50%\">(while resizing)</span>": getKeyLabel('<Primary>'),
    "Inverse <span alpha=\"50%\">(while mirroring)</span>": getKeyLabel('<Primary>'),
}];

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let topStack = new TopStack();
    let switcher = new Gtk.StackSwitcher({halign: Gtk.Align.CENTER, visible: true, stack: topStack});
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        let window = topStack.get_toplevel();
        let headerBar = window.get_titlebar();
        headerBar.custom_title = switcher;
        return false;
    });
    
    topStack.show_all();
    return topStack;
}

const TopStack = new GObject.Class({
    Name: 'DrawOnYourScreenTopStack',
    GTypeName: 'DrawOnYourScreenTopStack',
    Extends: Gtk.Stack,
    
    _init: function(params) {
        this.parent({ transition_type: 1, transition_duration: 500, expand: true });
        this.prefsPage = new PrefsPage();
        this.add_titled(this.prefsPage, 'prefs', _("Preferences"));
        this.drawingPage = new DrawingPage();
        this.add_titled(this.drawingPage, 'drawing', _("Drawing"));
        this.aboutPage = new AboutPage();
        this.add_titled(this.aboutPage, 'about', _("About"));
    }
});

const AboutPage = new GObject.Class({
    Name: 'DrawOnYourScreenAboutPage',
    GTypeName: 'DrawOnYourScreenAboutPage',
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent({ hscrollbar_policy: Gtk.PolicyType.NEVER });

        let vbox= new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin: MARGIN * 3 });
        this.add(vbox);
        
        let name = "<b> " + _(Me.metadata.name) + "</b>";
        let version = _("Version %d").format(Me.metadata.version);
        let description = _(Me.metadata.description);
        let link = "<span><a href=\"" + Me.metadata.url + "\">" + Me.metadata.url + "</a></span>";
        let licenceName = _GTK("GNU General Public License, version 2 or later");
        let licenceLink = "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html";
        let licence = "<small>" + _GTK("This program comes with absolutely no warranty.\nSee the <a href=\"%s\">%s</a> for details.").format(licenceLink, licenceName) + "</small>";
        
        let aboutLabel = new Gtk.Label({ wrap: true, justify: 2, use_markup: true, label:
            name + "\n\n" + version + "\n\n" + description + "\n\n" + link + "\n\n" + licence + "\n" });
        
        vbox.add(aboutLabel);
        
        let creditBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin: 2 * MARGIN });
        let leftBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let rightBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let leftLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 2, justify: 1, use_markup: true, label: "<small>" + _GTK("Created by") + "</small>" });
        let rightLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 1, justify: 0, use_markup: true, label: "<small><a href=\"https://framagit.org/abakkk\">Abakkk</a></small>" });
        leftBox.pack_start(leftLabel, false, false, 0);
        rightBox.pack_start(rightLabel, false, false, 0);
        creditBox.pack_start(leftBox, true, true, 5);
        creditBox.pack_start(rightBox, true, true, 5);
        vbox.add(creditBox);
        
        if (_("translator-credits") != "translator-credits" && _("translator-credits") != "") {
            leftBox.pack_start(new Gtk.Label(), false, false, 0);
            rightBox.pack_start(new Gtk.Label(), false, false, 0);
            leftLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 2, justify: 1, use_markup: true, label: "<small>" + _GTK("Translated by") + "</small>" });
            rightLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 1, justify: 0, use_markup: true, label: "<small>" + _("translator-credits") + "</small>" });
            leftBox.pack_start(leftLabel, false, false, 0);
            rightBox.pack_start(rightLabel, false, false, 0);
        }
    }
    
});

const DrawingPage = new GObject.Class({
    Name: 'DrawOnYourScreenDrawingPage',
    GTypeName: 'DrawOnYourScreenDrawingPage',
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent({ hscrollbar_policy: Gtk.PolicyType.NEVER });

        this.settings = Convenience.getSettings(Me.metadata['settings-schema'] + '.drawing');
        this.schema = this.settings.settings_schema;
        
        let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin: 3 * MARGIN, spacing: 3 * MARGIN });
        this.add(box);
        
        let palettesFrame = new Frame({ label: _("Palettes") });
        box.add(palettesFrame);
        
        let palettesScrolledWindow = new Gtk.ScrolledWindow({ vscrollbar_policy: Gtk.PolicyType.NEVER, margin_top: MARGIN / 2, margin_bottom: MARGIN / 2 });
        palettesFrame.add(palettesScrolledWindow);
        this.palettesListBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true });
        this.palettesListBox.get_style_context().add_class('background');
        this.palettesListBox.get_accessible().set_name(this.schema.get_key('palettes').get_summary());
        this.palettesListBox.get_accessible().set_description(this.schema.get_key('palettes').get_description());
        palettesScrolledWindow.add(this.palettesListBox);
        
        this.settings.connect('changed::palettes', this._updatePalettes.bind(this));
        this._updatePalettes();
        
        this.addBox = new Gtk.Box(ROWBOX_MARGIN_PARAMS);
        let addButton = Gtk.Button.new_from_icon_name('list-add-symbolic', Gtk.IconSize.BUTTON);
        addButton.set_tooltip_text(_("Add a new palette"));
        this.addBox.pack_start(addButton, true, true, 4);
        addButton.connect('clicked', this._addNewPalette.bind(this));
        this.palettesListBox.add(this.addBox);
        this.addBox.get_parent().set_activatable(false);
        
        let areaFrame = new Frame({ label: _("Area") });
        box.add(areaFrame);
        
        let areaListBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true, margin_top: MARGIN / 2, margin_bottom: MARGIN / 2 });
        areaListBox.get_style_context().add_class('background');
        areaFrame.add(areaListBox);
        
        let squareAreaRow = new PrefRow({ label: this.schema.get_key('square-area-size').get_summary() });
        let squareAreaAutoButton = new Gtk.CheckButton({ label: _("Auto"),
                                                         name: this.schema.get_key('square-area-auto').get_summary(),
                                                         tooltip_text: this.schema.get_key('square-area-auto').get_description() });
        let squareAreaSizeButton = new PixelSpinButton({ width_chars: 5, digits: 0,
                                                         adjustment: Gtk.Adjustment.new(0, 64, 32768, 1, 10, 0),
                                                         name: this.schema.get_key('square-area-size').get_summary(),
                                                         tooltip_text: this.schema.get_key('square-area-size').get_description() });
        this.settings.bind('square-area-auto', squareAreaAutoButton, 'active', 0);
        this.settings.bind('square-area-size', squareAreaSizeButton, 'value', 0);
        squareAreaAutoButton.bind_property('active', squareAreaSizeButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);
        squareAreaRow.addWidget(squareAreaAutoButton);
        squareAreaRow.addWidget(squareAreaSizeButton);
        areaListBox.add(squareAreaRow);
        
        let backgroundColorRow = new PrefRow({ label: this.schema.get_key('background-color').get_summary() });
        let backgroundColorButton = new ColorStringButton({ use_alpha: true, show_editor: true,
                                                            name: this.schema.get_key('background-color').get_summary(),
                                                            tooltip_text: this.schema.get_key('background-color').get_description() });
        this.settings.bind('background-color', backgroundColorButton, 'color-string', 0);
        backgroundColorRow.addWidget(backgroundColorButton);
        areaListBox.add(backgroundColorRow);
        
        let gridLineRow = new PrefRow({ label: _("Grid overlay line") });
        let gridLineAutoButton = new Gtk.CheckButton({ label: _("Auto"),
                                                       name: this.schema.get_key('grid-line-auto').get_summary(),
                                                       tooltip_text: this.schema.get_key('grid-line-auto').get_description() });
        let gridLineWidthButton = new PixelSpinButton({ width_chars: 5, digits: 1,
                                                        adjustment: Gtk.Adjustment.new(0, 0.1, 10, 0.1, 1, 0),
                                                        name: this.schema.get_key('grid-line-width').get_summary(),
                                                        tooltip_text: this.schema.get_key('grid-line-width').get_description() });
        let gridLineSpacingButton = new PixelSpinButton({ width_chars: 5, digits: 1,
                                                          adjustment: Gtk.Adjustment.new(0, 1, 16384, 1, 10, 0),
                                                          name: this.schema.get_key('grid-line-spacing').get_summary(),
                                                          tooltip_text: this.schema.get_key('grid-line-spacing').get_description() });
        this.settings.bind('grid-line-auto', gridLineAutoButton, 'active', 0);
        this.settings.bind('grid-line-width', gridLineWidthButton, 'value', 0);
        this.settings.bind('grid-line-spacing', gridLineSpacingButton, 'value', 0);
        gridLineAutoButton.bind_property('active', gridLineWidthButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);
        gridLineAutoButton.bind_property('active', gridLineSpacingButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);
        gridLineRow.addWidget(gridLineAutoButton);
        gridLineRow.addWidget(gridLineWidthButton);
        gridLineRow.addWidget(gridLineSpacingButton);
        areaListBox.add(gridLineRow);
        
        let gridColorRow = new PrefRow({ label: this.schema.get_key('grid-color').get_summary() });
        let gridColorButton = new ColorStringButton({ use_alpha: true, show_editor: true,
                                                      name: this.schema.get_key('grid-color').get_summary(),
                                                      tooltip_text: this.schema.get_key('grid-color').get_description() });
        this.settings.bind('grid-color', gridColorButton, 'color-string', 0);
        gridColorRow.addWidget(gridColorButton);
        areaListBox.add(gridColorRow);
        
        let toolsFrame = new Frame({ label: _("Tools") });
        box.add(toolsFrame);
        
        let toolsListBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true, margin_top: MARGIN / 2, margin_bottom: MARGIN / 2 });
        toolsListBox.get_style_context().add_class('background');
        toolsFrame.add(toolsListBox);
        
        let dashArrayRow = new PrefRow({ label: _("Dash array") });
        let dashArrayAutoButton = new Gtk.CheckButton({ label: _("Auto"),
                                                        name: this.schema.get_key('dash-array-auto').get_summary(),
                                                        tooltip_text: this.schema.get_key('dash-array-auto').get_description() });
        let dashArrayOnButton = new PixelSpinButton({ width_chars: 5, digits: 1,
                                                      adjustment: Gtk.Adjustment.new(0, 0, 16384, 0.1, 1, 0),
                                                      name: this.schema.get_key('dash-array-on').get_summary(),
                                                      tooltip_text: this.schema.get_key('dash-array-on').get_description() });
        let dashArrayOffButton = new PixelSpinButton({ width_chars: 5, digits: 1,
                                                       adjustment: Gtk.Adjustment.new(0, 0, 16384, 0.1, 1, 0),
                                                       name: this.schema.get_key('dash-array-off').get_summary(),
                                                       tooltip_text: this.schema.get_key('dash-array-off').get_description() });
        this.settings.bind('dash-array-auto', dashArrayAutoButton, 'active', 0);
        this.settings.bind('dash-array-on', dashArrayOnButton, 'value', 0);
        this.settings.bind('dash-array-off', dashArrayOffButton, 'value', 0);
        dashArrayAutoButton.bind_property('active', dashArrayOnButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);
        dashArrayAutoButton.bind_property('active', dashArrayOffButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);
        dashArrayRow.addWidget(dashArrayAutoButton);
        dashArrayRow.addWidget(dashArrayOnButton);
        dashArrayRow.addWidget(dashArrayOffButton);
        toolsListBox.add(dashArrayRow);
        
        let dashOffsetRow = new PrefRow({ label: this.schema.get_key('dash-offset').get_summary() });
        let dashOffsetButton = new PixelSpinButton({ width_chars: 5, digits: 1,
                                                     adjustment: Gtk.Adjustment.new(0, -16384, 16384, 0.1, 1, 0),
                                                     name: this.schema.get_key('dash-offset').get_summary(),
                                                     tooltip_text: this.schema.get_key('dash-offset').get_description() });
        this.settings.bind('dash-offset', dashOffsetButton, 'value', 0);
        dashOffsetRow.addWidget(dashOffsetButton);
        toolsListBox.add(dashOffsetRow);
    },
    
    _updatePalettes: function() {
        this.palettes = this.settings.get_value('palettes').deep_unpack();
        this.palettesListBox.get_children().filter(row=> row.get_child() != this.addBox)
                                           .slice(this.palettes.length)
                                           .forEach(row => this.palettesListBox.remove(row));
        let paletteBoxes = this.palettesListBox.get_children().map(row => row.get_child()).filter(child => child != this.addBox);
        
        this.palettes.forEach((palette, paletteIndex) => {
            let [name, colors] = palette;
            let paletteBox;
            
            if (paletteBoxes[paletteIndex]) {
                paletteBox = paletteBoxes[paletteIndex];
                let nameEntry = paletteBox.get_children()[0];
                if (nameEntry.get_text() !== _(name)) {
                    GObject.signal_handler_block(nameEntry, nameEntry.paletteNameChangedHandler);
                    nameEntry.set_text(_(name));
                    GObject.signal_handler_unblock(nameEntry, nameEntry.paletteNameChangedHandler);
                }
            } else {
                let nameEntry = new Gtk.Entry({ text: name, halign: Gtk.Align.START, tooltip_text: _("Rename the palette") });
                nameEntry.paletteNameChangedHandler = nameEntry.connect('changed', this._onPaletteNameChanged.bind(this, paletteIndex));
                let removeButton = Gtk.Button.new_from_icon_name('list-remove-symbolic', Gtk.IconSize.BUTTON);
                removeButton.set_tooltip_text(_("Remove the palette")); 
                removeButton.connect('clicked', this._removePalette.bind(this, paletteIndex));
                paletteBox = new Gtk.Box(ROWBOX_MARGIN_PARAMS);
                paletteBox.pack_start(nameEntry, true, true, 4);
                paletteBox.pack_start(new Gtk.Box({ spacing: 4 }), false, false, 4);
                paletteBox.pack_start(removeButton, false, false, 4);
                this.palettesListBox.insert(paletteBox, paletteIndex);
                paletteBox.get_parent().set_activatable(false);
            }
            
            colors.splice(9);
            while (colors.length < 9)
                colors.push('transparent');
            
            let colorsBox = paletteBox.get_children()[1];
            let colorButtons = colorsBox.get_children();
            colors.forEach((color, colorIndex) => {
                if (colorButtons[colorIndex]) {
                    colorButtons[colorIndex].color_string = color;
                } else {
                    let colorButton = new ColorStringButton({ color_string: color, use_alpha: true, show_editor: true, halign: Gtk.Align.START, hexpand: false });
                    colorButton.connect('notify::color-string', this._onPaletteColorChanged.bind(this, paletteIndex, colorIndex));
                    colorsBox.add(colorButton);
                }
            });
            
            paletteBox.show_all();
        });
    },
    
    _savePalettes: function() {
        this.settings.set_value('palettes', new GLib.Variant('a(sas)', this.palettes));
    },
    
    _onPaletteNameChanged: function(index, entry) {
        this.palettes[index][0] = entry.get_text();
        this._savePalettes();
    },
    
    _onPaletteColorChanged: function(paletteIndex, colorIndex, colorButton) {
        this.palettes[paletteIndex][1][colorIndex] = colorButton.get_rgba().to_string();
        this._savePalettes();
    },
    
    _addNewPalette: function() {
        let colors = Array(9).fill('Black');
        this.palettes.push([_("New palette"), colors]);
        this._savePalettes();
    },
    
    _removePalette: function(paletteIndex) {
        this.palettes.splice(paletteIndex, 1);
        this._savePalettes();
    }
});

const PrefsPage = new GObject.Class({
    Name: 'DrawOnYourScreenPrefsPage',
    GTypeName: 'DrawOnYourScreenPrefsPage',
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent({ hscrollbar_policy: Gtk.PolicyType.NEVER });

        let settings = Convenience.getSettings();
        let schema = settings.settings_schema;
        let internalShortcutSettings = Convenience.getSettings(Me.metadata['settings-schema'] + '.internal-shortcuts');
        
        let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin: MARGIN * 3, spacing: 3 * MARGIN });
        this.add(box);
        
        let globalFrame = new Frame({ label: _("Global") });
        box.add(globalFrame);
        
        let listBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true, margin_top: MARGIN / 2, margin_bottom: MARGIN / 2 });
        listBox.get_style_context().add_class('background');
        globalFrame.add(listBox);
        
        let globalKeybindingsRow = new Gtk.ListBoxRow({ activatable: false });
        let globalKeybindingsWidget = new KeybindingsWidget(GLOBAL_KEYBINDINGS, settings);
        globalKeybindingsRow.add(globalKeybindingsWidget);
        listBox.add(globalKeybindingsRow);
        
        let persistentKey = schema.get_key('persistent-drawing');
        let persistentRow = new PrefRow({ label: persistentKey.get_summary(), desc: persistentKey.get_description() });
        let persistentSwitch = new Gtk.Switch();
        settings.bind('persistent-drawing', persistentSwitch, 'active', 0);
        persistentRow.addWidget(persistentSwitch, true);
        listBox.add(persistentRow);
        
        let desktopKey = schema.get_key('drawing-on-desktop');
        let desktopRow = new PrefRow({ label: desktopKey.get_summary(), desc: desktopKey.get_description() });
        let desktopSwitch = new Gtk.Switch();
        settings.bind('drawing-on-desktop', desktopSwitch, 'active', 0);
        desktopRow.addWidget(desktopSwitch, true);
        listBox.add(desktopRow);
        
        let osdKey = schema.get_key('osd-disabled');
        let osdRow = new PrefRow({ label: osdKey.get_summary(), desc: osdKey.get_description() });
        let osdSwitch = new Gtk.Switch();
        settings.bind('osd-disabled', osdSwitch, 'active', 0);
        osdRow.addWidget(osdSwitch, true);
        listBox.add(osdRow);
        
        let indicatorKey = schema.get_key('indicator-disabled');
        let indicatorRow = new PrefRow({ label: indicatorKey.get_summary(), desc: indicatorKey.get_description() });
        let indicatorSwitch = new Gtk.Switch();
        settings.bind('indicator-disabled', indicatorSwitch, 'active', 0);
        indicatorRow.addWidget(indicatorSwitch, true);
        listBox.add(indicatorRow);
        
        let internalFrame = new Frame({ label: _("Internal"), desc: _("In drawing mode") });
        box.add(internalFrame);
        
        listBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true, margin_top: MARGIN });
        listBox.get_style_context().add_class('background');
        internalFrame.add(listBox);
        
        OTHER_SHORTCUTS.forEach((object, index) => {
            if (index)
                listBox.add(new Gtk.Box(ROWBOX_MARGIN_PARAMS));
            
            for (let key in object) {
                let otherBox = new Gtk.Box({ margin_left: MARGIN, margin_right: MARGIN });
                let otherLabel = new Gtk.Label({ label: _(key), use_markup: true });
                otherLabel.set_halign(1);
                let otherLabel2 = new Gtk.Label({ label: object[key] });
                otherBox.pack_start(otherLabel, true, true, 4);
                otherBox.pack_start(otherLabel2, false, false, 4);
                listBox.add(otherBox);
            }
        });
        
        listBox.add(new Gtk.Box(ROWBOX_MARGIN_PARAMS));
        
        INTERNAL_KEYBINDINGS.forEach((array, index) => {
            if (index)
                listBox.add(new Gtk.Box(ROWBOX_MARGIN_PARAMS));
            
            let internalKeybindingsWidget = new KeybindingsWidget(array, internalShortcutSettings);
            listBox.add(internalKeybindingsWidget);
        });
        
        let noteBox = new Gtk.Box({ margin: MARGIN });
        let noteLabel = new Gtk.Label({
            wrap: true,
            xalign: 0,
            use_markup: true,
            label: _("When you save elements made with <b>eraser</b> in a <b>SVG</b> file, " +
                     "they are colored with background color, transparent if it is disabled.\n" +
                     "See <i>“%s”</i> or edit the SVG file afterwards.").format(_("Add a drawing background"))
        });
        noteLabel.set_halign(1);
        noteLabel.get_style_context().add_class('dim-label');
        noteBox.pack_start(noteLabel, true, true, 4);
        listBox.add(noteBox);
        
        listBox.get_children().forEach(row => row.set_activatable(false));
    }
});

const Frame = new GObject.Class({
    Name: 'DrawOnYourScreenFrame',
    GTypeName: 'DrawOnYourScreenFrame',
    Extends: Gtk.Frame,

    _init: function(params) {
        let labelWidget = new Gtk.Label({ margin_bottom: MARGIN / 2, use_markup: true, label: `<b><big>${params.label}</big></b>` });
        this.parent({ label_yalign: 1.0, label_widget: labelWidget });
        
        if (params.desc) {
            labelWidget.set_tooltip_text(params.desc);
            this.get_accessible().set_description(params.desc);
        }
    }
});

const PrefRow = new GObject.Class({
    Name: 'DrawOnYourScreenPrefRow',
    GTypeName: 'DrawOnYourScreenPrefRow',
    Extends: Gtk.ListBoxRow,

    _init: function(params) {
        this.parent({ activatable: false });
        
        let hbox = new Gtk.Box(ROWBOX_MARGIN_PARAMS);
        this.add(hbox);
        
        let labelBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        hbox.pack_start(labelBox, true, true, 4);
        
        this.widgetBox = new Gtk.Box({ spacing: 4 });
        hbox.pack_start(this.widgetBox, false, false, 4);
        
        this.label = new Gtk.Label({ use_markup: true, label: params.label, halign: Gtk.Align.START });
        labelBox.pack_start(this.label, true, true, 0);
        if (params.desc) {
            this.desc = new Gtk.Label({ use_markup: true, label: `<small>${params.desc}</small>`, halign: Gtk.Align.START, wrap: true, xalign: 0 });
            this.desc.get_style_context().add_class('dim-label');
            labelBox.pack_start(this.desc, true, true, 0);
            this.widgetBox.set_valign(Gtk.Align.START);
        }
    },
    
    addWidget: function(widget, setRelationship) {
        this.widgetBox.add(widget);
        
        if (widget.name)
            widget.get_accessible().set_name(widget.name);
        
        if (setRelationship) {
            this.label.get_accessible().add_relationship(Atk.RelationType.LABEL_FOR, widget.get_accessible());
            widget.get_accessible().add_relationship(Atk.RelationType.LABELLED_BY, this.label.get_accessible());
            
            if (this.desc) {
                this.desc.get_accessible().add_relationship(Atk.RelationType.DESCRIPTION_FOR, widget.get_accessible());
                widget.get_accessible().add_relationship(Atk.RelationType.DESCRIBED_BY, this.desc.get_accessible());
            }
        }
    }
});

const PixelSpinButton = new GObject.Class({
    Name: 'DrawOnYourScreenPixelSpinButton',
    GTypeName: 'DrawOnYourScreenPixelSpinButton',
    Extends: Gtk.SpinButton,
    
    // Add 'px' unit.
    vfunc_output: function() {
        this.text = _("%d px").format(Math.round(this.value * 100) / 100);
        return true;
    },
    
    // Prevent accidental scrolling.
    vfunc_scroll_event: function(event) {
        return this.has_focus ? this.parent(event) : Gdk.EVENT_PROPAGATE;
    }
});

// A color button that can be easily bound with a color string setting.
const ColorStringButton = new GObject.Class({
    Name: 'DrawOnYourScreenColorStringButton',
    GTypeName: 'DrawOnYourScreenColorStringButton',
    Extends: Gtk.ColorButton,
    Properties: {
        'color-string': GObject.ParamSpec.string('color-string', 'colorString', 'A string that describes the color',
                                                 GObject.ParamFlags.READWRITE,
                                                 'black')
    },
    
    get color_string() {
        return this._color_string || 'black';
    },
    
    set color_string(colorString) {
        this._color_string = colorString;
        
        let newRgba = new Gdk.RGBA();
        newRgba.parse(colorString);
        this.set_rgba(newRgba);
    },
    
    // Do nothing if the new color is equivalent to the old color (e.g. "black" and "rgb(0,0,0)").
    vfunc_color_set(args) {
        let oldRgba = new Gdk.RGBA();
        oldRgba.parse(this.color_string);
        
        if (!this.rgba.equal(oldRgba)) {
            this._color_string = this.rgba.to_string();
            this.notify('color-string');
        }            
    }
});

// this code comes from Sticky Notes View by Sam Bull, https://extensions.gnome.org/extension/568/notes/
const KeybindingsWidget = new GObject.Class({
    Name: 'DrawOnYourScreenKeybindings.Widget',
    GTypeName: 'DrawOnYourScreenKeybindingsWidget',
    Extends: Gtk.Box,

    _init: function(keybindings, settings) {
        this.parent(ROWBOX_MARGIN_PARAMS);
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this._keybindings = keybindings;
        this._settings = settings;

        this._columns = {
            NAME: 0,
            ACCEL_NAME: 1,
            MODS: 2,
            KEY: 3
        };

        this._store = new Gtk.ListStore();
        this._store.set_column_types([
            GObject.TYPE_STRING,
            GObject.TYPE_STRING,
            GObject.TYPE_INT,
            GObject.TYPE_INT
        ]);

        this._tree_view = new Gtk.TreeView({
            model: this._store,
            hexpand: false,
            vexpand: false
        });
        this._tree_view.set_activate_on_single_click(false);
        this._tree_view.get_selection().set_mode(Gtk.SelectionMode.SINGLE);

        let action_renderer = new Gtk.CellRendererText();
        let action_column = new Gtk.TreeViewColumn({
            title: "",
            expand: true,
        });
        action_column.pack_start(action_renderer, true);
        action_column.add_attribute(action_renderer, 'text', 1);
        this._tree_view.append_column(action_column);
               
        let keybinding_renderer = new Gtk.CellRendererAccel({
            editable: true,
            accel_mode: Gtk.CellRendererAccelMode.GTK,
            xalign: 1
        });
        keybinding_renderer.connect('accel-edited', (renderer, iter, key, mods) => {
            let value = Gtk.accelerator_name(key, mods);
            let [success, iterator ] =
                this._store.get_iter_from_string(iter);

            if(!success) {
                printerr("Can't change keybinding");
            }

            let name = this._store.get_value(iterator, 0);

            this._store.set(
                iterator,
                [this._columns.MODS, this._columns.KEY],
                [mods, key]
            );
            this._settings.set_strv(name, [value]);
        });

        let keybinding_column = new Gtk.TreeViewColumn({
            title: "",
        });
        keybinding_column.pack_end(keybinding_renderer, false);
        keybinding_column.add_attribute(
            keybinding_renderer,
            'accel-mods',
            this._columns.MODS
        );
        keybinding_column.add_attribute(
            keybinding_renderer,
            'accel-key',
            this._columns.KEY
        );
        this._tree_view.append_column(keybinding_column);
        this._tree_view.columns_autosize();
        this._tree_view.set_headers_visible(false);

        this.add(this._tree_view);
        this.keybinding_column = keybinding_column;
        this.action_column = action_column;

        this._refresh();
    },

    _refresh: function() {
        this._store.clear();

        for(let settings_key of this._keybindings) {
            let [key, mods] = Gtk.accelerator_parse(
                this._settings.get_strv(settings_key)[0]
            );

            let iter = this._store.append();
            this._store.set(iter,
                [
                    this._columns.NAME,
                    this._columns.ACCEL_NAME,
                    this._columns.MODS,
                    this._columns.KEY
                ],
                [
                    settings_key,
                    this._settings.settings_schema.get_key(settings_key).get_summary(),
                    mods,
                    key
                ]
            );
        }
    }
});
