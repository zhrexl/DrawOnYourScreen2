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
/* exported init */

const GObject = imports.gi.GObject;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;
const Clutter = imports.gi.Clutter;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const OsdWindow = imports.ui.osdWindow;
const PanelMenu = imports.ui.panelMenu;

const Me = ExtensionUtils.getCurrentExtension();
const Convenience = ExtensionUtils.getSettings && ExtensionUtils.initTranslations ? ExtensionUtils : Me.imports.convenience;
const Area = Me.imports.area;
const Files = Me.imports.files;
const Helper = Me.imports.helper;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const GS_VERSION = Config.PACKAGE_VERSION;
const HIDE_TIMEOUT_LONG = 2500; // ms, default is 1500 ms
const UUID = Me.uuid.replace(/@/gi, '_at_').replace(/[^a-z0-9+_-]/gi, '_');

// custom Shell.ActionMode, assuming that they are unused
const DRAWING_ACTION_MODE = Math.pow(2,14);
const WRITING_ACTION_MODE = Math.pow(2,15);
// use 'login-dialog-message-warning' class in order to get GS theme warning color (default: #f57900)
const WARNING_COLOR_STYLE_CLASS_NAME = 'login-dialog-message-warning';

function init() {
    return new Extension();
}

const Extension = GObject.registerClass({
    GTypeName: `${UUID}-Extension`,
}, class Extension extends GObject.Object{
    _init() {
        Convenience.initTranslations();
    }

    enable() {
        if (ExtensionUtils.isOutOfDate(Me))
            log(`${Me.metadata.uuid}: GNOME Shell ${Number.parseFloat(GS_VERSION)} is not supported.`);
        
        Me.settings = Convenience.getSettings();
        Me.internalShortcutSettings = Convenience.getSettings(Me.metadata['settings-schema'] + '.internal-shortcuts');
        Me.drawingSettings = Convenience.getSettings(Me.metadata['settings-schema'] + '.drawing');
        this.areaManager = new AreaManager();
    }

    disable() {
        this.areaManager.disable();
        delete this.areaManager;
        delete Me.settings;
        delete Me.internalShortcutSettings;
    }
});

// AreaManager assigns one DrawingArea per monitor (updateAreas()),
// distributes keybinding callbacks to the active area
// and handles stylesheet and monitor changes.
const AreaManager = GObject.registerClass({
    GTypeName: `${UUID}-AreaManager`,
}, class AreaManager extends GObject.Object{
    _init() {
        this.areas = [];
        this.activeArea = null;
        this.grab = null;
        
        Main.wm.addKeybinding('toggle-drawing',
                              Me.settings,
                              Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.ALL,
                              this.toggleDrawing.bind(this));
        
        Main.wm.addKeybinding('toggle-modal',
                              Me.settings,
                              Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.ALL,
                              this.toggleModal.bind(this));
        
        Main.wm.addKeybinding('erase-drawings',
                              Me.settings,
                              Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.ALL,
                              this.eraseDrawings.bind(this));
        
        this.updateAreas();
        this.monitorChangedHandler = Main.layoutManager.connect('monitors-changed', this.updateAreas.bind(this));
        
        this.updateIndicator();
        this.indicatorSettingHandler = Me.settings.connect('changed::indicator-disabled', this.updateIndicator.bind(this));
        
        this.desktopSettingHandler = Me.settings.connect('changed::drawing-on-desktop', this.onDesktopSettingChanged.bind(this));
        this.persistentOverRestartsSettingHandler = Me.settings.connect('changed::persistent-over-restarts', this.onPersistentOverRestartsSettingChanged.bind(this));
        this.persistentOverTogglesSettingHandler = Me.settings.connect('changed::persistent-over-toggles', this.onPersistentOverTogglesSettingChanged.bind(this));
    }
    
    get persistentOverToggles() {
        return Me.settings.get_boolean('persistent-over-toggles');
    }
    
    get persistentOverRestarts() {
        return Me.settings.get_boolean('persistent-over-toggles') && Me.settings.get_boolean('persistent-over-restarts');
    }
    
    get onDesktop() {
        return Me.settings.get_boolean('persistent-over-toggles') && Me.settings.get_boolean('drawing-on-desktop');
    }
    
    onDesktopSettingChanged() {
        if (this.onDesktop)
            this.areas.forEach(area => area.show());
        else
            this.areas.forEach(area => area.hide());
    }
    
    onPersistentOverRestartsSettingChanged() {
        if (this.persistentOverRestarts)
            this.areas[Main.layoutManager.primaryIndex].syncPersistent();
    }
    
    onPersistentOverTogglesSettingChanged() {
        if (!this.persistentOverToggles && !this.activeArea)
            this.eraseDrawings();
            
        this.onPersistentOverRestartsSettingChanged();
        this.onDesktopSettingChanged();
    }
    
    updateIndicator() {
        if (this.indicator) {
            this.indicator.disable();
            this.indicator = null;
        }
        if (!Me.settings.get_boolean('indicator-disabled'))
            this.indicator = new DrawingIndicator();
    }
    
    updateAreas() {
        if (this.activeArea)
            this.toggleDrawing();
        this.removeAreas();
        
        this.monitors = Main.layoutManager.monitors;
        
        for (let i = 0; i < this.monitors.length; i++) {
            let monitor = this.monitors[i];
            let helper = new Helper.DrawingHelper({ name: 'drawOnYourSreenHelper' + i }, monitor);
            let loadPersistent = i == Main.layoutManager.primaryIndex && this.persistentOverRestarts;
            // Some utils for the drawing area menus.
            let areaManagerUtils = {
                getHiddenList: () => this.hiddenList || null,
                togglePanelAndDockOpacity: this.togglePanelAndDockOpacity.bind(this),
                openPreferences: this.openPreferences.bind(this)
            };
            let area = new Area.DrawingArea({ name: 'drawOnYourSreenArea' + i }, monitor, helper, areaManagerUtils, loadPersistent);
            
            Main.layoutManager._backgroundGroup.insert_child_above(area, Main.layoutManager._bgManagers[i].backgroundActor);
            if (!this.onDesktop)
                area.hide();
            
            area.set_position(monitor.x, monitor.y);
            area.set_size(monitor.width, monitor.height);
            area.leaveDrawingHandler = area.connect('leave-drawing-mode', this.toggleDrawing.bind(this));
            area.updateActionModeHandler = area.connect('update-action-mode', this.updateActionMode.bind(this));
            area.pointerCursorChangedHandler = area.connect('pointer-cursor-changed', this.setCursor.bind(this));
            area.showOsdHandler = area.connect('show-osd', this.showOsd.bind(this));
            this.areas.push(area);
        }
    }
    
    addInternalKeybindings() {
        // unavailable when writing
        this.internalKeybindings1 = {
            'undo': this.activeArea.undo.bind(this.activeArea),
            'redo': this.activeArea.redo.bind(this.activeArea),
            'delete-last-element': this.activeArea.deleteLastElement.bind(this.activeArea),
            'smooth-last-element': this.activeArea.smoothLastElement.bind(this.activeArea),
            'increment-line-width': () => this.activeArea.incrementLineWidth(1),
            'decrement-line-width': () => this.activeArea.incrementLineWidth(-1),
            'increment-line-width-more': () => this.activeArea.incrementLineWidth(5),
            'decrement-line-width-more': () => this.activeArea.incrementLineWidth(-5),
            'paste-image-files': this.activeArea.pasteImageFiles.bind(this.activeArea),
            'switch-linejoin': this.activeArea.switchLineJoin.bind(this.activeArea),
            'switch-linecap': this.activeArea.switchLineCap.bind(this.activeArea),
            'switch-fill-rule': this.activeArea.switchFillRule.bind(this.activeArea),
            'switch-dash' : this.activeArea.switchDash.bind(this.activeArea),
            'switch-fill' : this.activeArea.switchFill.bind(this.activeArea),
            'switch-image-file' : this.activeArea.switchImageFile.bind(this.activeArea, false),
            'switch-image-file-reverse' : this.activeArea.switchImageFile.bind(this.activeArea, true),
            'select-none-shape': () => this.activeArea.selectTool(Area.Tool.NONE),
            'select-line-shape': () => this.activeArea.selectTool(Area.Tool.LINE),
            'select-ellipse-shape': () => this.activeArea.selectTool(Area.Tool.ELLIPSE),
            'select-rectangle-shape': () => this.activeArea.selectTool(Area.Tool.RECTANGLE),
            'select-text-shape': () => this.activeArea.selectTool(Area.Tool.TEXT),
            'select-image-shape': () => this.activeArea.selectTool(Area.Tool.IMAGE),
            'select-polygon-shape': () => this.activeArea.selectTool(Area.Tool.POLYGON),
            'select-polyline-shape': () => this.activeArea.selectTool(Area.Tool.POLYLINE),
            'select-move-tool': () => this.activeArea.selectTool(Area.Tool.MOVE),
            'select-resize-tool': () => this.activeArea.selectTool(Area.Tool.RESIZE),
            'select-mirror-tool': () => this.activeArea.selectTool(Area.Tool.MIRROR)
        };
        
        // available when writing
        this.internalKeybindings2 = {
            'export-to-svg': this.activeArea.exportToSvg.bind(this.activeArea),
            'save-as-json': this.activeArea.saveAsJson.bind(this.activeArea, true, null),
            'open-previous-json': this.activeArea.loadPreviousJson.bind(this.activeArea),
            'open-next-json': this.activeArea.loadNextJson.bind(this.activeArea),
            'pick-color': this.activeArea.pickColor.bind(this.activeArea),
            'toggle-background': this.activeArea.toggleBackground.bind(this.activeArea),
            'toggle-grid': this.activeArea.toggleGrid.bind(this.activeArea),
            'toggle-square-area': this.activeArea.toggleSquareArea.bind(this.activeArea),
            'switch-color-palette': this.activeArea.switchColorPalette.bind(this.activeArea, false),
            'switch-color-palette-reverse': this.activeArea.switchColorPalette.bind(this.activeArea, true),
            'switch-font-family': this.activeArea.switchFontFamily.bind(this.activeArea, false),
            'switch-font-family-reverse': this.activeArea.switchFontFamily.bind(this.activeArea, true),
            'switch-font-weight': this.activeArea.switchFontWeight.bind(this.activeArea),
            'switch-font-style': this.activeArea.switchFontStyle.bind(this.activeArea),
            'switch-text-alignment': this.activeArea.switchTextAlignment.bind(this.activeArea),
            'toggle-panel-and-dock-visibility': this.togglePanelAndDockOpacity.bind(this),
            'toggle-help': this.activeArea.toggleHelp.bind(this.activeArea),
            'open-preferences': this.openPreferences.bind(this)
        };
        
        for (let key in this.internalKeybindings1) {
            Main.wm.addKeybinding(key,
                                  Me.internalShortcutSettings,
                                  Meta.KeyBindingFlags.NONE,
                                  DRAWING_ACTION_MODE,
                                  this.internalKeybindings1[key]);
        }
        
        for (let key in this.internalKeybindings2) {
            Main.wm.addKeybinding(key,
                                  Me.internalShortcutSettings,
                                  Meta.KeyBindingFlags.NONE,
                                  DRAWING_ACTION_MODE | WRITING_ACTION_MODE,
                                  this.internalKeybindings2[key]);
        }
        
        for (let i = 1; i < 10; i++) {
            let iCaptured = i;
            Main.wm.addKeybinding('select-color' + i,
                                  Me.internalShortcutSettings,
                                  Meta.KeyBindingFlags.NONE,
                                  DRAWING_ACTION_MODE | WRITING_ACTION_MODE,
                                  this.activeArea.selectColor.bind(this.activeArea, iCaptured - 1));
        }
    }
    
    removeInternalKeybindings() {
        for (let key in this.internalKeybindings1)
            Main.wm.removeKeybinding(key);
        
        for (let key in this.internalKeybindings2)
            Main.wm.removeKeybinding(key);
        
        for (let i = 1; i < 10; i++)
            Main.wm.removeKeybinding('select-color' + i);
    }
    
    openPreferences() {
        // since GS 3.36
        if (ExtensionUtils.openPrefs) {
            if (this.activeArea)
                this.toggleDrawing();
            ExtensionUtils.openPrefs();
        }
    }
    
    eraseDrawings() {
        for (let i = 0; i < this.areas.length; i++)
            this.areas[i].erase();
        if (this.persistentOverRestarts)
            this.areas[Main.layoutManager.primaryIndex].savePersistent();
    }
    
    togglePanelAndDockOpacity() {
        if (this.hiddenList) {
            for (let i = 0; i < this.hiddenList.length; i++) {
                this.hiddenList[i].actor.set_opacity(this.hiddenList[i].oldOpacity);
            }
            this.hiddenList = null;
        } else {
            let activeIndex = this.areas.indexOf(this.activeArea);
            
            // dash-to-dock
            let dtdContainers = Main.uiGroup.get_children().filter((actor) => {
                return actor.name && actor.name == 'dashtodockContainer' &&
                       ((actor._delegate &&
                       actor._delegate._monitorIndex !== undefined &&
                       actor._delegate._monitorIndex == activeIndex) ||
                       // dtd v68+
                       (actor._monitorIndex !== undefined &&
                       actor._monitorIndex == activeIndex));
            });
            
            // for simplicity, we assume that main dash-to-panel panel is displayed on primary monitor
            // and we hide all secondary panels together if the active area is not on the primary
            let name = activeIndex == Main.layoutManager.primaryIndex ? 'panelBox' : 'dashtopanelSecondaryPanelBox';
            let panelBoxes = Main.uiGroup.get_children().filter((actor) => {
                return actor.name && actor.name == name ||
                       // dtp v37+
                       actor.get_children().length && actor.get_children()[0].name && actor.get_children()[0].name == name;
            });
            
            let actorToHide = dtdContainers.concat(panelBoxes);
            this.hiddenList = [];
            for (let i = 0; i < actorToHide.length; i++) {
                this.hiddenList.push({ actor: actorToHide[i], oldOpacity: actorToHide[i].get_opacity() });
                actorToHide[i].set_opacity(0);
            }
        }
    }
    
    toggleArea() {
        if (!this.activeArea)
            return;
        
        let activeIndex = this.areas.indexOf(this.activeArea);
        
        if (this.activeArea.get_parent() == Main.uiGroup) {
            Main.uiGroup.set_child_at_index(Main.layoutManager.keyboardBox, this.oldKeyboardIndex);
            Main.uiGroup.remove_actor(this.activeArea);
            Main.layoutManager._backgroundGroup.insert_child_above(this.activeArea, Main.layoutManager._bgManagers[activeIndex].backgroundActor);
            if (!this.onDesktop)
                this.activeArea.hide();
        } else {
            Main.layoutManager._backgroundGroup.remove_actor(this.activeArea);
            Main.uiGroup.add_child(this.activeArea);
            // move the keyboard above the area to make it available with text entries
            this.oldKeyboardIndex = Main.uiGroup.get_children().indexOf(Main.layoutManager.keyboardBox);
            Main.uiGroup.set_child_above_sibling(Main.layoutManager.keyboardBox, this.activeArea);
        }
    }
    
    toggleModal(source) {
        if (!this.activeArea)
            return;

        this.activeArea.closeMenu();

        if (Main._findModal(this.grab) != -1) {
            Main.popModal(this.grab);
            if (source && source == global.display)
              this.showOsd(null, Files.Icons.UNGRAB, _("Keyboard and pointer released"), null, null, false);
                // Translators: "released" as the opposite of "grabbed"


            this.setCursor(null, 'DEFAULT');
            this.activeArea.reactive = false;
            this.removeInternalKeybindings();

        } else {
            // add Shell.ActionMode.NORMAL to keep system keybindings enabled (e.g. Alt + F2 ...)
            let actionMode = (this.activeArea.isWriting ? WRITING_ACTION_MODE : DRAWING_ACTION_MODE) | Shell.ActionMode.NORMAL;
            this.grab = Main.pushModal(this.activeArea, { actionMode: actionMode });
            if (this.grab.get_seat_state() === Clutter.GrabState.NONE) {
                Main.popModal(this.grab);
                return false;
            }
            this.addInternalKeybindings();
            this.activeArea.reactive = true;
            this.activeArea.initPointerCursor();
            if (source && source == global.display)
                this.showOsd(null, Files.Icons.GRAB, _("Keyboard and pointer grabbed"), null, null, false);
        }
        
        return true;
    }
    
    toggleDrawing() {
        if (this.activeArea) {
            let activeIndex = this.areas.indexOf(this.activeArea);
            let save = activeIndex == Main.layoutManager.primaryIndex && this.persistentOverRestarts;
            let erase = !this.persistentOverToggles;

            this.showOsd(null, Files.Icons.LEAVE, _("Leaving drawing mode"));
            this.activeArea.leaveDrawingMode(save, erase);

            if (this.hiddenList)
                this.togglePanelAndDockOpacity();
            
            if (Main._findModal(this.grab) != -1)
                this.toggleModal();

            this.toggleArea();
            this.activeArea = null;
        } else {
            // avoid to deal with Meta changes (global.display/global.screen)
            let currentIndex = Main.layoutManager.monitors.indexOf(Main.layoutManager.currentMonitor);
            this.activeArea = this.areas[currentIndex];
            this.toggleArea();
            if (!this.toggleModal()) {
                this.toggleArea();
                this.activeArea = null;
                return;
            }
            
            this.activeArea.enterDrawingMode();
            this.osdDisabled = Me.settings.get_boolean('osd-disabled');
            // <span size="medium"> is a clutter/mutter 3.38 bug workaround: https://gitlab.gnome.org/GNOME/mutter/-/issues/1467
            // Translators: %s is a key label
            let label = `<small>${_("Press <i>%s</i> for help").format(this.activeArea.helper.helpKeyLabel)}</small>\n\n<span size="medium">${_("Entering drawing mode")}</span>`;
            this.showOsd(null, Files.Icons.ENTER, label, null, null, true);
        }
        
        if (this.indicator)
            this.indicator.sync(Boolean(this.activeArea));
    }
    
    updateActionMode() {
        Main.actionMode = (this.activeArea.isWriting ? WRITING_ACTION_MODE : DRAWING_ACTION_MODE) | Shell.ActionMode.NORMAL;
    }
    
    // Use level -1 to set no level through a signal.
    showOsd(emitter, icon, label, color, level, long) {
        let activeIndex = this.areas.indexOf(this.activeArea);
        if (activeIndex == -1 || this.osdDisabled)
            return;
        
        let hideTimeoutSave;
        if (long && GS_VERSION >= '3.28.0') {
            hideTimeoutSave = OsdWindow.HIDE_TIMEOUT;
            OsdWindow.HIDE_TIMEOUT = HIDE_TIMEOUT_LONG;
        }
        
        let maxLevel;
        if (level == -1)
            level = null;
        else if (level > 100)
            maxLevel = 2;
        
        // GS 3.32- : bar from 0 to 100
        // GS 3.34+ : bar from 0 to 1
        if (level && GS_VERSION > '3.33.0')
            level = level / 100;
        
        if (!icon)
            icon = Files.Icons.ENTER;
        
        let osdWindow = Main.osdWindowManager._osdWindows[activeIndex];

        Main.osdWindowManager.show(activeIndex, icon, label, level, maxLevel);
        osdWindow._label.get_clutter_text().set_use_markup(true);
        
        if (color) {
            osdWindow._icon.set_style(`color:${color};`);
            osdWindow._label.set_style(`color:${color};`);
            let osdColorChangedHandler = osdWindow._label.connect('notify::text', () => {
                osdWindow._icon.set_style(`color:;`);
                osdWindow._label.set_style(`color:;`);
                osdWindow._label.disconnect(osdColorChangedHandler);
            });
        }
        
        if (level === 0) {
            osdWindow._label.add_style_class_name(WARNING_COLOR_STYLE_CLASS_NAME);
            // the same label is shared by all GS OSD so the style must be removed after being used
            let osdLabelChangedHandler = osdWindow._label.connect('notify::text', () => {
                osdWindow._label.remove_style_class_name(WARNING_COLOR_STYLE_CLASS_NAME);
                osdWindow._label.disconnect(osdLabelChangedHandler);
            });
        }
        
        if (hideTimeoutSave)
            OsdWindow.HIDE_TIMEOUT = hideTimeoutSave;
    }
    
    setCursor(sourceActor_, cursorName) {
        // check display or screen (API changes)
        if (global.display.set_cursor)
            global.display.set_cursor(Meta.Cursor[cursorName]);
        else if (global.screen && global.screen.set_cursor)
            global.screen.set_cursor(Meta.Cursor[cursorName]);
    }
    
    removeAreas() {
        for (let i = 0; i < this.areas.length; i++) {
            let area = this.areas[i];
            area.disconnect(area.leaveDrawingHandler);
            area.disconnect(area.updateActionModeHandler);
            area.disconnect(area.showOsdHandler);
            area.destroy();
        }
        this.areas = [];
    }
    
    disable() {
        if (this.monitorChangedHandler) {
            Main.layoutManager.disconnect(this.monitorChangedHandler);
            this.monitorChangedHandler = null;
        }
        if (this.indicatorSettingHandler) {
            Me.settings.disconnect(this.indicatorSettingHandler);
            this.indicatorSettingHandler = null;
        }
        if (this.desktopSettingHandler) {
            Me.settings.disconnect(this.desktopSettingHandler);
            this.desktopSettingHandler = null;
        }
        if (this.persistentOverTogglesSettingHandler) {
            Me.settings.disconnect(this.persistentOverTogglesSettingHandler);
            this.persistentOverTogglesSettingHandler = null;
        }
        if (this.persistentOverRestartsSettingHandler) {
            Me.settings.disconnect(this.persistentOverRestartsSettingHandler);
            this.persistentOverRestartsSettingHandler = null;
        }
        
        if (this.activeArea)
            this.toggleDrawing();
        Main.wm.removeKeybinding('toggle-drawing');
        Main.wm.removeKeybinding('toggle-modal');
        Main.wm.removeKeybinding('erase-drawings');
        this.removeAreas();
        Files.Images.disable();
        Files.Jsons.disable();
        if (this.indicator)
            this.indicator.disable();
    }
});

const DrawingIndicator = GObject.registerClass({
    GTypeName: `${UUID}-Indicator`,
}, class DrawingIndicator extends GObject.Object{

    _init() {
        let [menuAlignment, dontCreateMenu] = [0, true];
        this.button = new PanelMenu.Button(menuAlignment, "Drawing Indicator", dontCreateMenu);
        this.buttonActor = GS_VERSION < '3.33.0' ? this.button.actor: this.button;
        Main.panel.addToStatusArea('draw-on-your-screen-indicator', this.button);
        
        this.icon = new St.Icon({ icon_name: 'applications-graphics-symbolic',
                                  style_class: 'system-status-icon screencast-indicator' });
        this.buttonActor.add_child(this.icon);
        this.buttonActor.visible = false;
    }

    sync(visible) {
        this.buttonActor.visible = visible;
    }
    
    disable() {
        this.button.destroy();
    }
});


