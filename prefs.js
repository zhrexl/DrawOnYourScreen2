/* jslint esversion: 6 */

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

const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();
const Convenience = Extension.imports.convenience;
const Metadata = Extension.metadata;
const _ = imports.gettext.domain(Extension.metadata["gettext-domain"]).gettext;
const _GTK = imports.gettext.domain('gtk30').gettext;

const MARGIN = 10;

var GLOBAL_KEYBINDINGS = {
    'toggle-drawing': "Enter/leave drawing mode",
    'erase-drawing': "Erase all drawings"
};

var INTERNAL_KEYBINDINGS = {
    'undo': "Undo last brushstroke",
    'redo': "Redo last brushstroke",
    'delete-last-element' : "Erase last brushstroke",
    'smooth-last-element': "Smooth last brushstroke",
    '-separator-1': '',
    'select-line-shape': "Select line",
    'select-ellipse-shape': "Select ellipse",
    'select-rectangle-shape': "Select rectangle",
    'select-text-shape': "Select text",
    'select-none-shape': "Unselect shape (free drawing)",
    'toggle-fill': "Toggle fill/stroke",
    '-separator-2': '',
    'increment-line-width': "Increment line width",
    'decrement-line-width': "Decrement line width",
    'increment-line-width-more': "Increment line width even more",
    'decrement-line-width-more': "Decrement line width even more",
    'toggle-linejoin': "Change linejoin",
    'toggle-linecap': "Change linecap",
    'toggle-dash': "Dashed line",
    '-separator-3': '',
    'toggle-font-family': "Change font family (generic name)",
    'toggle-font-weight': "Change font weight",
    'toggle-font-style': "Change font style",
    '-separator-4': '',
    'toggle-panel-and-dock-visibility': "Hide panel and dock",
    'toggle-background': "Add a drawing background",
    'toggle-square-area': "Square drawing area",
    '-separator-5': '',
    'open-previous-json': "Open previous drawing",
    'open-next-json': "Open next drawing",
    'save-as-json': "Save drawing",
    'save-as-svg': "Save drawing as a SVG file",
    'open-stylesheet': "Open stylesheet.css",
    'toggle-help': "Show help"
};

var OTHER_SHORTCUTS = [
    { desc: "Draw", shortcut: "Left click" },
    { desc: "Menu", shortcut: "Right click" },
    { desc: "Toggle fill/stroke", shortcut: "Center click" },
    { desc: "Transform shape (when drawing)", shortcut: "Ctrl key" },
    { desc: "Increment/decrement line width", shortcut: "Scroll" },
    { desc: "Select color", shortcut: "Ctrl+1...9" },
    { desc: "Select eraser", shortcut: "Shift key held" },
    { desc: "Leave", shortcut: "Escape key" }
];

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let topStack = new TopStack();
    let switcher = new Gtk.StackSwitcher({halign: Gtk.Align.CENTER, visible: true, stack: topStack});
    Mainloop.timeout_add(0, () => {
        let window = topStack.get_toplevel();
        window.resize(720,500);
        let headerBar = window.get_titlebar();
        headerBar.custom_title = switcher;
        return false;
    });
    
    topStack.show_all();
    return topStack;
}

var TopStack = new GObject.Class({
    Name: 'DrawOnYourScreenTopStack',
    GTypeName: 'DrawOnYourScreenTopStack',
    Extends: Gtk.Stack,
    
    _init: function(params) {
        this.parent({ transition_type: 1, transition_duration: 500, expand: true });
        this.prefsPage = new PrefsPage();
        this.add_titled(this.prefsPage, 'prefs', _("Preferences"));
        this.aboutPage = new AboutPage();
        this.add_titled(this.aboutPage, 'about', _("About"));
    }
});

var AboutPage = new GObject.Class({
    Name: 'DrawOnYourScreenAboutPage',
    GTypeName: 'DrawOnYourScreenAboutPage',
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent();

        let vbox= new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin: MARGIN*3 });
        this.add(vbox);
        
        let name = "<b> " + _(Metadata.name) + "</b>";
        let version = _("Version %d").format(Metadata.version);
        let description = _(Metadata.description);
        let link = "<span><a href=\"" + Metadata.url + "\">" + Metadata.url + "</a></span>";
        let licenceName = _GTK("GNU General Public License, version 2 or later");
        let licenceLink = "https://www.gnu.org/licenses/old-licenses/gpl-2.0.html";
        let licence = "<small>" + _GTK("This program comes with absolutely no warranty.\nSee the <a href=\"%s\">%s</a> for details.").format(licenceLink, licenceName) + "</small>";
        
        let aboutLabel = new Gtk.Label({ wrap: true, justify: 2, use_markup: true, label:
            name + "\n\n" + version + "\n\n" + description + "\n\n" + link + "\n\n" + licence + "\n" });
        
        vbox.add(aboutLabel);
        
        let creditBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, margin: 2*MARGIN });
        let leftBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let rightBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let leftLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 2, justify: 1, use_markup: true, label: "<small>" + _GTK("Created by") + "</small>" });
        let rightLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 1, justify: 0, use_markup: true, label: "<small><a href=\"https://framagit.org/abakkk\">Abakkk</a></small>" });
        leftBox.pack_start(leftLabel, false, false, 0);
        rightBox.pack_start(rightLabel, false, false, 0);
        creditBox.pack_start(leftBox, true, true, 5);
        creditBox.pack_start(rightBox, true, true, 5);
        vbox.add(creditBox);
        
        if (_("Translators") != "Translators" && _("Translators") != "") {
            leftBox.pack_start(new Gtk.Label(), false, false, 0);
            rightBox.pack_start(new Gtk.Label(), false, false, 0);
            leftLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 2, justify: 1, use_markup: true, label: "<small>" + _GTK("Translated by") + "</small>" });
            rightLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 1, justify: 0, use_markup: true, label: "<small>" + _("Translators") + "</small>" });
            leftBox.pack_start(leftLabel, false, false, 0);
            rightBox.pack_start(rightLabel, false, false, 0);
        }
    }
    
});

var PrefsPage = new GObject.Class({
    Name: 'DrawOnYourScreenPrefsPage',
    GTypeName: 'DrawOnYourScreenPrefsPage',
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent();

        this.settings = Convenience.getSettings();
        
        let box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, margin: MARGIN*3 });
        this.add(box);
        
        let listBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true });
        box.add(listBox);
        
        let styleContext = listBox.get_style_context();
        styleContext.add_class('background');
        
        let globalTitleBox = new Gtk.Box({ margin: MARGIN });
        let globalTitleLabel = new Gtk.Label({ use_markup: true, label: "<b><big>" + _("Global") + " :</big></b>" });
        globalTitleLabel.set_halign(1);
        globalTitleBox.pack_start(globalTitleLabel, true, true, 4);
        listBox.add(globalTitleBox);
        
        let globalKeybindingsWidget = new KeybindingsWidget(GLOBAL_KEYBINDINGS, this.settings);
        globalKeybindingsWidget.margin = MARGIN;
        listBox.add(globalKeybindingsWidget);
        
        let desktopBox = new Gtk.Box({ margin: MARGIN });
        let desktopLabelBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let desktopLabel1 = new Gtk.Label({label: _("Drawing on the desktop")});
        let desktopLabel2 = new Gtk.Label({ use_markup: true, halign: 1, label: "<small>" + _("Draw On Your Screen becomes Draw On Your Desktop") + "</small>" });
        desktopLabel1.set_halign(1);
        desktopLabel2.get_style_context().add_class("dim-label");
        desktopLabelBox.pack_start(desktopLabel1, true, true, 0);
        desktopLabelBox.pack_start(desktopLabel2, true, true, 0);
        let desktopSwitch = new Gtk.Switch({valign: 3});
        this.settings.bind("drawing-on-desktop", desktopSwitch, "active", 0);
        desktopBox.pack_start(desktopLabelBox, true, true, 4);
        desktopBox.pack_start(desktopSwitch, false, false, 4);
        listBox.add(desktopBox);
        
        let persistentBox = new Gtk.Box({ margin: MARGIN });
        let persistentLabelBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let persistentLabel1 = new Gtk.Label({label: _("Persistent")});
        let persistentLabel2 = new Gtk.Label({ use_markup: true, halign: 1, label: "<small>" + _("Persistent drawing through session restart") + "</small>" });
        persistentLabel1.set_halign(1);
        persistentLabel2.get_style_context().add_class("dim-label");
        persistentLabelBox.pack_start(persistentLabel1, true, true, 0);
        persistentLabelBox.pack_start(persistentLabel2, true, true, 0);
        let persistentSwitch = new Gtk.Switch({valign: 3});
        this.settings.bind("persistent-drawing", persistentSwitch, "active", 0);
        persistentBox.pack_start(persistentLabelBox, true, true, 4);
        persistentBox.pack_start(persistentSwitch, false, false, 4);
        listBox.add(persistentBox);
        
        let osdBox = new Gtk.Box({ margin: MARGIN });
        let osdLabelBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let osdLabel1 = new Gtk.Label({label: _("Disable on-screen notifications")});
        osdLabel1.set_halign(1);
        osdLabelBox.pack_start(osdLabel1, true, true, 0);
        let osdSwitch = new Gtk.Switch({valign: 3});
        this.settings.bind("osd-disabled", osdSwitch, "active", 0);
        osdBox.pack_start(osdLabelBox, true, true, 4);
        osdBox.pack_start(osdSwitch, false, false, 4);
        listBox.add(osdBox);
        
        let indicatorBox = new Gtk.Box({ margin: MARGIN });
        let indicatorLabelBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let indicatorLabel1 = new Gtk.Label({label: _("Disable panel indicator")});
        indicatorLabel1.set_halign(1);
        indicatorLabelBox.pack_start(indicatorLabel1, true, true, 0);
        let indicatorSwitch = new Gtk.Switch({valign: 3});
        this.settings.bind("indicator-disabled", indicatorSwitch, "active", 0);
        indicatorBox.pack_start(indicatorLabelBox, true, true, 4);
        indicatorBox.pack_start(indicatorSwitch, false, false, 4);
        listBox.add(indicatorBox);
        this.addSeparator(listBox);
        
        let internalTitleBox = new Gtk.Box({ margin: MARGIN });
        let internalTitleLabel = new Gtk.Label({ use_markup: true, label: "<b><big>" + _("Internal") + " </big></b>" + _("(in drawing mode)") + " <b><big>:</big></b>" });
        internalTitleLabel.set_halign(1);
        internalTitleBox.pack_start(internalTitleLabel, true, true, 4);
        listBox.add(internalTitleBox);
        
        listBox.add(new Gtk.Box({ margin_top: MARGIN/2, margin_left: MARGIN, margin_right: MARGIN }));
        
        for (let i = 0; i < OTHER_SHORTCUTS.length; i++) {
            if (OTHER_SHORTCUTS[i].desc.indexOf('-separator-') != -1) {
                listBox.add(new Gtk.Box({ margin_top: MARGIN, margin_left: MARGIN, margin_right: MARGIN }));
                continue;
            }
            let otherBox = new Gtk.Box({ margin_left: MARGIN, margin_right: MARGIN });
            let otherLabel = new Gtk.Label({ label: _(OTHER_SHORTCUTS[i].desc) });
            otherLabel.set_halign(1);
            let otherLabel2 = new Gtk.Label({ label: _(OTHER_SHORTCUTS[i].shortcut) });
            otherBox.pack_start(otherLabel, true, true, 4);
            otherBox.pack_start(otherLabel2, false, false, 4);
            listBox.add(otherBox);
        }
        
        listBox.add(new Gtk.Box({ margin_top: MARGIN, margin_left: MARGIN, margin_right: MARGIN }));
        
        let controlBox = new Gtk.Box({ margin_top: MARGIN, margin_left: MARGIN, margin_right: MARGIN, margin_bottom:MARGIN });
        let controlLabel = new Gtk.Label({
            use_markup: true,
            label: _("By pressing <b>Ctrl</b> key <b>during</b> the drawing process, you can:\n" +
                     " . rotate a rectangle or a text area\n" +
                     " . extend and rotate an ellipse\n" +
                     " . curve a line (cubic Bezier curve)\n" +
                     " . smooth a free drawing stroke (you may prefer to smooth the stroke afterward, see “<i>%s</i>”)").format(_("Smooth last brushstroke"))
        });
        controlLabel.set_halign(1);
        controlLabel.get_style_context().add_class("dim-label");
        controlBox.pack_start(controlLabel, true, true, 4);
        listBox.add(controlBox);
        
        let internalKeybindingsWidget = new KeybindingsWidget(INTERNAL_KEYBINDINGS, this.settings);
        internalKeybindingsWidget.margin = MARGIN;
        listBox.add(internalKeybindingsWidget);
        
        let styleBox = new Gtk.Box({ margin_top: MARGIN, margin_left: MARGIN, margin_right: MARGIN, margin_bottom:MARGIN });
        let styleLabel = new Gtk.Label({ label: _("Change the style") });
        styleLabel.set_halign(1);
        let styleLabel2 = new Gtk.Label({ label: _("See stylesheet.css") });
        styleBox.pack_start(styleLabel, true, true, 4);
        styleBox.pack_start(styleLabel2, false, false, 4);
        listBox.add(styleBox);
        
        let noteBox = new Gtk.Box({ margin_top: MARGIN, margin_left: MARGIN, margin_right: MARGIN, margin_bottom:MARGIN });
        let noteLabel = new Gtk.Label({
            use_markup: true,
            label: _("<u>Note</u>: When you save elements made with <b>eraser</b> in a <b>SVG</b> file,\nthey are colored with background color, transparent if it is disabled.\n(See “%s” or edit the SVG file afterwards)").format(_("Add a drawing background"))
        });
        noteLabel.set_halign(1);
        noteLabel.get_style_context().add_class("dim-label");
        noteBox.pack_start(noteLabel, true, true, 4);
        listBox.add(noteBox);
        
        let children = listBox.get_children();
        for (let i = 0; i < children.length; i++) {
            if (children[i].activatable)
                children[i].set_activatable(false);
        }
    },
    
    addSeparator: function(container) {
        let separatorRow = new Gtk.ListBoxRow({sensitive: false});
        separatorRow.add(new Gtk.Separator({ margin: MARGIN }));
        container.add(separatorRow);
    }
});

// this code comes from Sticky Notes View by Sam Bull, https://extensions.gnome.org/extension/568/notes/
var KeybindingsWidget = new GObject.Class({
    Name: 'DrawOnYourScreenKeybindings.Widget',
    GTypeName: 'DrawOnYourScreenKeybindingsWidget',
    Extends: Gtk.Box,

    _init: function(keybindings, settings) {
        this.parent();
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
        keybinding_renderer.connect('accel-edited',
            Lang.bind(this, function(renderer, iter, key, mods) {
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
            })
        );

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

        for(let settings_key in this._keybindings) {
            if (settings_key.indexOf('-separator-') != -1)
                continue;
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
                    _(this._keybindings[settings_key]),
                    mods,
                    key
                ]
            );
        }
    }
});
