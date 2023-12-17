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


import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gtk from 'gi://Gtk';
import GObject from 'gi://GObject';

import { gettext } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { CURATED_UUID as UUID } from '../utils.js';
import * as Shortcuts from '../shortcuts.js';


const _ = (string) => string ? gettext(string) : "";
const MARGIN = 10;
const ROWBOX_MARGIN_PARAMS = { margin_top: MARGIN / 2, margin_bottom: MARGIN / 2, margin_start: MARGIN, margin_end: MARGIN, spacing: 4 };


const PreferencesPage = GObject.registerClass({
  GTypeName: `${UUID}-PreferencesPage`
}, class Preferences extends Adw.PreferencesPage {

  constructor(extensionPreferences) {
    super({});

    this.set_title("Preferences");
    this.set_name('prefs');
    this.set_icon_name("preferences-system-symbolic");
    let settings = extensionPreferences.getSettings();
    let schema = settings.settings_schema;

    let grp_Global = Adw.PreferencesGroup.new();
    grp_Global.set_title("Global");

    Shortcuts.GLOBAL_KEYBINDINGS.forEach((settingKeys) => {
      let globalKeybindingsRow = new Adw.ActionRow();
      let globalKeybindingsWidget = new ShortCutWidget(settings, settingKeys);
      let name = settings.settings_schema.get_key(settingKeys).get_summary();

      globalKeybindingsRow.set_title(name);
      globalKeybindingsRow.add_suffix(globalKeybindingsWidget);
      globalKeybindingsWidget.valign = Gtk.Align.CENTER;

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

    let internalShortcutSettings = extensionPreferences.getSettings(extensionPreferences.metadata['settings-schema'] + '.internal-shortcuts');

    // TODO: Improve Shortcut Widget
    Shortcuts.INTERNAL_KEYBINDINGS.forEach((settingKeys) => {
      let globalKeybindingsRow = new Adw.ActionRow();
      let globalKeybindingsWidget = new ShortCutWidget(internalShortcutSettings, settingKeys);
      let name = internalShortcutSettings.settings_schema.get_key(settingKeys).get_summary();

      globalKeybindingsRow.set_title(name);
      globalKeybindingsRow.add_suffix(globalKeybindingsWidget);
      globalKeybindingsWidget.valign = Gtk.Align.CENTER;

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


//TODO: ShortCutWidget should not allow two identicals shortcuts
const ShortCutWidget = GObject.registerClass({
  GTypeName: `${UUID}-ShortCutWidget`
}, class ShortCutWidget extends Gtk.Button {
  constructor(settings, settingsKeys) {
    super({});
    this._settings = settings;
    this._settingsKeys = settingsKeys;

    let key = settings.get_strv(settingsKeys)[0];
    this.shortcutlabel = Gtk.ShortcutLabel.new(key);
    this.evck = Gtk.EventControllerKey.new();
    this.allow_changes = false;

    this.add_controller(this.evck);

    //TODO: This needs testing
    if (key == null)
      this.set_label(_("Click here to set new shortcut..."));
    else
      this.set_child(this.shortcutlabel);

    this.get_style_context().add_class('flat');
    this.connect('clicked', this.clicked.bind(this));
    this.evck.connect('key-pressed', this.key_pressed.bind(this));
    this.evck.connect('key-released', this.key_released.bind(this));
    this._settings.connect('changed', this.on_settings_changed.bind(this));
  }
  on_settings_changed() {
    let key = this._settings.get_strv(this._settingsKeys)[0];
    this.shortcutlabel.set_accelerator(key);
  }
  clicked() {
    this.set_label(_("Press the new shortcut..."));
    this.allow_changes = true;
  }
  key_released(widget, keyval, keycode, state) {
    if (this.allow_changes == false)
      return Gdk.EVENT_STOP;
    else
      this.allow_changes = false;

    let value = this.shortcutlabel.get_accelerator();
    this._settings.set_strv(this._settingsKeys, [value]);
  }
  key_pressed(widget, keyval, keycode, state) {
    if (this.allow_changes == false)
      return Gdk.EVENT_STOP;

    let mask = state & Gtk.accelerator_get_default_mod_mask();
    let binding = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);

    this.shortcutlabel.set_accelerator(binding);
    this.set_child(this.shortcutlabel);

    return Gdk.EVENT_STOP;
  }
});


export default PreferencesPage;