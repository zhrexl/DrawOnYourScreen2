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

const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Meta = imports.gi.Meta;
const Shell = imports.gi.Shell;
const St = imports.gi.St;

const Config = imports.misc.config;
const Main = imports.ui.main;
const OsdWindow = imports.ui.osdWindow;
const PanelMenu = imports.ui.panelMenu;

const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Extension.imports.convenience;
const Draw = Extension.imports.draw;
const _ = imports.gettext.domain(Extension.metadata["gettext-domain"]).gettext;

const GS_VERSION = Config.PACKAGE_VERSION;

// DRAWING_ACTION_MODE is a custom Shell.ActionMode
var DRAWING_ACTION_MODE = Math.pow(2,14);
// use 'login-dialog-message-warning' class in order to get GS theme warning color (default: #f57900)
var WARNING_COLOR_STYLE_CLASS_NAME = 'login-dialog-message-warning';

let manager;

function init() {
    Convenience.initTranslations();
}

function enable() {
    manager = new AreaManager();
}

function disable() {
    manager.disable();
    manager = null;
}

// AreaManager assigns one DrawingArea per monitor (updateAreas()),
// distributes keybinding callbacks to the active area
// and handles stylesheet and monitor changes.
var AreaManager = new Lang.Class({
    Name: 'DrawOnYourScreenAreaManager',

    _init: function() {
        this.settings = Convenience.getSettings();
        this.areas = [];
        this.activeArea = null;
        this.enterGicon = new Gio.ThemedIcon({ name: 'applications-graphics-symbolic' });
        this.leaveGicon = new Gio.ThemedIcon({ name: 'application-exit-symbolic' });
        
        Main.wm.addKeybinding('toggle-drawing',
                              this.settings,
                              Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.ALL,
                              this.toggleDrawing.bind(this));
        
        Main.wm.addKeybinding('erase-drawing',
                              this.settings,
                              Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.ALL,
                              this.eraseDrawing.bind(this));
        
        this.updateAreas();
        this.monitorChangedHandler = Main.layoutManager.connect('monitors-changed', this.updateAreas.bind(this));
        
        this.updateIndicator();
        this.indicatorSettingHandler = this.settings.connect('changed::indicator-disabled', this.updateIndicator.bind(this));
        
        this.desktopSettingHandler = this.settings.connect('changed::drawing-on-desktop', this.onDesktopSettingChanged.bind(this));
        this.persistentSettingHandler = this.settings.connect('changed::persistent-drawing', this.onPersistentSettingChanged.bind(this));
        
        if (Extension.stylesheet) {
            this.stylesheetMonitor = Extension.stylesheet.monitor(Gio.FileMonitorFlags.NONE, null);
            this.stylesheetChangedHandler = this.stylesheetMonitor.connect('changed', (monitor, file, otherFile, eventType) => {
                if ((eventType != 0 && eventType != 3) || !Extension.stylesheet.query_exists(null))
                    return;
                let theme = St.ThemeContext.get_for_stage(global.stage).get_theme();
                theme.unload_stylesheet(Extension.stylesheet);
                theme.load_stylesheet(Extension.stylesheet);
            });
        }
    },
    
    onDesktopSettingChanged: function() {
        if (this.settings.get_boolean("drawing-on-desktop"))
            this.areas.forEach(area => area.get_parent().show());
        else
            this.areas.forEach(area => area.get_parent().hide());
    },
    
    onPersistentSettingChanged: function() {
        if (this.settings.get_boolean('persistent-drawing'))
            this.areas[Main.layoutManager.primaryIndex].saveAsJson();
    },
    
    updateIndicator: function() {
        if (this.indicator) {
            this.indicator.disable();
            this.indicator = null;
        }
        if (!this.settings.get_boolean('indicator-disabled'))
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
            let helper = new Draw.DrawingHelper({ name: 'drawOnYourSreenHelper' + i }, monitor);
            let load = i == Main.layoutManager.primaryIndex && this.settings.get_boolean('persistent-drawing');
            let area = new Draw.DrawingArea({ name: 'drawOnYourSreenArea' + i }, monitor, helper, load);
            container.add_child(area);
            container.add_child(helper);
            
            Main.layoutManager._backgroundGroup.insert_child_above(container, Main.layoutManager._bgManagers[i].backgroundActor);
            if (!this.settings.get_boolean("drawing-on-desktop")) 
                container.hide();
            
            container.set_position(monitor.x, monitor.y);
            container.set_size(monitor.width, monitor.height);
            area.set_size(monitor.width, monitor.height);
            area.emitter.stopDrawingHandler = area.emitter.connect('stop-drawing', this.toggleDrawing.bind(this));
            area.emitter.showOsdHandler = area.emitter.connect('show-osd', this.showOsd.bind(this));
            this.areas.push(area);
        }
    },
    
    addInternalKeybindings: function() {
        this.internalKeybindings = {
            'undo': this.activeArea.undo.bind(this.activeArea),
            'redo': this.activeArea.redo.bind(this.activeArea),
            'delete-last-element': this.activeArea.deleteLastElement.bind(this.activeArea),
            'smooth-last-element': this.activeArea.smoothLastElement.bind(this.activeArea),
            'save-as-svg': this.activeArea.saveAsSvg.bind(this.activeArea),
            'toggle-background': this.activeArea.toggleBackground.bind(this.activeArea),
            'toggle-square-area': this.activeArea.toggleSquareArea.bind(this.activeArea),
            'increment-line-width': () => this.activeArea.incrementLineWidth(1),
            'decrement-line-width': () => this.activeArea.incrementLineWidth(-1),
            'increment-line-width-more': () => this.activeArea.incrementLineWidth(5),
            'decrement-line-width-more': () => this.activeArea.incrementLineWidth(-5),
            'toggle-linejoin': this.activeArea.toggleLineJoin.bind(this.activeArea),
            'toggle-linecap': this.activeArea.toggleLineCap.bind(this.activeArea),
            'toggle-dash' : this.activeArea.toggleDash.bind(this.activeArea),
            'toggle-fill' : this.activeArea.toggleFill.bind(this.activeArea),
            'select-none-shape': () => this.activeArea.selectShape(Draw.Shapes.NONE),
            'select-line-shape': () => this.activeArea.selectShape(Draw.Shapes.LINE),
            'select-ellipse-shape': () => this.activeArea.selectShape(Draw.Shapes.ELLIPSE),
            'select-rectangle-shape': () => this.activeArea.selectShape(Draw.Shapes.RECTANGLE),
            'select-text-shape': () => this.activeArea.selectShape(Draw.Shapes.TEXT),
            'toggle-font-family': this.activeArea.toggleFontFamily.bind(this.activeArea),
            'toggle-font-weight': this.activeArea.toggleFontWeight.bind(this.activeArea),
            'toggle-font-style': this.activeArea.toggleFontStyle.bind(this.activeArea),
            'toggle-panel-and-dock-visibility': this.togglePanelAndDockOpacity.bind(this),
            'toggle-help': this.activeArea.toggleHelp.bind(this.activeArea),
            'open-stylesheet': this.openStylesheetFile.bind(this)
        };
        
        for (let key in this.internalKeybindings) {
            Main.wm.addKeybinding(key,
                                  this.settings,
                                  Meta.KeyBindingFlags.NONE,
                                  DRAWING_ACTION_MODE,
                                  this.internalKeybindings[key]);
        }
        
        for (let i = 1; i < 10; i++) {
            Main.wm.addKeybinding('select-color' + i,
                                  this.settings,
                                  Meta.KeyBindingFlags.NONE,
                                  DRAWING_ACTION_MODE,
                                  () => this.activeArea.selectColor(i));
        }
    },
    
    removeInternalKeybindings: function() {
        for (let key in this.internalKeybindings) {
            Main.wm.removeKeybinding(key);
        }
        
        for (let i = 1; i < 10; i++) {
            Main.wm.removeKeybinding('select-color' + i);
        }
    },
    
    openStylesheetFile: function() {
        if (Extension.stylesheet && Extension.stylesheet.query_exists(null))
            Gio.AppInfo.launch_default_for_uri(Extension.stylesheet.get_uri(), global.create_app_launch_context(0, -1));
        if (this.activeArea)
            this.toggleDrawing();
    },
    
    eraseDrawing: function() {
        for (let i = 0; i < this.areas.length; i++)
            this.areas[i].erase();
        if (this.settings.get_boolean('persistent-drawing'))
            this.areas[Main.layoutManager.primaryIndex].saveAsJson();
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
                       actor._delegate &&
                       actor._delegate._monitorIndex !== undefined &&
                       actor._delegate._monitorIndex == activeIndex;
            });
            
            // for simplicity, we assume that main dash-to-panel panel is displayed on primary monitor
            // and we hide all secondary panels together if the active area is not on the primary
            let name = activeIndex == Main.layoutManager.primaryIndex ? 'panelBox' : 'dashtopanelSecondaryPanelBox';
            let panelBoxes = Main.uiGroup.get_children().filter((actor) => {
                return actor.name && actor.name == name;
            });
            
            
            let actorToHide = dtdContainers.concat(panelBoxes);
            this.hiddenList = [];
            for (let i = 0; i < actorToHide.length; i++) {
                this.hiddenList.push({ actor: actorToHide[i], oldOpacity: actorToHide[i].get_opacity() });
                actorToHide[i].set_opacity(0);
            }
        }
    },
    
    toggleDrawing: function() {
        if (this.activeArea) {
            let activeIndex = this.areas.indexOf(this.activeArea);
            let activeContainer = this.activeArea.get_parent();
            let save = activeIndex == Main.layoutManager.primaryIndex && this.settings.get_boolean('persistent-drawing');
            
            if (this.hiddenList)
                this.togglePanelAndDockOpacity();
            
            Main.popModal(this.activeArea);
            this.removeInternalKeybindings();
            this.activeArea.reactive = false;
            this.activeArea.leaveDrawingMode(save);
            this.activeArea = null;
            
            activeContainer.get_parent().remove_actor(activeContainer);
            Main.layoutManager._backgroundGroup.insert_child_above(activeContainer, Main.layoutManager._bgManagers[activeIndex].backgroundActor);
            if (!this.settings.get_boolean("drawing-on-desktop")) 
                activeContainer.hide();
            
            // check display or screen (API changes)
            if (global.display.set_cursor)
                global.display.set_cursor(Meta.Cursor.DEFAULT);
            else if (global.screen && global.screen.set_cursor)
                global.screen.set_cursor(Meta.Cursor.DEFAULT);
            if (!this.osdDisabled)
                Main.osdWindowManager.show(activeIndex, this.leaveGicon, _("Leaving drawing mode"), null);
        } else  {
            // avoid to deal with Meta changes (global.display/global.screen)
            let currentIndex = Main.layoutManager.monitors.indexOf(Main.layoutManager.currentMonitor);
            let activeContainer = this.areas[currentIndex].get_parent();
            
            activeContainer.get_parent().remove_actor(activeContainer);
            Main.uiGroup.add_child(activeContainer);
            
            // add Shell.ActionMode.NORMAL to keep system keybindings enabled (e.g. Alt + F2 ...)
            if (!Main.pushModal(this.areas[currentIndex], { actionMode: DRAWING_ACTION_MODE | Shell.ActionMode.NORMAL }))
                return;
            this.activeArea = this.areas[currentIndex];
            this.addInternalKeybindings();
            this.activeArea.reactive = true;
            this.activeArea.enterDrawingMode();
            
            // check display or screen (API changes)
            if (global.display.set_cursor)
                global.display.set_cursor(Meta.Cursor.POINTING_HAND);
            else if (global.screen && global.screen.set_cursor)
                global.screen.set_cursor(Meta.Cursor.POINTING_HAND);
                
            this.osdDisabled = this.settings.get_boolean('osd-disabled');
            if (!this.osdDisabled) {
                // increase OSD display time
                let hideTimeoutSave = OsdWindow.HIDE_TIMEOUT;
                OsdWindow.HIDE_TIMEOUT = 2000;
                Main.osdWindowManager.show(currentIndex, this.enterGicon, _("Press Ctrl + F1 for help") + "\n\n" + _("Entering drawing mode"), null);
                OsdWindow.HIDE_TIMEOUT = hideTimeoutSave;
            }
        }
        
        if (this.indicator)
            this.indicator.sync(this.activeArea != null);
    },
    
    showOsd: function(emitter, label, level, maxLevel) {
        if (this.osdDisabled)
            return;
        let activeIndex = this.areas.indexOf(this.activeArea);
        if (activeIndex != -1) {
            // GS 3.32- : bar from 0 to 100
            // GS 3.34+ : bar from 0 to 1
            if (level && GS_VERSION > '3.33.0')
                level = level / 100;
            Main.osdWindowManager.show(activeIndex, this.enterGicon, label, level, maxLevel);
            Main.osdWindowManager._osdWindows[activeIndex]._label.get_clutter_text().set_use_markup(true);
            
            if (level === 0) {
                Main.osdWindowManager._osdWindows[activeIndex]._label.add_style_class_name(WARNING_COLOR_STYLE_CLASS_NAME);
                // the same label is shared by all GS OSD so the style must be removed after being used
                let osdLabelChangedHandler = Main.osdWindowManager._osdWindows[activeIndex]._label.connect('notify::text', () => {
                    Main.osdWindowManager._osdWindows[activeIndex]._label.remove_style_class_name(WARNING_COLOR_STYLE_CLASS_NAME);
                    Main.osdWindowManager._osdWindows[activeIndex]._label.disconnect(osdLabelChangedHandler);
                });
            }
        }
    },
    
    removeAreas: function() {
        for (let i = 0; i < this.areas.length; i++) {
            let area = this.areas[i];
            let container = area.get_parent();
            container.get_parent().remove_actor(container);
            area.emitter.disconnect(area.emitter.stopDrawingHandler);
            area.emitter.disconnect(area.emitter.showOsdHandler);
            area.disable();
            container.destroy();
        }
        this.areas = [];
    },
    
    disable: function() {
        if (this.stylesheetChangedHandler) {
            this.stylesheetMonitor.disconnect(this.stylesheetChangedHandler);
            this.stylesheetChangedHandler = null;
        }
        if (this.monitorChangedHandler) {
            Main.layoutManager.disconnect(this.monitorChangedHandler);
            this.monitorChangedHandler = null;
        }
        if (this.indicatorSettingHandler) {
            this.settings.disconnect(this.indicatorSettingHandler);
            this.indicatorSettingHandler = null;
        }
        if (this.desktopSettingHandler) {
            this.settings.disconnect(this.desktopSettingHandler);
            this.desktopSettingHandler = null;
        }
        if (this.persistentSettingHandler) {
            this.settings.disconnect(this.persistentSettingHandler);
            this.persistentSettingHandler = null;
        }
        
        if (this.activeArea)
            this.toggleDrawing();
        Main.wm.removeKeybinding('toggle-drawing');
        Main.wm.removeKeybinding('erase-drawing');
        this.removeAreas();
        if (this.indicator)
            this.indicator.disable();
    }
});

var DrawingIndicator = new Lang.Class({
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


