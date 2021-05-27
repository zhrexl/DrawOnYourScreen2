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

/* jslint esversion: 6 */
/* exported init, buildPrefsWidget */

const Gdk = imports.gi.Gdk;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const IS_GTK3 = Gtk.get_major_version() == 3;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = ExtensionUtils.getSettings && ExtensionUtils.initTranslations ? ExtensionUtils : Me.imports.convenience;
const GimpPaletteParser = Me.imports.gimpPaletteParser;
const Shortcuts = Me.imports.shortcuts;
const gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const _ = function(string) {
    if (!string)
        return "";
    return gettext(string);
};
const _GTK = imports.gettext.domain(IS_GTK3 ? 'gtk30' : 'gtk40').gettext;

const MARGIN = 10;
const ROWBOX_MARGIN_PARAMS = { margin_top: MARGIN / 2, margin_bottom: MARGIN / 2, margin_start: MARGIN, margin_end: MARGIN, spacing: 4 };
const UUID = Me.uuid.replace(/@/gi, '_at_').replace(/[^a-z0-9+_-]/gi, '_');

if (IS_GTK3) {
    Gtk.Container.prototype.append = Gtk.Container.prototype.add;
    Gtk.Bin.prototype.set_child = Gtk.Container.prototype.add;
}

const setAccessibleLabel = function(widget, label) {
    if (IS_GTK3)
        widget.get_accessible().set_name(label);
    else
        widget.update_property([Gtk.AccessibleProperty.LABEL], [label]);
};

const setAccessibleDescription = function(widget, description) {
    if (IS_GTK3)
        widget.get_accessible().set_description(description);
    else
        widget.update_property([Gtk.AccessibleProperty.DESCRIPTION], [description]);
};

const getChildrenOf = function(widget) {
    if (IS_GTK3)
        return widget.get_children();
    else
        return [...widget];
};

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let topStack = new TopStack();
    let switcher = new Gtk.StackSwitcher({ halign: Gtk.Align.CENTER, visible: true, stack: topStack });
    
    GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
        if (IS_GTK3)
            topStack.get_toplevel().get_titlebar().set_custom_title(switcher);
        else
            topStack.get_root().get_titlebar().set_title_widget(switcher);
        
        return GLib.SOURCE_REMOVE;
    });
    
    if (IS_GTK3)
        topStack.show_all();
    return topStack;
}

const TopStack = new GObject.Class({
    Name: `${UUID}-TopStack`,
    Extends: Gtk.Stack,
    
    _init: function(params) {
        this.parent({ transition_type: Gtk.StackTransitionType.CROSSFADE, transition_duration: 500, hexpand: true, vexpand: true });
        
        this.prefsPage = new PrefsPage();
        // Translators: "Preferences" page in preferences
        this.add_titled(this.prefsPage, 'prefs', _("Preferences"));
        this.drawingPage = new DrawingPage();
        // Translators: "Drawing" page in preferences
        this.add_titled(this.drawingPage, 'drawing', _("Drawing"));
        this.aboutPage = new AboutPage();
        // Translators: "About" page in preferences
        this.add_titled(this.aboutPage, 'about', _("About"));
    }
});

const AboutPage = new GObject.Class({
    Name: `${UUID}-AboutPage`,
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent({ hscrollbar_policy: Gtk.PolicyType.NEVER });

        let vbox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin_top: 3 * MARGIN, margin_bottom: 3 * MARGIN, margin_start: 3 * MARGIN, margin_end: 3 * MARGIN });
        this.set_child(vbox);
        
        // Translators: you are free to translate the extension name, that is displayed in About page, or not
        let name = "<b> " + _("Draw On You Screen") + "</b>";
        // Translators: version number in "About" page
        let version = _("Version %f").format(Me.metadata.version);
        // Translators: you are free to translate the extension description, that is displayed in About page, or not
        let description = _("Start drawing with Super+Alt+D and save your beautiful work by taking a screenshot");
        let link = "<span><a href=\"" + Me.metadata.url + "\">" + Me.metadata.url + "</a></span>";
        let licenseName = _GTK("GNU General Public License, version 3 or later");
        let licenseLink = "https://www.gnu.org/licenses/gpl-3.0.html";
        let license = "<small>" + _GTK("This program comes with absolutely no warranty.\nSee the <a href=\"%s\">%s</a> for details.").format(licenseLink, licenseName) + "</small>";
        
        let aboutLabel = new Gtk.Label({ wrap: true, justify: Gtk.Justification.CENTER, use_markup: true, label:
            name + "\n\n" + version + "\n\n" + description + "\n\n" + link + "\n\n" + license + "\n" });
        
        vbox.append(aboutLabel);
        
        let creditBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin_top: 2 * MARGIN, margin_bottom: 2 * MARGIN, margin_start: 2 * MARGIN, margin_end: 2 * MARGIN, spacing: 5 });
        let leftBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
        let rightBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
        leftBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.END, justify: Gtk.Justification.RIGHT,
                                       use_markup: true, label: "<small>" + _GTK("Created by") + "</small>" }));
        rightBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.START, justify: Gtk.Justification.LEFT,
                                        use_markup: true, label: "<small><a href=\"https://framagit.org/abakkk\">Abakkk</a></small>" }));
        creditBox.append(leftBox);
        creditBox.append(rightBox);
        vbox.append(creditBox);
        
        // Translators: add your name here or keep it empty, it will be displayed in about page, e.g.
        // msgstr ""
        // "translator1\n"
        // "<a href=\"mailto:translator2@mail.org\">translator2</a>\n"
        // "<a href=\"https://...\">translator3</a>"
        if (_("translator-credits") != "translator-credits" && _("translator-credits") != "") {
            leftBox.append(new Gtk.Label());
            rightBox.append(new Gtk.Label());
            leftBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.END, justify: 1, use_markup: true, label: "<small>" + _GTK("Translated by") + "</small>" }));
            rightBox.append(new Gtk.Label({ wrap: true, valign: Gtk.Align.START, halign: Gtk.Align.START, justify: 0, use_markup: true, label: "<small>" + _("translator-credits") + "</small>" }));
        }
    }
});

const DrawingPage = new GObject.Class({
    Name: `${UUID}-DrawingPage`,
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent({ hscrollbar_policy: Gtk.PolicyType.NEVER });

        this.settings = Convenience.getSettings(Me.metadata['settings-schema'] + '.drawing');
        this.schema = this.settings.settings_schema;
        
        let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin_top: 3 * MARGIN, margin_bottom: 3 * MARGIN, margin_start: 3 * MARGIN, margin_end: 3 * MARGIN, spacing: 3 * MARGIN });
        this.set_child(box);
        
        let palettesFrame = new Frame({ label: _("Palettes") });
        box.append(palettesFrame);
        let palettesFrameBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        palettesFrame.set_child(palettesFrameBox);
        
        let palettesScrolledWindow = new Gtk.ScrolledWindow({ vscrollbar_policy: Gtk.PolicyType.NEVER });
        palettesFrameBox.append(palettesScrolledWindow);
        this.palettesListBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true });
        this.palettesListBox.get_style_context().add_class('background');
        setAccessibleLabel(this.palettesListBox, this.schema.get_key('palettes').get_summary());
        setAccessibleDescription(this.palettesListBox, this.schema.get_key('palettes').get_description());
        palettesScrolledWindow.set_child(this.palettesListBox);
        palettesScrolledWindow.get_child().set_margin_top(MARGIN / 2);
        palettesScrolledWindow.get_child().set_margin_bottom(MARGIN / 2);
        
        this.settings.connect('changed::palettes', this._updatePalettes.bind(this));
        this._updatePalettes();
        
        let addBox = new Gtk.Box(ROWBOX_MARGIN_PARAMS);
        let addButton = IS_GTK3 ? Gtk.Button.new_from_icon_name('list-add-symbolic', Gtk.IconSize.BUTTON) : Gtk.Button.new_from_icon_name('list-add-symbolic');
        addButton.set_tooltip_text(_("Add a new palette"));
        addButton.set_hexpand(true);
        addBox.append(addButton);
        addButton.connect('clicked', this._addNewPalette.bind(this));
        let importButton = IS_GTK3 ?  Gtk.Button.new_from_icon_name('document-open-symbolic', Gtk.IconSize.BUTTON) : Gtk.Button.new_from_icon_name('document-open-symbolic');
        importButton.set_tooltip_text(_GTK("Select a File"));
        importButton.set_hexpand(true);
        addBox.append(importButton);
        importButton.connect('clicked', this._importPalette.bind(this));
        palettesFrameBox.append(addBox);
        
        let areaFrame = new Frame({ label: _("Area") });
        box.append(areaFrame);
        
        let areaListBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true, margin_top: MARGIN / 2, margin_bottom: MARGIN / 2 });
        areaListBox.get_style_context().add_class('background');
        areaFrame.set_child(areaListBox);
        
        let squareAreaRow = new PrefRow({ label: this.schema.get_key('square-area-size').get_summary() });
        let squareAreaAutoButton = new Gtk.CheckButton({ label: _("Auto"),
                                                         name: this.schema.get_key('square-area-auto').get_summary(),
                                                         tooltip_text: this.schema.get_key('square-area-auto').get_description() });
        let squareAreaSizeButton = new PixelSpinButton({ width_chars: 5, digits: 0, step: 1,
                                                         range: this.schema.get_key('square-area-size').get_range(),
                                                         name: this.schema.get_key('square-area-size').get_summary(),
                                                         tooltip_text: this.schema.get_key('square-area-size').get_description() });
        this.settings.bind('square-area-auto', squareAreaAutoButton, 'active', 0);
        this.settings.bind('square-area-size', squareAreaSizeButton, 'value', 0);
        squareAreaAutoButton.bind_property('active', squareAreaSizeButton, 'sensitive', GObject.BindingFlags.SYNC_CREATE | GObject.BindingFlags.INVERT_BOOLEAN);
        squareAreaRow.addWidget(squareAreaAutoButton);
        squareAreaRow.addWidget(squareAreaSizeButton);
        areaListBox.insert(squareAreaRow, -1);
        
        let backgroundColorRow = new PrefRow({ label: this.schema.get_key('background-color').get_summary() });
        let backgroundColorButton = new ColorStringButton({ use_alpha: true, show_editor: true,
                                                            name: this.schema.get_key('background-color').get_summary(),
                                                            tooltip_text: this.schema.get_key('background-color').get_description() });
        this.settings.bind('background-color', backgroundColorButton, 'color-string', 0);
        backgroundColorRow.addWidget(backgroundColorButton);
        areaListBox.insert(backgroundColorRow, -1);
        
        let gridLineRow = new PrefRow({ label: _("Grid overlay line") });
        let gridLineAutoButton = new Gtk.CheckButton({ label: _("Auto"),
                                                       name: this.schema.get_key('grid-line-auto').get_summary(),
                                                       tooltip_text: this.schema.get_key('grid-line-auto').get_description() });
        let gridLineWidthButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 0.1,
                                                        range: this.schema.get_key('grid-line-width').get_range(),
                                                        name: this.schema.get_key('grid-line-width').get_summary(),
                                                        tooltip_text: this.schema.get_key('grid-line-width').get_description() });
        let gridLineSpacingButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 1,
                                                          range: this.schema.get_key('grid-line-spacing').get_range(),
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
        areaListBox.insert(gridLineRow, -1);
        
        let gridColorRow = new PrefRow({ label: this.schema.get_key('grid-color').get_summary() });
        let gridColorButton = new ColorStringButton({ use_alpha: true, show_editor: true,
                                                      name: this.schema.get_key('grid-color').get_summary(),
                                                      tooltip_text: this.schema.get_key('grid-color').get_description() });
        this.settings.bind('grid-color', gridColorButton, 'color-string', 0);
        gridColorRow.addWidget(gridColorButton);
        areaListBox.insert(gridColorRow, -1);
        
        let toolsFrame = new Frame({ label: _("Tools") });
        box.append(toolsFrame);
        
        let toolsListBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true, margin_top: MARGIN / 2, margin_bottom: MARGIN / 2 });
        toolsListBox.get_style_context().add_class('background');
        toolsFrame.set_child(toolsListBox);
        
        let dashArrayRow = new PrefRow({ label: _("Dash array") });
        let dashArrayAutoButton = new Gtk.CheckButton({ label: _("Auto"),
                                                        name: this.schema.get_key('dash-array-auto').get_summary(),
                                                        tooltip_text: this.schema.get_key('dash-array-auto').get_description() });
        let dashArrayOnButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 0.1,
                                                      range: this.schema.get_key('dash-array-on').get_range(),
                                                      name: this.schema.get_key('dash-array-on').get_summary(),
                                                      tooltip_text: this.schema.get_key('dash-array-on').get_description() });
        let dashArrayOffButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 0.1,
                                                       range: this.schema.get_key('dash-array-off').get_range(),
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
        toolsListBox.insert(dashArrayRow, -1);
        
        let dashOffsetRow = new PrefRow({ label: this.schema.get_key('dash-offset').get_summary() });
        let dashOffsetButton = new PixelSpinButton({ width_chars: 5, digits: 1, step: 0.1,
                                                     range: this.schema.get_key('dash-offset').get_range(),
                                                     name: this.schema.get_key('dash-offset').get_summary(),
                                                     tooltip_text: this.schema.get_key('dash-offset').get_description() });
        this.settings.bind('dash-offset', dashOffsetButton, 'value', 0);
        dashOffsetRow.addWidget(dashOffsetButton);
        toolsListBox.insert(dashOffsetRow, -1);
        
        let imageLocationRow = new PrefRow({ label: this.schema.get_key('image-location').get_summary() });
        let imageLocationButton = new FileChooserButton({ action: Gtk.FileChooserAction.SELECT_FOLDER,
                                                          name: this.schema.get_key('image-location').get_summary(),
                                                          tooltip_text: this.schema.get_key('image-location').get_description() });
        this.settings.bind('image-location', imageLocationButton, 'location', 0);
        imageLocationRow.addWidget(imageLocationButton);
        toolsListBox.insert(imageLocationRow, -1);
        
        let resetButton = new Gtk.Button({ label: _("Reset settings"), halign: Gtk.Align.CENTER });
        resetButton.get_style_context().add_class('destructive-action');
        resetButton.connect('clicked', () => this.schema.list_keys().forEach(key => this.settings.reset(key)));
        box.append(resetButton);
    },
    
    _updatePalettes: function() {
        this.palettes = this.settings.get_value('palettes').deep_unpack();
        getChildrenOf(this.palettesListBox).slice(this.palettes.length)
                                           .forEach(row => this.palettesListBox.remove(row));
        let paletteBoxes = getChildrenOf(this.palettesListBox).map(row => row.get_child());
        
        this.palettes.forEach((palette, paletteIndex) => {
            let [name, colors] = palette;
            let paletteBox;
            
            if (paletteBoxes[paletteIndex]) {
                paletteBox = paletteBoxes[paletteIndex];
                let nameEntry = getChildrenOf(paletteBox)[0];
                if (nameEntry.get_text() !== _(name)) {
                    GObject.signal_handler_block(nameEntry, nameEntry.paletteNameChangedHandler);
                    nameEntry.set_text(_(name));
                    GObject.signal_handler_unblock(nameEntry, nameEntry.paletteNameChangedHandler);
                }
            } else {
                let nameEntry = new Gtk.Entry({ text: name, halign: Gtk.Align.START, tooltip_text: _("Rename the palette"), hexpand: true });
                nameEntry.paletteNameChangedHandler = nameEntry.connect('changed', this._onPaletteNameChanged.bind(this, paletteIndex));
                // Minimum size, for Gtk4
                nameEntry.set_size_request(nameEntry.get_preferred_size()[1].width, -1);
                let removeButton = IS_GTK3 ? Gtk.Button.new_from_icon_name('list-remove-symbolic', Gtk.IconSize.BUTTON) : Gtk.Button.new_from_icon_name('list-remove-symbolic');
                removeButton.set_tooltip_text(_("Remove the palette")); 
                removeButton.connect('clicked', this._removePalette.bind(this, paletteIndex));
                paletteBox = new Gtk.Box(ROWBOX_MARGIN_PARAMS);
                paletteBox.append(nameEntry);
                paletteBox.append(new Gtk.Box({ spacing: 4 }));
                paletteBox.append(removeButton);
                this.palettesListBox.insert(paletteBox, paletteIndex);
                paletteBox.get_parent().set_activatable(false);
            }
            
            while (colors.length < 9)
                colors.push('transparent');
            
            let colorsBox = getChildrenOf(paletteBox)[1];
            let colorButtons = getChildrenOf(colorsBox);
            colors.forEach((color, colorIndex) => {
                let [colorString, displayName] = color.split(':');
                if (colorButtons[colorIndex]) {
                    colorButtons[colorIndex].color_string = colorString;
                    colorButtons[colorIndex].tooltip_text = displayName || null;
                } else {
                    let colorButton = new ColorStringButton({ color_string: colorString, tooltip_text: displayName || null,
                                                              use_alpha: true, show_editor: true,
                                                              halign: Gtk.Align.START, hexpand: false });
                    colorButton.connect('notify::color-string', this._onPaletteColorChanged.bind(this, paletteIndex, colorIndex));
                    colorsBox.append(colorButton);
                }
            });
            
            if (IS_GTK3)
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
        if (colorButton.tooltip_text)
            this.palettes[paletteIndex][1][colorIndex] += `:${colorButton.tooltip_text}`;
        this._savePalettes();
    },
    
    _addNewPalette: function() {
        let colors = Array(9).fill('Black');
        // Translators: default name of a new palette
        this.palettes.push([_("New palette"), colors]);
        this._savePalettes();
    },
    
    _importPalette: function() {
        let dialog = new Gtk.FileChooserDialog({
            title: _GTK("Select a File"),
            action: Gtk.FileChooserAction.OPEN,
            modal: true,
            transient_for: IS_GTK3 ? this.get_toplevel() : this.get_root(),
        });
        dialog.add_button(_GTK("_Cancel"), Gtk.ResponseType.CANCEL);
        dialog.add_button(_GTK("_Open"), Gtk.ResponseType.ACCEPT);
        
        let filter = new Gtk.FileFilter();
        filter.set_name("GIMP Palette (*.gpl)");
        filter.add_pattern('*.gpl');
        dialog.add_filter(filter);
        
        dialog.connect('response', (dialog, response) => {
            if (response == Gtk.ResponseType.ACCEPT) {
                let file = dialog.get_file();
                let palettes = GimpPaletteParser.parseFile(file);
                palettes.forEach(palette => this.palettes.push(palette));
                this._savePalettes();
            }
            dialog.destroy();
        });
        
        dialog.show();
    },
    
    _removePalette: function(paletteIndex) {
        this.palettes.splice(paletteIndex, 1);
        this._savePalettes();
    }
});

const PrefsPage = new GObject.Class({
    Name: `${UUID}-PrefsPage`,
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent({ hscrollbar_policy: Gtk.PolicyType.NEVER });

        let settings = Convenience.getSettings();
        let schema = settings.settings_schema;
        let internalShortcutSettings = Convenience.getSettings(Me.metadata['settings-schema'] + '.internal-shortcuts');
        
        let box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin_top: 3 * MARGIN, margin_bottom: 3 * MARGIN, margin_start: 3 * MARGIN, margin_end: 3 * MARGIN, spacing: 3 * MARGIN });
        this.set_child(box);
        
        let globalFrame = new Frame({ label: _("Global") });
        box.append(globalFrame);
        
        let listBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true, margin_top: MARGIN, margin_bottom: MARGIN / 2 });
        listBox.get_style_context().add_class('background');
        globalFrame.set_child(listBox);
        
        Shortcuts.GLOBAL_KEYBINDINGS.forEach((settingKeys, index) => {
            if (index)
                listBox.insert(new Gtk.Box(ROWBOX_MARGIN_PARAMS), -1);
            
            let globalKeybindingsRow = new Gtk.ListBoxRow({ activatable: false });
            let globalKeybindingsWidget = new KeybindingsWidget(settingKeys, settings);
            globalKeybindingsRow.set_child(globalKeybindingsWidget);
            listBox.insert(globalKeybindingsRow, -1);
        });
        
        let persistentOverTogglesKey = schema.get_key('persistent-over-toggles');
        let persistentOverTogglesRow = new PrefRow({ label: persistentOverTogglesKey.get_summary(), desc: persistentOverTogglesKey.get_description() });
        let persistentOverTogglesSwitch = new Gtk.Switch();
        settings.bind('persistent-over-toggles', persistentOverTogglesSwitch, 'active', 0);
        persistentOverTogglesRow.addWidget(persistentOverTogglesSwitch, true);
        listBox.insert(persistentOverTogglesRow, -1);
        
        let persistentOverRestartsKey = schema.get_key('persistent-over-restarts');
        let persistentOverRestartsRow = new PrefRow({ label: persistentOverRestartsKey.get_summary(), desc: persistentOverRestartsKey.get_description() });
        let persistentOverRestartsSwitch = new Gtk.Switch();
        settings.bind('persistent-over-restarts', persistentOverRestartsSwitch, 'active', 0);
        persistentOverRestartsRow.addWidget(persistentOverRestartsSwitch, true);
        persistentOverTogglesSwitch.bind_property('active', persistentOverRestartsSwitch, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
        listBox.insert(persistentOverRestartsRow, -1);
        
        let desktopKey = schema.get_key('drawing-on-desktop');
        let desktopRow = new PrefRow({ label: desktopKey.get_summary(), desc: desktopKey.get_description() });
        let desktopSwitch = new Gtk.Switch();
        settings.bind('drawing-on-desktop', desktopSwitch, 'active', 0);
        desktopRow.addWidget(desktopSwitch, true);
        persistentOverTogglesSwitch.bind_property('active', desktopSwitch, 'sensitive', GObject.BindingFlags.SYNC_CREATE);
        listBox.insert(desktopRow, -1);
        
        let osdKey = schema.get_key('osd-disabled');
        let osdRow = new PrefRow({ label: osdKey.get_summary(), desc: osdKey.get_description() });
        let osdSwitch = new Gtk.Switch();
        settings.bind('osd-disabled', osdSwitch, 'active', 0);
        osdRow.addWidget(osdSwitch, true);
        listBox.insert(osdRow, -1);
        
        let indicatorKey = schema.get_key('indicator-disabled');
        let indicatorRow = new PrefRow({ label: indicatorKey.get_summary(), desc: indicatorKey.get_description() });
        let indicatorSwitch = new Gtk.Switch();
        settings.bind('indicator-disabled', indicatorSwitch, 'active', 0);
        indicatorRow.addWidget(indicatorSwitch, true);
        listBox.insert(indicatorRow, -1);
        
        let internalFrame = new Frame({ label: _("Internal"), desc: _("In drawing mode") });
        box.append(internalFrame);
        
        listBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true, margin_top: MARGIN, margin_bottom: MARGIN });
        listBox.get_style_context().add_class('background');
        internalFrame.set_child(listBox);
        
        Shortcuts.OTHERS.forEach((pairs, index) => {
            if (index)
                listBox.insert(new Gtk.Box(ROWBOX_MARGIN_PARAMS), -1);
            
            pairs.forEach(pair => {
                let [action, shortcut] = pair;
                let otherBox = new Gtk.Box({ margin_start: MARGIN, margin_end: MARGIN, spacing: 4 });
                otherBox.append(new Gtk.Label({ label: action, use_markup: true, halign: Gtk.Align.START, hexpand: true }));
                otherBox.append(new Gtk.Label({ label: shortcut }));
                listBox.insert(otherBox, -1);
            });
        });
        
        listBox.insert(new Gtk.Box(ROWBOX_MARGIN_PARAMS), -1);
        
        Shortcuts.INTERNAL_KEYBINDINGS.forEach((settingKeys, index) => {
            if (index)
                listBox.insert(new Gtk.Box(ROWBOX_MARGIN_PARAMS), -1);
            
            let internalKeybindingsWidget = new KeybindingsWidget(settingKeys, internalShortcutSettings);
            listBox.insert(internalKeybindingsWidget, -1);
        });
        
        getChildrenOf(listBox).forEach(row => row.set_activatable(false));
        
        let resetButton = new Gtk.Button({ label: _("Reset settings"), halign: Gtk.Align.CENTER });
        resetButton.get_style_context().add_class('destructive-action');
        resetButton.connect('clicked', () => {
            internalShortcutSettings.settings_schema.list_keys().forEach(key => internalShortcutSettings.reset(key));
            settings.settings_schema.list_keys().forEach(key => settings.reset(key));
        });
        box.append(resetButton);
    }
});

const Frame = new GObject.Class({
    Name: `${UUID}-Frame`,
    Extends: Gtk.Frame,

    _init: function(params) {
        let labelWidget = new Gtk.Label({ use_markup: true, label: `<b><big>${params.label}</big></b>` });
        this.parent({ label_widget: labelWidget });
        
        if (params.desc) {
            labelWidget.set_tooltip_text(params.desc);
            setAccessibleDescription(this, params.desc);
        }
    }
});

const PrefRow = new GObject.Class({
    Name: `${UUID}-PrefRow`,
    Extends: Gtk.ListBoxRow,

    _init: function(params) {
        this.parent({ activatable: false });
        
        let hbox = new Gtk.Box(ROWBOX_MARGIN_PARAMS);
        this.set_child(hbox);
        
        let labelBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, hexpand: true });
        hbox.append(labelBox);
        
        this.widgetBox = new Gtk.Box({ spacing: 4 });
        hbox.append(this.widgetBox);
        
        this.label = new Gtk.Label({ use_markup: true, label: params.label, halign: Gtk.Align.START, vexpand: true });
        labelBox.append(this.label);
        if (params.desc) {
            this.desc = new Gtk.Label({ use_markup: true, label: `<small>${params.desc}</small>`, halign: Gtk.Align.START, wrap: true, xalign: 0, vexpand: true });
            this.desc.get_style_context().add_class('dim-label');
            labelBox.append(this.desc);
            this.widgetBox.set_valign(Gtk.Align.START);
        }
    },
    
    addWidget: function(widget, setRelationship) {
        this.widgetBox.append(widget);
        
        if (widget.name)
            setAccessibleLabel(widget, widget.name);
        
        if (setRelationship && IS_GTK3) {
            this.label.get_accessible().add_relationship(imports.gi.Atk.RelationType.LABEL_FOR, widget.get_accessible());
            widget.get_accessible().add_relationship(imports.gi.Atk.RelationType.LABELLED_BY, this.label.get_accessible());
            
            if (this.desc) {
                this.desc.get_accessible().add_relationship(imports.gi.Atk.RelationType.DESCRIPTION_FOR, widget.get_accessible());
                widget.get_accessible().add_relationship(imports.gi.Atk.RelationType.DESCRIBED_BY, this.desc.get_accessible());
            }
        }
    }
});

const PixelSpinButton = new GObject.Class({
    Name: `${UUID}-PixelSpinButton`,
    Extends: Gtk.SpinButton,
    Properties: {
        'range': GObject.param_spec_variant('range', 'range', 'GSettings range',
                                            GLib.VariantType.new('(sv)'), null, GObject.ParamFlags.WRITABLE),
        
        'step': GObject.ParamSpec.double('step', 'step', 'step increment',
                                         GObject.ParamFlags.WRITABLE,
                                         0, 1000, 1)
    },
    
    set range(range) {
        let [type, variant] = range.deep_unpack();
        if (type == 'range') {
            let [min, max] = variant.deep_unpack();
            this.adjustment.set_lower(min);
            this.adjustment.set_upper(max);
        }
    },
    
    set step(step) {
        this.adjustment.set_step_increment(step);
        this.adjustment.set_page_increment(step * 10);
    },
    
    on_output: function() {
        this.text = _("%f px").format(Number(this.value).toFixed(2));
        return true;
    },
    
    // Prevent accidental scrolling (GTK 3).
    on_scroll_event: function(event) {
        if (this.has_focus) {
            try {
                GObject.signal_chain_from_overridden([this, event], false);
            } catch(e) { }
            
            return Gdk.EVENT_STOP;
        }
        
        return Gdk.EVENT_PROPAGATE;
    }
});

// A color button that can be easily bound with a color string setting.
const ColorStringButton = new GObject.Class({
    Name: `${UUID}-ColorStringButton`,
    Extends: Gtk.ColorButton,
    Properties: {
        'color-string': GObject.ParamSpec.string('color-string', 'colorString', 'A string that describes the color',
                                                 GObject.ParamFlags.READWRITE, 'black')
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
    
    on_color_set: function() {
        let oldRgba = new Gdk.RGBA();
        oldRgba.parse(this.color_string);
        
        // Do nothing if the new color is equivalent to the old color (e.g. "black" and "rgb(0,0,0)").
        if (!this.rgba.equal(oldRgba)) {
            this._color_string = this.rgba.to_string();
            this.notify('color-string');
        }
    }
});

const FileChooserButton = new GObject.Class({
    Name: `${UUID}-FileChooserButton`,
    Extends: Gtk.Button,
    Properties: {
        'action': GObject.ParamSpec.enum('action', 'action', 'action',
                                         GObject.ParamFlags.READWRITE,
                                         Gtk.FileChooserAction.$gtype,
                                         Gtk.FileChooserAction.SELECT_FOLDER),
        
        'location': GObject.ParamSpec.string('location', 'location', 'location',
                                             GObject.ParamFlags.READWRITE, '')
    },
    
    get location() {
        return this._location || "";
    },
    
    set location(location) {
        if (!this._location || this._location != location) {
            this._location = location;
            this.label = location ?
                         Gio.File.new_for_commandline_arg(location).query_info('standard::display-name', Gio.FileQueryInfoFlags.NONE, null).get_display_name() :
                         _GTK("(None)");
            
            this.notify('location');
        }
    },
    
    vfunc_clicked: function() {
        let dialog = new Gtk.FileChooserDialog({
            title: _(this.name),
            action: this.action,
            modal: true,
            transient_for: IS_GTK3 ? this.get_toplevel() : this.get_root(),
        });
        dialog.add_button(_GTK("_Cancel"), Gtk.ResponseType.CANCEL);
        dialog.add_button(_GTK("_Select"), Gtk.ResponseType.ACCEPT);
        
        if (this.location)
            dialog.set_file(Gio.File.new_for_commandline_arg(this.location));
        
        dialog.connect('response', (dialog, response) => {
            if (response == Gtk.ResponseType.ACCEPT)
                    this.location = dialog.get_file().get_path();
            dialog.destroy();
        });
        
        dialog.show();
    }
});

// From Sticky Notes View by Sam Bull, https://extensions.gnome.org/extension/568/notes/
const KeybindingsWidget = new GObject.Class({
    Name: `${UUID}-KeybindingsWidget`,
    Extends: Gtk.Box,

    _init: function(settingKeys, settings) {
        this.parent(ROWBOX_MARGIN_PARAMS);
        this.set_orientation(Gtk.Orientation.VERTICAL);

        this._settingKeys = settingKeys;
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

            if (!success) {
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

        this.append(this._tree_view);
        this.keybinding_column = keybinding_column;
        this.action_column = action_column;

        this._settings.connect('changed', this._onSettingsChanged.bind(this));
        this._refresh();
    },
    
    // Support the case where all the settings has been reset.
    _onSettingsChanged: function() {
        if (this._refreshTimeout)
            GLib.source_remove(this._refreshTimeout);
        
        this._refreshTimeout = GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            this._refreshTimeout = 0;
            this._refresh();
        });
    },

    _refresh: function() {
        this._store.clear();

        this._settingKeys.forEach(settingKey => {
            let success_, key, mods;
            if (IS_GTK3)
                [key, mods] = Gtk.accelerator_parse(this._settings.get_strv(settingKey)[0] || '');
            else
                [success_, key, mods] = Gtk.accelerator_parse(this._settings.get_strv(settingKey)[0] || '');

            let iter = this._store.append();
            this._store.set(iter,
                [
                    this._columns.NAME,
                    this._columns.ACCEL_NAME,
                    this._columns.MODS,
                    this._columns.KEY
                ],
                [
                    settingKey,
                    this._settings.settings_schema.get_key(settingKey).get_summary(),
                    mods,
                    key
                ]
            );
        });
    }
});
