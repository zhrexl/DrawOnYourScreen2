/* jslint esversion: 6 */
/* exported init */

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

const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Config = imports.misc.config;
const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const OsdWindow = imports.ui.osdWindow;
const PanelMenu = imports.ui.panelMenu;

const Me = ExtensionUtils.getCurrentExtension();
const Convenience = ExtensionUtils.getSettings && ExtensionUtils.initTranslations ? ExtensionUtils : Me.imports.convenience;
const Area = Me.imports.area;
const Helper = Me.imports.helper;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const GS_VERSION = Config.PACKAGE_VERSION;
const HIDE_TIMEOUT_LONG = 2500; // ms, default is 1500 ms

// custom Shell.ActionMode, assuming that they are unused
const DRAWING_ACTION_MODE = Math.pow(2,14);
const WRITING_ACTION_MODE = Math.pow(2,15);
// use 'login-dialog-message-warning' class in order to get GS theme warning color (default: #f57900)
const WARNING_COLOR_STYLE_CLASS_NAME = 'login-dialog-message-warning';

function init() {
    return new Extension();
}

const Extension = new Lang.Class({
    Name: 'DrawOnYourScreenExtension',
    
    _init: function() {
        Convenience.initTranslations();
    },

    enable() {
        if (ExtensionUtils.isOutOfDate(Me))
            log(`${Me.metadata.uuid}: GNOME Shell ${Number.parseFloat(GS_VERSION)} is not supported.`);
        
        Me.settings = Convenience.getSettings();
        Me.internalShortcutSettings = Convenience.getSettings(Me.metadata['settings-schema'] + '.internal-shortcuts');
        Me.drawingSettings = Convenience.getSettings(Me.metadata['settings-schema'] + '.drawing');
        this.areaManager = new AreaManager();
    },

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
const AreaManager = new Lang.Class({
    Name: 'DrawOnYourScreenAreaManager',

    _init: function() {
        this.areas = [];
        this.activeArea = null;
        this.enterGicon = new Gio.ThemedIcon({ name: 'applications-graphics-symbolic' });
        this.leaveGicon = new Gio.ThemedIcon({ name: 'application-exit-symbolic' });
        
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
        
        Main.wm.addKeybinding('erase-drawing',
                              Me.settings,
                              Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.ALL,
                              this.eraseDrawing.bind(this));
        
        this.updateAreas();
        this.monitorChangedHandler = Main.layoutManager.connect('monitors-changed', this.updateAreas.bind(this));
        
        this.updateIndicator();
        this.indicatorSettingHandler = Me.settings.connect('changed::indicator-disabled', this.updateIndicator.bind(this));
        
        this.desktopSettingHandler = Me.settings.connect('changed::drawing-on-desktop', this.onDesktopSettingChanged.bind(this));
        this.persistentSettingHandler = Me.settings.connect('changed::persistent-drawing', this.onPersistentSettingChanged.bind(this));
    },
    
    onDesktopSettingChanged: function() {
        if (Me.settings.get_boolean("drawing-on-desktop"))
            this.areas.forEach(area => area.get_parent().show());
        else
            this.areas.forEach(area => area.get_parent().hide());
    },
    
    onPersistentSettingChanged: function() {
        if (Me.settings.get_boolean('persistent-drawing'))
            this.areas[Main.layoutManager.primaryIndex].syncPersistent();
    },
    
    updateIndicator: function() {
        if (this.indicator) {
            this.indicator.disable();
            this.indicator = null;
        }
        if (!Me.settings.get_boolean('indicator-disabled'))
            this.indicator = new DrawingIndicator();
    },
    
    updateAreas: function() {
        if (this.activeArea)
            this.toggleDrawing();
        this.removeAreas();
        
        this.monitors = Main.layoutManager.monitors;
        
        for (let i = 0; i < this.monitors.length; i++) {
            let monitor = this.monitors[i];
            let container = new St.Widget({ name: 'drawOnYourSreenContainer' + i });
            let helper = new Helper.DrawingHelper({ name: 'drawOnYourSreenHelper' + i }, monitor);
            let loadPersistent = i == Main.layoutManager.primaryIndex && Me.settings.get_boolean('persistent-drawing');
            let area = new Area.DrawingArea({ name: 'drawOnYourSreenArea' + i }, monitor, helper, loadPersistent);
            container.add_child(area);
            container.add_child(helper);
            
            Main.layoutManager._backgroundGroup.insert_child_above(container, Main.layoutManager._bgManagers[i].backgroundActor);
            if (!Me.settings.get_boolean("drawing-on-desktop"))
                container.hide();
            
            container.set_position(monitor.x, monitor.y);
            container.set_size(monitor.width, monitor.height);
            area.set_size(monitor.width, monitor.height);
            area.leaveDrawingHandler = area.connect('leave-drawing-mode', this.toggleDrawing.bind(this));
            area.updateActionModeHandler = area.connect('update-action-mode', this.updateActionMode.bind(this));
            area.showOsdHandler = area.connect('show-osd', this.showOsd.bind(this));
            area.showOsdGiconHandler = area.connect('show-osd-gicon', this.showOsd.bind(this));
            this.areas.push(area);
        }
    },
    
    addInternalKeybindings: function() {
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
            'switch-linejoin': this.activeArea.switchLineJoin.bind(this.activeArea),
            'switch-linecap': this.activeArea.switchLineCap.bind(this.activeArea),
            'switch-fill-rule': this.activeArea.switchFillRule.bind(this.activeArea),
            'switch-dash' : this.activeArea.switchDash.bind(this.activeArea),
            'switch-fill' : this.activeArea.switchFill.bind(this.activeArea),
            'switch-image-file' : this.activeArea.switchImageFile.bind(this.activeArea),
            'select-none-shape': () => this.activeArea.selectTool(Area.Tools.NONE),
            'select-line-shape': () => this.activeArea.selectTool(Area.Tools.LINE),
            'select-ellipse-shape': () => this.activeArea.selectTool(Area.Tools.ELLIPSE),
            'select-rectangle-shape': () => this.activeArea.selectTool(Area.Tools.RECTANGLE),
            'select-text-shape': () => this.activeArea.selectTool(Area.Tools.TEXT),
            'select-image-shape': () => this.activeArea.selectTool(Area.Tools.IMAGE),
            'select-polygon-shape': () => this.activeArea.selectTool(Area.Tools.POLYGON),
            'select-polyline-shape': () => this.activeArea.selectTool(Area.Tools.POLYLINE),
            'select-move-tool': () => this.activeArea.selectTool(Area.Tools.MOVE),
            'select-resize-tool': () => this.activeArea.selectTool(Area.Tools.RESIZE),
            'select-mirror-tool': () => this.activeArea.selectTool(Area.Tools.MIRROR)
        };
        
        // available when writing
        this.internalKeybindings2 = {
            'save-as-svg': this.activeArea.saveAsSvg.bind(this.activeArea),
            'save-as-json': this.activeArea.saveAsJson.bind(this.activeArea),
            'open-previous-json': this.activeArea.loadPreviousJson.bind(this.activeArea),
            'open-next-json': this.activeArea.loadNextJson.bind(this.activeArea),
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
    },
    
    removeInternalKeybindings: function() {
        for (let key in this.internalKeybindings1)
            Main.wm.removeKeybinding(key);
        
        for (let key in this.internalKeybindings2)
            Main.wm.removeKeybinding(key);
        
        for (let i = 1; i < 10; i++)
            Main.wm.removeKeybinding('select-color' + i);
    },
    
    openPreferences: function() {
        // since GS 3.36
        if (ExtensionUtils.openPrefs) {
            if (this.activeArea)
                this.toggleDrawing();
            ExtensionUtils.openPrefs();
        }
    },
    
    eraseDrawing: function() {
        for (let i = 0; i < this.areas.length; i++)
            this.areas[i].erase();
        if (Me.settings.get_boolean('persistent-drawing'))
            this.areas[Main.layoutManager.primaryIndex].savePersistent();
    },
    
    togglePanelAndDockOpacity: function() {
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
    },
    
    toggleContainer: function() {
        if (!this.activeArea)
            return;
        
        let activeContainer = this.activeArea.get_parent();
        let activeIndex = this.areas.indexOf(this.activeArea);
        
        if (activeContainer.get_parent() == Main.uiGroup) {
            Main.uiGroup.set_child_at_index(Main.layoutManager.keyboardBox, this.oldKeyboardIndex);
            Main.uiGroup.remove_actor(activeContainer);
            Main.layoutManager._backgroundGroup.insert_child_above(activeContainer, Main.layoutManager._bgManagers[activeIndex].backgroundActor);
            if (!Me.settings.get_boolean("drawing-on-desktop"))
                activeContainer.hide();
        } else {
            Main.layoutManager._backgroundGroup.remove_actor(activeContainer);
            Main.uiGroup.add_child(activeContainer);
            // move the keyboard above the area to make it available with text entries
            this.oldKeyboardIndex = Main.uiGroup.get_children().indexOf(Main.layoutManager.keyboardBox);
            Main.uiGroup.set_child_above_sibling(Main.layoutManager.keyboardBox, activeContainer);
        }
    },
    
    toggleModal: function(source) {
        if (!this.activeArea)
            return;
        
        this.activeArea.closeMenu();
        
        if (Main._findModal(this.activeArea) != -1) {
            Main.popModal(this.activeArea);
            if (source && source == global.display)
                this.showOsd(null, 'touchpad-disabled-symbolic', _("Keyboard and pointer released"), null, null, false);
            this.setCursor('DEFAULT');
            this.activeArea.reactive = false;
            this.removeInternalKeybindings();
        } else {
            // add Shell.ActionMode.NORMAL to keep system keybindings enabled (e.g. Alt + F2 ...)
            let actionMode = (this.activeArea.isWriting ? WRITING_ACTION_MODE : DRAWING_ACTION_MODE) | Shell.ActionMode.NORMAL;
            if (!Main.pushModal(this.activeArea, { actionMode: actionMode }))
                return false;
            this.addInternalKeybindings();
            this.activeArea.reactive = true;
            this.activeArea.initPointerCursor();
            if (source && source == global.display)
                this.showOsd(null, 'input-touchpad-symbolic', _("Keyboard and pointer grabbed"), null, null, false);
        }
        
        return true;
    },
    
    toggleDrawing: function() {
        if (this.activeArea) {
            let activeIndex = this.areas.indexOf(this.activeArea);
            let save = activeIndex == Main.layoutManager.primaryIndex && Me.settings.get_boolean('persistent-drawing');
            
            this.showOsd(null, this.leaveGicon, _("Leaving drawing mode"));
            this.activeArea.leaveDrawingMode(save);
            if (this.hiddenList)
                this.togglePanelAndDockOpacity();
            
            if (Main._findModal(this.activeArea) != -1)
                this.toggleModal();
            this.toggleContainer();
            this.activeArea = null;
        } else {
            // avoid to deal with Meta changes (global.display/global.screen)
            let currentIndex = Main.layoutManager.monitors.indexOf(Main.layoutManager.currentMonitor);
            this.activeArea = this.areas[currentIndex];
            this.toggleContainer();
            if (!this.toggleModal()) {
                this.toggleContainer();
                this.activeArea = null;
                return;
            }
            
            this.activeArea.enterDrawingMode();
            this.osdDisabled = Me.settings.get_boolean('osd-disabled');
            let label = _("<small>Press <i>%s</i> for help</small>").format(this.activeArea.helper.helpKeyLabel) + "\n\n" + _("Entering drawing mode");
            this.showOsd(null, this.enterGicon, label, null, null, true);
        }
        
        if (this.indicator)
            this.indicator.sync(Boolean(this.activeArea));
    },
    
    updateActionMode: function() {
        Main.actionMode = (this.activeArea.isWriting ? WRITING_ACTION_MODE : DRAWING_ACTION_MODE) | Shell.ActionMode.NORMAL;
    },
    
    // Use level -1 to set no level through a signal.
    showOsd: function(emitter, icon, label, color, level, long) {
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
        
        if (icon && typeof icon == 'string')
            icon = new Gio.ThemedIcon({ name: icon });
        else if (!icon)
            icon = this.enterGicon;
        
        let osdWindow = Main.osdWindowManager._osdWindows[activeIndex];
        
        try {
            if (!this.osdWindowConstraint)
                this.osdWindowConstraint = new OsdWindowConstraint();
            
            if (!osdWindow._box.get_constraint(this.osdWindowConstraint.constructor.name)) {
                osdWindow._box.remove_constraint(osdWindow._boxConstraint);
                osdWindow._box.add_constraint_with_name(this.osdWindowConstraint.constructor.name, this.osdWindowConstraint);
                this.osdWindowConstraint._minSize = osdWindow._boxConstraint._minSize;
                osdWindow._boxConstraintOld = osdWindow._boxConstraint;
                osdWindow._boxConstraint = this.osdWindowConstraint;
                let osdConstraintHandler = osdWindow._box.connect('notify::mapped', (box) => {
                    if (!box.mapped) {
                        osdWindow._boxConstraint = osdWindow._boxConstraintOld;
                        osdWindow._boxConstraint._minSize = this.osdWindowConstraint._minSize;
                        osdWindow._box.remove_constraint(this.osdWindowConstraint);
                        osdWindow._box.add_constraint(osdWindow._boxConstraint);
                        osdWindow._box.disconnect(osdConstraintHandler);
                    }
                });
            }
        } catch(e) {
            logError(e);
        }
        
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
    },
    
    setCursor: function(cursorName) {
        // check display or screen (API changes)
        if (global.display.set_cursor)
            global.display.set_cursor(Meta.Cursor[cursorName]);
        else if (global.screen && global.screen.set_cursor)
            global.screen.set_cursor(Meta.Cursor[cursorName]);
    },
    
    removeAreas: function() {
        for (let i = 0; i < this.areas.length; i++) {
            let area = this.areas[i];
            area.disconnect(area.leaveDrawingHandler);
            area.disconnect(area.updateActionModeHandler);
            area.disconnect(area.showOsdHandler);
            area.disconnect(area.showOsdGiconHandler);
            let container = area.get_parent();
            container.get_parent().remove_actor(container);
            container.destroy();
        }
        this.areas = [];
    },
    
    disable: function() {
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
        if (this.persistentSettingHandler) {
            Me.settings.disconnect(this.persistentSettingHandler);
            this.persistentSettingHandler = null;
        }
        
        if (this.activeArea)
            this.toggleDrawing();
        Main.wm.removeKeybinding('toggle-drawing');
        Main.wm.removeKeybinding('toggle-modal');
        Main.wm.removeKeybinding('erase-drawing');
        this.removeAreas();
        if (this.indicator)
            this.indicator.disable();
    }
});

// The same as the original, without forcing a ratio of 1.
const OsdWindowConstraint = new Lang.Class({
    Name: 'DrawOnYourScreenOsdWindowConstraint',
    Extends: OsdWindow.OsdWindowConstraint,

    vfunc_update_allocation: function(actor, actorBox) {
        // Clutter will adjust the allocation for margins,
        // so add it to our minimum size
        let minSize = this._minSize + actor.margin_top + actor.margin_bottom;
        let [width, height] = actorBox.get_size();

        // DO NOT Enforce a ratio of 1
        let newWidth = Math.ceil(Math.max(minSize, width, height));
        let newHeight = Math.ceil(Math.max(minSize, height));
        actorBox.set_size(newWidth, newHeight);

        // Recenter
        let [x, y] = actorBox.get_origin();
        actorBox.set_origin(Math.ceil(x + width / 2 - newWidth / 2),
                            Math.ceil(y + height / 2 - newHeight / 2));
    }
});

const DrawingIndicator = new Lang.Class({
    Name: 'DrawOnYourScreenIndicator',

    _init: function() {
        let [menuAlignment, dontCreateMenu] = [0, true];
        this.button = new PanelMenu.Button(menuAlignment, "Drawing Indicator", dontCreateMenu);
        this.buttonActor = GS_VERSION < '3.33.0' ? this.button.actor: this.button;
        Main.panel.addToStatusArea('draw-on-your-screen-indicator', this.button);
        
        this.icon = new St.Icon({ icon_name: 'applications-graphics-symbolic',
                                  style_class: 'system-status-icon screencast-indicator' });
        this.buttonActor.add_child(this.icon);
        this.buttonActor.visible = false;
    },

    sync: function(visible) {
        this.buttonActor.visible = visible;
    },
    
    disable: function() {
        this.button.destroy();
    }
});

