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

const GObject = imports.gi.GObject;
const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const AreaManager = Me.imports.ui.areamanager;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;
const UUID = Me.uuid.replace(/@/gi, '_at_').replace(/[^a-z0-9+_-]/gi, '_');

function init() {
    return new Extension();
}

const Extension = GObject.registerClass({
    GTypeName: `${UUID}-Extension`,
}, class Extension extends GObject.Object{
    _init() {
        ExtensionUtils.initTranslations();
    }

    enable() {
        if (ExtensionUtils.isOutOfDate(Me))
            log(`${Me.metadata.uuid}: GNOME Shell ${Number.parseFloat(GS_VERSION)} is not supported.`);
        
        Me.settings = ExtensionUtils.getSettings();
        Me.internalShortcutSettings = ExtensionUtils.getSettings(Me.metadata['settings-schema'] + '.internal-shortcuts');
        Me.drawingSettings = ExtensionUtils.getSettings(Me.metadata['settings-schema'] + '.drawing');
        this.areaManager = new AreaManager.AreaManager();
    }

    disable() {
        this.areaManager.disable();
        delete this.areaManager;
        delete Me.settings;
        delete Me.internalShortcutSettings;
    }
});



