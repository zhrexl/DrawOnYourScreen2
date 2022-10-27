/*
 * Copyright 2022 zhrexl
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
 */
const { Adw, Gdk, GLib, Gtk, GObject, Gio } = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Shortcuts = Me.imports.shortcuts;
const UUID = Me.uuid.replace(/@/gi, '_at_').replace(/[^a-z0-9+_-]/gi, '_');
const gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const _ = function(string) {
    if (!string)
        return "";
    return gettext(string);
};

const MARGIN = 10;
const ROWBOX_MARGIN_PARAMS = { margin_top: MARGIN / 2, margin_bottom: MARGIN / 2, margin_start: MARGIN, margin_end: MARGIN, spacing: 4 };

var Preferences = GObject.registerClass({
    GTypeName: 'Preferences'
}, class Preferences extends Adw.PreferencesPage {
    constructor() {
        super({});

        this.set_title("Preferences");
        this.set_name('prefs');
        this.set_icon_name("preferences-system-symbolic");
        let settings = ExtensionUtils.getSettings();
        let schema = settings.settings_schema;

        let grp_Global = Adw.PreferencesGroup.new();
        grp_Global.set_title("Global");

        Shortcuts.GLOBAL_KEYBINDINGS.forEach((settingKeys) => {
            let globalKeybindingsRow = new Adw.ActionRow();
            let name = settings.settings_schema.get_key(settingKeys).get_summary()
            globalKeybindingsRow.set_title(name);
            let globalKeybindingsWidget = new KeybindingsWidget(settingKeys, settings);
            globalKeybindingsRow.add_suffix(globalKeybindingsWidget);
            globalKeybindingsWidget.valign = Gtk.Align.CENTER;
            //globalKeybindingsRow.set_activatable_widget(globalKeybindingsRow);
            grp_Global.add(globalKeybindingsRow);
        });


        Shortcuts.GLOBAL_KEYBINDINGS_SWITCHES.forEach((settingKeys) => {
          let ActionRow = Adw.ActionRow.new();
          let ActionRow_switch = Gtk.Switch.new();
          let persistentOverTogglesKey = schema.get_key(settingKeys);

          ActionRow.set_title(persistentOverTogglesKey.get_summary());
          let description = persistentOverTogglesKey.get_description();

          if (description)
            ActionRow.set_subtitle(persistentOverTogglesKey.get_description());

          ActionRow.add_suffix(ActionRow_switch);
          ActionRow_switch.valign = Gtk.Align.CENTER;

          settings.bind(settingKeys, ActionRow_switch, 'active', 0);

          grp_Global.add(ActionRow);
        });

        let grp_Internal = Adw.PreferencesGroup.new();
        grp_Internal.set_title("Internal");

        let internalShortcutSettings = ExtensionUtils.getSettings(Me.metadata['settings-schema'] + '.internal-shortcuts');

        // TODO: Improve Shortcut Widget
        Shortcuts.INTERNAL_KEYBINDINGS.forEach((settingKeys) => {
            let globalKeybindingsRow = new Adw.ActionRow();
            let name = internalShortcutSettings.settings_schema.get_key(settingKeys).get_summary()
            globalKeybindingsRow.set_title(name);
            let globalKeybindingsWidget = new KeybindingsWidget(settingKeys, internalShortcutSettings);
            globalKeybindingsRow.add_suffix(globalKeybindingsWidget);
            globalKeybindingsWidget.valign = Gtk.Align.CENTER;
            //globalKeybindingsRow.set_activatable_widget(globalKeybindingsRow);
            grp_Internal.add(globalKeybindingsRow);
        });

        let resetButton = new Gtk.Button({ label: _("Reset settings"), halign: Gtk.Align.CENTER });
        resetButton.get_style_context().add_class('destructive-action');
        resetButton.connect('clicked', () => {
            internalShortcutSettings.settings_schema.list_keys().forEach(key => internalShortcutSettings.reset(key));
            settings.settings_schema.list_keys().forEach(key => settings.reset(key));
        });

        resetButton.set_margin_top(12);

        this.add(grp_Global);
        this.add(grp_Internal);
        grp_Internal.add(resetButton);
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
            let success_, key, mods;

            [success_, key, mods] = Gtk.accelerator_parse(this._settings.get_strv(this._settingKeys)[0] || '');

            let iter = this._store.append();
            this._store.set(iter,
                [
                    this._columns.NAME,
                    this._columns.ACCEL_NAME,
                    this._columns.MODS,
                    this._columns.KEY
                ],
                [
                    this._settingKeys,
                    this._settings.settings_schema.get_key(this._settingKeys).get_summary(),
                    mods,
                    key
                ]
            );

    }
});
