/*
 * Copyright 2019 Abakkk
 * Copyright 2023 zhrexl
 
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
/* exported init */

const {Gio, GObject} = imports.gi;
const {QuickToggle, SystemIndicator} = imports.ui.quickSettings;
const QuickSettingsMenu = imports.ui.main.panel.statusArea.quickSettings;
const Panel             = imports.ui.main.panel;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const AreaManager = Me.imports.ui.areamanager;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const UUID = Me.uuid.replace(/@/gi, '_at_').replace(/[^a-z0-9+_-]/gi, '_');

const Config = imports.misc.config;
const GS_VERSION = Config.PACKAGE_VERSION;

function init() {
    return new Extension();
}

const FeatureToggle = GObject.registerClass(
class FeatureToggle extends QuickToggle {
    _init() {
        super._init({
            title: 'Drawing Mode',
            iconName: 'applications-graphics-symbolic',
            toggleMode: true,
        });
        
        
        // NOTE: In GNOME 44, the `label` property must be set after
        // construction. The newer `title` property can be set at construction.
       // this.label = 'Feature Name';

        // Binding the toggle to a GSettings key
        //this._settings = new Gio.Settings({
        //    schema_id: 'org.gnome.shell.extensions.example',
        //});

        //this._settings.bind('feature-enabled',
        //    this, 'checked',
        //    Gio.SettingsBindFlags.DEFAULT);
    }
});
var Indicator = GObject.registerClass(
class Indicator extends SystemIndicator {
    _init() {
        super._init();

        this.toggle = new FeatureToggle();
        this.quickSettingsItems.push(this.toggle);
        QuickSettingsMenu._indicators.add_child(this);
        QuickSettingsMenu._addItems(this.quickSettingsItems);
        
        //Place the toggles above the background apps entry
        if (GS_VERSION >= 44) {
          this.quickSettingsItems.forEach((item) => {
            QuickSettingsMenu.menu._grid.set_child_below_sibling(item,
              QuickSettingsMenu._backgroundApps.quickSettingsItems[0]);
          });
        }
        
         this.connect('destroy', () => {
            this.quickSettingsItems.forEach(item => item.destroy());
        });
    }
    get_toggle()
    {
        return this.toggle;
    }
});

const Extension = GObject.registerClass({
    GTypeName: `${UUID}-Extension`,
}, class Extension extends GObject.Object{
    _init() {
        ExtensionUtils.initTranslations();
    }

    enable() {
        if (ExtensionUtils.isOutOfDate(Me))
            log(`${Me.metadata.uuid}: GNOME Shell ${Number.parseFloat(GS_VERSION)} is not supported.`);
        this.toggle = null;
        
        if (GS_VERSION >= '44.0') {
            this.toggle = new Indicator();
            this.drawingtoggle = this.toggle.get_toggle();
            this.drawingtoggle.connect('clicked',this.toggle_drawing.bind(this));
        }
        Me.settings = ExtensionUtils.getSettings();
        Me.internalShortcutSettings = ExtensionUtils.getSettings(Me.metadata['settings-schema'] + '.internal-shortcuts');
        Me.drawingSettings = ExtensionUtils.getSettings(Me.metadata['settings-schema'] + '.drawing');
        this.areaManager = new AreaManager.AreaManager();
    }
    toggle_drawing()
    {
        Panel.closeQuickSettings();
        this.drawingtoggle.set_checked(false);
        this.areaManager.toggleDrawing();
    }
    disable() {
        if (this.toggle)
            this.toggle.destroy();
        
        this.areaManager.disable();
        delete this.areaManager;
        delete Me.settings;
        delete Me.internalShortcutSettings;
    }
});



