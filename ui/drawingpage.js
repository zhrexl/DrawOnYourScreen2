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
 * SPDX-FileCopyrightText: 2022 zhrexl
 * SPDX-License-Identifier: GPL-3.0-or-later
 */
const { Adw, Gdk, GLib, Gtk, GObject, Gio } = imports.gi;


const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const Convenience = ExtensionUtils.getSettings && ExtensionUtils.initTranslations ? ExtensionUtils : Me.imports.convenience;
const Shortcuts = Me.imports.shortcuts;
const UUID = Me.uuid.replace(/@/gi, '_at_').replace(/[^a-z0-9+_-]/gi, '_');
const gettext = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const _ = function(string) {
    if (!string)
        return "";
    return gettext(string);
};

var DrawingPage = GObject.registerClass({
    GTypeName: 'Drawing'
}, class DrawingPage extends Adw.PreferencesPage {
    constructor() {
        super({});

        this.set_title("Drawing Page");
        this.set_name('drawing');
        let settings = Convenience.getSettings();
        let schema = settings.settings_schema;


        let grp_Global = Adw.PreferencesGroup.new();
        grp_Global.set_title("Global");

        Shortcuts.GLOBAL_KEYBINDINGS.forEach((settingKeys) => {
            let globalKeybindingsRow = new Adw.ActionRow();
            let name = settings.settings_schema.get_key(settingKeys).get_summary()
            globalKeybindingsRow.set_title(name);
            //let globalKeybindingsWidget = Gtk.Label.new(name);//new KeybindingsWidget(settingKeys, settings);
            //globalKeybindingsRow.add_suffix(globalKeybindingsWidget);
           // globalKeybindingsWidget.valign = Gtk.Align.CENTER;
            globalKeybindingsRow.set_activatable_widget(globalKeybindingsRow);
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

        let internalShortcutSettings = Convenience.getSettings(Me.metadata['settings-schema'] + '.internal-shortcuts');

        Shortcuts.INTERNAL_KEYBINDINGS.forEach((settingKeys) => {
            let globalKeybindingsRow = new Adw.ActionRow();
            let name = internalShortcutSettings.settings_schema.get_key(settingKeys).get_summary()
            globalKeybindingsRow.set_title(name);
            globalKeybindingsRow.set_activatable_widget(globalKeybindingsRow);
            /*
            Add a Shortcut Widget as Suffix here
            */
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
