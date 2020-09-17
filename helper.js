/* jslint esversion: 6 */
/* exported DrawingHelper */

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
const Lang = imports.lang;
const St = imports.gi.St;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Tweener = imports.ui.tweener;

const Me = ExtensionUtils.getCurrentExtension();
const Convenience = ExtensionUtils.getSettings ? ExtensionUtils : Me.imports.convenience;
const Shortcuts = Me.imports.shortcuts;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const GS_VERSION = Config.PACKAGE_VERSION;

const HELPER_ANIMATION_TIME = 0.25;
const MEDIA_KEYS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';
const MEDIA_KEYS_KEYS = ['screenshot', 'screenshot-clip', 'area-screenshot', 'area-screenshot-clip'];

// DrawingHelper provides the "help osd" (Ctrl + F1)
// It uses the same texts as in prefs
var DrawingHelper = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingHelper',
    Extends: St.ScrollView,
    
    _init: function(params, monitor) {
        params.style_class = 'osd-window draw-on-your-screen-helper';
        this.parent(params);
        this.monitor = monitor;
        this.hide();
        
        this.settingsHandler = Me.settings.connect('changed', this._onSettingsChanged.bind(this));
        this.internalShortcutsettingsHandler = Me.internalShortcutSettings.connect('changed', this._onSettingsChanged.bind(this));
        this.connect('destroy', () => {
            Me.settings.disconnect(this.settingsHandler);
            Me.internalShortcutSettings.disconnect(this.internalShortcutsettingsHandler);
        });
    },
    
    _onSettingsChanged: function(settings, key) {
        if (key == 'toggle-help')
            this._updateHelpKeyLabel();
        
        if (this.vbox) {
            this.vbox.destroy();
            delete this.vbox;
        }
    },
    
    _updateHelpKeyLabel: function() {
        let [keyval, mods] = Gtk.accelerator_parse(Me.internalShortcutSettings.get_strv('toggle-help')[0] || '');
        this._helpKeyLabel = Gtk.accelerator_get_label(keyval, mods);
    },
    
    get helpKeyLabel() {
        if (!this._helpKeyLabel)
            this._updateHelpKeyLabel();
        
        return this._helpKeyLabel;
    },
    
    _populate: function() {
        this.vbox = new St.BoxLayout({ vertical: true });
        this.add_actor(this.vbox);
        this.vbox.add_child(new St.Label({ text: _("Global") }));
        
        Shortcuts.GLOBAL_KEYBINDINGS.forEach((settingKeys, index) => {
            if (index)
                this.vbox.add_child(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-helper-separator' }));
            
            settingKeys.forEach(settingKey => {
                if (!Me.settings.get_strv(settingKey)[0])
                    return;
                
                let hbox = new St.BoxLayout({ vertical: false });
                let [keyval, mods] = Gtk.accelerator_parse(Me.settings.get_strv(settingKey)[0] || '');
                hbox.add_child(new St.Label({ text: Me.settings.settings_schema.get_key(settingKey).get_summary() }));
                hbox.add_child(new St.Label({ text: Gtk.accelerator_get_label(keyval, mods), x_expand: true }));
                this.vbox.add_child(hbox);
            });
        });
        
        this.vbox.add_child(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-helper-separator' }));
        this.vbox.add_child(new St.Label({ text: _("Internal") }));
        
        Shortcuts.OTHERS.forEach((pairs, index) => {
            if (index)
                this.vbox.add_child(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-helper-separator' }));
            
            pairs.forEach(pair => {
                let [action, shortcut] = pair;
                let hbox = new St.BoxLayout({ vertical: false });
                hbox.add_child(new St.Label({ text: action }));
                hbox.add_child(new St.Label({ text: shortcut, x_expand: true }));
                hbox.get_children()[0].get_clutter_text().set_use_markup(true);
                this.vbox.add_child(hbox);
            });
        });
        
        this.vbox.add_child(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-helper-separator' }));
        
        Shortcuts.INTERNAL_KEYBINDINGS.forEach((settingKeys, index) => {
            if (index)
                this.vbox.add_child(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-helper-separator' }));
            
            settingKeys.forEach(settingKey => {
                if (!Me.internalShortcutSettings.get_strv(settingKey)[0])
                    return;
                
                let hbox = new St.BoxLayout({ vertical: false });
                let [keyval, mods] = Gtk.accelerator_parse(Me.internalShortcutSettings.get_strv(settingKey)[0] || '');
                hbox.add_child(new St.Label({ text: Me.internalShortcutSettings.settings_schema.get_key(settingKey).get_summary() }));
                hbox.add_child(new St.Label({ text: Gtk.accelerator_get_label(keyval, mods), x_expand: true }));
                this.vbox.add_child(hbox);
            });
        });
        
        let mediaKeysSettings;
        try { mediaKeysSettings = Convenience.getSettings(MEDIA_KEYS_SCHEMA); } catch(e) { return; }
        
        this.vbox.add_child(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-helper-separator' }));
        this.vbox.add_child(new St.Label({ text: _("System") }));
        
        for (let settingKey of MEDIA_KEYS_KEYS) {
            if (!mediaKeysSettings.settings_schema.has_key(settingKey))
                continue;
            let shortcut = GS_VERSION < '3.33.0' ? mediaKeysSettings.get_string(settingKey) : mediaKeysSettings.get_strv(settingKey)[0];
            if (!shortcut)
                continue;
            let [keyval, mods] = Gtk.accelerator_parse(shortcut || '');
            let hbox = new St.BoxLayout({ vertical: false });
            hbox.add_child(new St.Label({ text: mediaKeysSettings.settings_schema.get_key(settingKey).get_summary() }));
            hbox.add_child(new St.Label({ text: Gtk.accelerator_get_label(keyval, mods), x_expand: true }));
            this.vbox.add_child(hbox);
        }
    },
    
    showHelp: function() {
        if (!this.vbox)
            this._populate();
        
        this.opacity = 0;
        this.show();
        
        let maxHeight = this.monitor.height * 3 / 4;
        this.set_height(Math.min(this.height, maxHeight));
        this.set_position(Math.floor(this.monitor.width / 2 - this.width / 2),
                          Math.floor(this.monitor.height / 2 - this.height / 2));
                          
        if (this.height == maxHeight)
            this.vscrollbar_policy = Gtk.PolicyType.ALWAYS;
        else
            this.vscrollbar_policy = Gtk.PolicyType.NEVER;
        
        Tweener.removeTweens(this);
        Tweener.addTween(this, { opacity: 255,
                                 time: HELPER_ANIMATION_TIME,
                                 transition: 'easeOutQuad',
                                 onComplete: null });
    },
    
    hideHelp: function() {
        Tweener.removeTweens(this);
        Tweener.addTween(this, { opacity: 0,
                                 time: HELPER_ANIMATION_TIME,
                                 transition: 'easeOutQuad',
                                 onComplete: this.hide.bind(this) });
        
    }
});

