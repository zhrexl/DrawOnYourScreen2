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


import GObject from 'gi://GObject';

import { QuickToggle, SystemIndicator, QuickSettingsMenu } from 'resource:///org/gnome/shell/ui/quickSettings.js';
import * as Panel from 'resource:///org/gnome/shell/ui/panel.js';

import * as Config from 'resource:///org/gnome/shell/misc/config.js';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { Files } from './files.js';
import * as AreaManager from './ui/areamanager.js';



const GS_VERSION = Config.PACKAGE_VERSION;



const FeatureToggle = GObject.registerClass(
class FeatureToggle extends QuickToggle {
    _init() {
        super._init({
            title: 'Drawing Mode',
            iconName: 'applications-graphics-symbolic',
            toggleMode: true,
        });
    }
});


const Indicator = GObject.registerClass(
class Indicator extends SystemIndicator {
    _init() {
        super._init();

        this.toggle = new FeatureToggle();
        this.quickSettingsItems.push(this.toggle);
        this._addIndicator();
        
        //Place the toggles above the background apps entry
        // if (GS_VERSION >= 44) {
        //   this.quickSettingsItems.forEach((item) => {
        //     QuickSettingsMenu.menu._grid.set_child_below_sibling(item,
        //       QuickSettingsMenu._backgroundApps.quickSettingsItems[0]);
        //   });
        // }
        
         this.connect('destroy', () => {
            this.quickSettingsItems.forEach(item => item.destroy());
        });
    }
    get_toggle()
    {
        return this.toggle;
    }
});


export default class DrawOnYourScreenExtension extends Extension {

    constructor(metadata) {
        super(metadata);
        this.initTranslations();
        this.FILES = new Files(this);
    }

    create_toggle() {
        if (GS_VERSION >= '44.0') {
            if (!this.getSettings().get_boolean("quicktoggle-disabled") && !this.toggle) {
                this.toggle = new Indicator();
                this.drawingtoggle = this.toggle.get_toggle();
                this.drawingtoggle.connect('clicked',this.toggle_drawing.bind(this));
            } else if (this.getSettings().get_boolean("quicktoggle-disabled") && this.toggle) {
                this.toggle.destroy();
                this.toggle = null;
            }
        }
    }

    enable() {
        this.settings = this.getSettings();
        this.internalShortcutSettings = this.getSettings(this.metadata['settings-schema'] + '.internal-shortcuts');
        this.drawingSettings = this.getSettings(this.metadata['settings-schema'] + '.drawing');
        this.areaManager = new AreaManager.AreaManager(this);
        this.areaManager.enable();
        
        this.toggle = null;
        this.create_toggle();
        
        this.getSettings().connect('changed', this._onSettingsChanged.bind(this));
    }

    disable() {
        if (this.toggle)
            this.toggle.destroy();
        
        this.areaManager.disable();
        delete this.areaManager;
        delete this.settings;
        delete this.internalShortcutSettings;
    }

    toggle_drawing()
    {
        Panel.closeQuickSettings();
        this.drawingtoggle.set_checked(false);
        this.areaManager.toggleDrawing();
    }
    
    _onSettingsChanged() {
        this.create_toggle()
    }
}



