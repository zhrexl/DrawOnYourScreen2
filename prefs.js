/* jslint esversion: 6 */

/*
 * Copyright 2019 Abakkk
 *
 * This file is part of DrowOnYourScreen, a drawing extension for GNOME Shell.
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

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();
const Convenience = Extension.imports.convenience;
const Metadata = Extension.metadata;
const _ = imports.gettext.domain(Extension.metadata["gettext-domain"]).gettext;

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
    'increment-line-width': "Increment line width",
    'decrement-line-width': "Decrement line width",
    'increment-line-width-more': "Increment line width even more",
    'decrement-line-width-more': "Decrement line width even more",
    'toggle-linejoin': "Change linejoin",
    'toggle-linecap': "Change linecap",
    'toggle-dash': "Dashed line",
    '-separator-2': '',
    'select-line-shape': "Select line",
    'select-ellipse-shape': "Select circle",
    'select-rectangle-shape': "Select rectangle",
    'select-text-shape': "Select text",
    'select-none-shape': "Unselect shape (free drawing)",
    '-separator-3': '',
    'toggle-font-family': "Change font family (generic name)",
    'toggle-font-weight': "Change font weight",
    'toggle-font-style': "Change font style",
    '-separator-4': '',
    'toggle-panel-and-dock-visibility': "Hide panel and dock",
    'toggle-background': "Add a drawing background",
    '-separator-5': '',
    'save-as-svg': "Save drawing as a SVG file",
    'open-stylesheet': "Open stylesheet.css",
    'toggle-help': "Show help"
};

var OTHER_SHORTCUTS = {
    "Draw": "Left click",
    "Draw by filling in": "Right click",
    "Toggle shape": "Center click",
    "Increment/decrement line width": "Scroll",
    "Select color": "Ctrl+1...9",
    "Select eraser": "Shift key held",
    "Leave and erase all drawings": "Escape key"
};

function init() {
    Convenience.initTranslations();
}

function buildPrefsWidget() {
    let prefsPage = new PrefsPage();
    prefsPage.show_all();
    return prefsPage;
}

const PrefsPage = new GObject.Class({
    Name: 'PrefsPage',
    GTypeName: 'PrefsPage',
    Extends: Gtk.ScrolledWindow,

    _init: function(params) {
        this.parent();

        this.settings = Convenience.getSettings();
        
        let box = new Gtk.Box({orientation: Gtk.Orientation.VERTICAL, margin: MARGIN*3 });
        this.add(box);
        
        let textBox1 = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, margin: MARGIN });
        let text1 = new Gtk.Label({ wrap: true, justify: 2, use_markup: true,
                                    label: _("Start drawing with Super+Alt+D\nThen save your beautiful work by taking a screenshot") });
        textBox1.pack_start(text1, false, false, 0);
        box.add(textBox1);
        
        let listBox = new Gtk.ListBox({ selection_mode: 0, hexpand: true, margin_top: 2*MARGIN, margin_bottom: 2*MARGIN });
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
        this.addSeparator(listBox);
        
        let internalTitleBox = new Gtk.Box({ margin: MARGIN });
        let internalTitleLabel = new Gtk.Label({ use_markup: true, label: "<b><big>" + _("Internal") + " </big></b>" + _("(in drawing mode)") + " <b><big>:</big></b>" });
        internalTitleLabel.set_halign(1);
        internalTitleBox.pack_start(internalTitleLabel, true, true, 4);
        listBox.add(internalTitleBox);
        
        listBox.add(new Gtk.Box({ margin_top: MARGIN/2, margin_left: MARGIN, margin_right: MARGIN }));
        
        for (let desc in OTHER_SHORTCUTS) {
            if (desc.indexOf('-separator-') != -1) {
                listBox.add(new Gtk.Box({ margin_top: MARGIN, margin_left: MARGIN, margin_right: MARGIN }));
                continue;
            }
            let otherBox = new Gtk.Box({ margin_left: MARGIN, margin_right: MARGIN });
            let otherLabel = new Gtk.Label({ label: _(desc) });
            otherLabel.set_halign(1);
            let otherLabel2 = new Gtk.Label({ label: _(OTHER_SHORTCUTS[desc]) });
            otherBox.pack_start(otherLabel, true, true, 4);
            otherBox.pack_start(otherLabel2, false, false, 4);
            listBox.add(otherBox);
        }
        
        listBox.add(new Gtk.Box({ margin_top: MARGIN, margin_left: MARGIN, margin_right: MARGIN }));
        
        let smoothBox = new Gtk.Box({ margin: MARGIN });
        let smoothLabelBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let smoothLabel1 = new Gtk.Label({label: _("Smooth stroke during the drawing process")});
        let smoothLabel2 = new Gtk.Label({ use_markup: true, halign: 1, label: "<small>" + _("You can smooth the stroke afterward\nSee") + " \"" + _("Smooth last brushstroke") + "\"</small>" });
        smoothLabel1.set_halign(1);
        smoothLabel2.get_style_context().add_class("dim-label");
        smoothLabelBox.pack_start(smoothLabel1, true, true, 0);
        smoothLabelBox.pack_start(smoothLabel2, true, true, 0);
        let smoothSwitch = new Gtk.Switch({valign: 3});
        this.settings.bind("smoothed-stroke", smoothSwitch, "active", 0);
        smoothBox.pack_start(smoothLabelBox, true, true, 4);
        smoothBox.pack_start(smoothSwitch, false, false, 4);
        listBox.add(smoothBox);
        
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
            label: _("<u>Note</u>: When you save elements made with eraser in a SVG file,\nthey are colored with background color, transparent if it is disabled.\n(See \"Add a drawing background\" or edit the SVG file afterwards)")
        });
        noteLabel.set_halign(1);
        //let noteLabel2 = new Gtk.Label({ label: _("See notesheet.css") });
        noteBox.pack_start(noteLabel, true, true, 4);
        //noteBox.pack_start(noteLabel2, false, false, 4);
        listBox.add(noteBox);
        
        this.addSeparator(listBox);
        
        let licence = _("<span size=\"small\">This program comes with ABSOLUTELY NO WARRANTY.\nSee the <a href=\"https://www.gnu.org/licenses/old-licenses/gpl-2.0.html\">GNU General Public License, version 2 or later</a> for details.</span>");
        
        let textBox2 = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let text2 = new Gtk.Label({ wrap: true, justify: 2, use_markup: true,
                                  label: "<small>Version" + " " + Metadata.version +"</small>\n\n" + "<span><a href=\"" + Metadata.url + "\">" + Metadata.url + "</a></span>" + "\n\n" + licence + "\n" });
        textBox2.pack_start(text2, false, false, 0);
        
        let creditBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL });
        let leftBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let rightBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL });
        let leftLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 2, justify: 1, use_markup: true, label: "<small><u>" + _("Credits") + ":</u></small>" });
        let rightLabel = new Gtk.Label({ wrap: true, valign: 1, halign: 1, justify: 0, use_markup: true, label: "<small>Abakkk</small>" });
        leftBox.pack_start(leftLabel, true, true, 0);
        rightBox.pack_start(rightLabel, true, true, 0);
        creditBox.pack_start(leftBox, true, true, 5);
        creditBox.pack_start(rightBox, true, true, 5);
        textBox2.pack_start(creditBox, false, false, 0);
        
        box.add(textBox2);
        
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
const KeybindingsWidget = new GObject.Class({
    Name: 'Keybindings.Widget',
    GTypeName: 'KeybindingsWidget',
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
