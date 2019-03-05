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
const Main = imports.ui.main;
const OsdWindow = imports.ui.osdWindow;
const Extension = imports.misc.extensionUtils.getCurrentExtension();
const Convenience = Extension.imports.convenience;
const Draw = Extension.imports.draw;
const _ = imports.gettext.domain(Extension.metadata["gettext-domain"]).gettext;

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
    Name: 'AreaManager',

    _init: function() {
        this.areas = [];
        this.drawingHandlers = [];
        this.activeArea = null;
        this.enterGicon = new Gio.ThemedIcon({ name: 'applications-graphics-symbolic' });
        this.leaveGicon = new Gio.ThemedIcon({ name: 'application-exit-symbolic' });
        
        Main.wm.addKeybinding('toggle-drawing',
                              Convenience.getSettings(),
                              Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.ALL,
                              this.toggleDrawing.bind(this));
        
        Main.wm.addKeybinding('erase-drawing',
                              Convenience.getSettings(),
                              Meta.KeyBindingFlags.NONE,
                              Shell.ActionMode.ALL,
                              this.eraseDrawing.bind(this));
        
        this.updateAreas();
        this.monitorChangedHandler = Main.layoutManager.connect('monitors-changed', this.updateAreas.bind(this));
        
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
    
    updateAreas: function() {
        if (this.activeArea)
            this.toggleDrawing();
        this.removeAreas();
        
        this.monitors = Main.layoutManager.monitors;
        
        for (let i = 0; i < this.monitors.length; i++) {
            let monitor = this.monitors[i];
            let helper = new Draw.DrawingHelper({ name: 'drawOnYourSreenHelper' + i }, monitor);
            let bgContainer = new St.Bin({ name: 'drawOnYourSreenContainer' + i });
            let area = new Draw.DrawingArea({ name: 'drawOnYourSreenArea' + i }, helper);
            bgContainer.set_child(area);
            Main.uiGroup.add_actor(bgContainer);
            Main.uiGroup.add_actor(helper);
            bgContainer.set_position(monitor.x, monitor.y);
            bgContainer.set_size(monitor.width, monitor.height);
            area.set_position(monitor.x, monitor.y);
            area.set_size(monitor.width, monitor.height);
            this.drawingHandlers.push(area.emitter.connect('stop-drawing', this.toggleDrawing.bind(this)));
            this.drawingHandlers.push(area.emitter.connect('show-osd', this.showOsd.bind(this)));
            this.areas.push(area);
        }
    },
    
    addInternalKeybindings: function() {
        this.internalKeybindings = {
            'undo': this.activeArea.undo.bind(this.activeArea),
            'redo': this.activeArea.redo.bind(this.activeArea),
            'delete-last-element': this.activeArea.deleteLastElement.bind(this.activeArea),
            'save-as-svg': this.activeArea.save.bind(this.activeArea),
            'toggle-background': this.activeArea.toggleBackground.bind(this.activeArea),
            'increment-line-width': () => this.activeArea.incrementLineWidth(1),
            'decrement-line-width': () => this.activeArea.incrementLineWidth(-1),
            'increment-line-width-more': () => this.activeArea.incrementLineWidth(5),
            'decrement-line-width-more': () => this.activeArea.incrementLineWidth(-5),
            'toggle-linejoin': this.activeArea.toggleLineJoin.bind(this.activeArea),
            'toggle-linecap': this.activeArea.toggleLineCap.bind(this.activeArea),
            'toggle-dash' : this.activeArea.toggleDash.bind(this.activeArea),
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
                                  Convenience.getSettings(),
                                  Meta.KeyBindingFlags.NONE,
                                  256,
                                  this.internalKeybindings[key]);
        }
        
        for (let i = 1; i < 10; i++) {
            Main.wm.addKeybinding('select-color' + i,
                                  Convenience.getSettings(),
                                  Meta.KeyBindingFlags.NONE,
                                  256,
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
        for (let i = 0; i < this.areas.length; i++) {
            this.areas[i].erase();
        }
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
            if (this.hiddenList)
                this.togglePanelAndDockOpacity();
            Main.popModal(this.activeArea);
            let activeIndex = this.areas.indexOf(this.activeArea);
            this.removeInternalKeybindings();
            this.activeArea.reactive = false;
            this.activeArea.leaveDrawingMode();
            this.activeArea = null;
            global.display.set_cursor(Meta.Cursor.DEFAULT);
            Main.osdWindowManager.show(activeIndex, this.leaveGicon, _("Leaving drawing mode"), null);
        } else  {
            // avoid to deal with Meta changes (global.display/global.screen)
            let currentIndex = Main.layoutManager.monitors.indexOf(Main.layoutManager.currentMonitor);
            // 256 is a custom Shell.ActionMode
            if (!Main.pushModal(this.areas[currentIndex], { actionMode: 256 | 1 }))
                return;
            this.activeArea = this.areas[currentIndex];
            this.addInternalKeybindings();
            this.activeArea.reactive = true;
            this.activeArea.enterDrawingMode();
            global.display.set_cursor(Meta.Cursor.POINTING_HAND);
            // increase OSD display time
            let hideTimeoutSave = OsdWindow.HIDE_TIMEOUT;
            OsdWindow.HIDE_TIMEOUT = 2000;
            Main.osdWindowManager.show(currentIndex, this.enterGicon, _("Press Ctrl + F1 for help") + "\n\n" + _("Entering drawing mode"), null);
            OsdWindow.HIDE_TIMEOUT = hideTimeoutSave;
        }
    },
    
    showOsd: function(emitter, label, level, maxLevel) {
        let activeIndex = this.areas.indexOf(this.activeArea);
        if (activeIndex != -1)
            Main.osdWindowManager.show(activeIndex, this.enterGicon, label, level, maxLevel);
    },
    
    removeAreas: function() {
        for (let i = 0; i < this.areas.length; i++) {
            let area = this.areas[i];
            Main.uiGroup.remove_actor(area.get_parent());
            area.emitter.disconnect(this.drawingHandlers[i]);
            area.disable();
            area.get_parent().destroy();
        }
        this.areas = [];
        this.drawingHandlers = [];
    },
    
    disable: function() {
        if (this.stylesheetChangedHandler) {
            this.stylesheetMonitor.disconnect(this.stylesheetChangedHandler);
            this.stylesheetChangedHandler = null;
        }
        if (this.activeArea)
            this.toggleDrawing();
        Main.wm.removeKeybinding('toggle-drawing');
        Main.wm.removeKeybinding('erase-drawing');
        this.removeAreas();
    }
});


