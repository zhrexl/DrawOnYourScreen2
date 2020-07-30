/* jslint esversion: 6 */

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

const ByteArray = imports.byteArray;
const Cairo = imports.cairo;
const Clutter = imports.gi.Clutter;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const GObject = imports.gi.GObject;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Pango = imports.gi.Pango;
const St = imports.gi.St;
const System = imports.system;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const Screenshot = imports.ui.screenshot;

const Me = ExtensionUtils.getCurrentExtension();
const Convenience = ExtensionUtils.getSettings ? ExtensionUtils : Me.imports.convenience;
const Extension = Me.imports.extension;
const Elements = Me.imports.elements;
const Files = Me.imports.files;
const Menu = Me.imports.menu;
const _ = imports.gettext.domain(Me.metadata['gettext-domain']).gettext;

const CAIRO_DEBUG_EXTENDS = false;
const SVG_DEBUG_EXTENDS = false;
const TEXT_CURSOR_TIME = 600; // ms

const { Shapes, ShapeNames, Transformations, LineCapNames, LineJoinNames, FillRuleNames,
        FontWeightNames, FontStyleNames, FontStretchNames, FontVariantNames } = Elements;
const Manipulations = { MOVE: 100, RESIZE: 101, MIRROR: 102 };
const ManipulationNames = { 100: "Move", 101: "Resize", 102: "Mirror" };
var Tools = Object.assign({}, Shapes, Manipulations);
var ToolNames = Object.assign({}, ShapeNames, ManipulationNames);

var FontGenericNames = {  0: 'Theme', 1: 'Sans-Serif', 2: 'Serif', 3: 'Monospace', 4: 'Cursive', 5: 'Fantasy' };

var getDateString = function() {
    let date = GLib.DateTime.new_now_local();
    return `${date.format("%F")} ${date.format("%X")}`;
};

var getJsonFiles = function() {
    let directory = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir']]));
    
    let enumerator;
    try {
        enumerator = directory.enumerate_children('standard::name,standard::display-name,standard::content-type,time::modified', Gio.FileQueryInfoFlags.NONE, null);
    } catch(e) {
        return [];
    }
    
    let jsonFiles = [];
    let fileInfo = enumerator.next_file(null);
    while (fileInfo) {
        if (fileInfo.get_content_type().indexOf('json') != -1 && fileInfo.get_name() != `${Me.metadata['persistent-file-name']}.json`) {
            let file = enumerator.get_child(fileInfo);
            jsonFiles.push({ name: fileInfo.get_name().slice(0, -5),
                             displayName: fileInfo.get_display_name().slice(0, -5),
                             // fileInfo.get_modification_date_time: Gio 2.62+
                             modificationUnixTime: fileInfo.get_attribute_uint64('time::modified'),
                             delete: () => file.delete(null) });
        }
        fileInfo = enumerator.next_file(null);
    }
    enumerator.close(null);
    
    jsonFiles.sort((a, b) => {
        return b.modificationUnixTime - a.modificationUnixTime;
    });
    
    return jsonFiles;
};

// DrawingArea is the widget in which we draw, thanks to Cairo.
// It creates and manages a DrawingElement for each "brushstroke".
// It handles pointer/mouse/(touch?) events and some keyboard events.
var DrawingArea = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingArea',
    Extends: St.DrawingArea,
    Signals: { 'show-osd': { param_types: [GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_DOUBLE, GObject.TYPE_BOOLEAN] },
               'show-osd-gicon': { param_types: [Gio.Icon.$gtype, GObject.TYPE_STRING, GObject.TYPE_STRING, GObject.TYPE_DOUBLE, GObject.TYPE_BOOLEAN] },
               'update-action-mode': {},
               'leave-drawing-mode': {} },

    _init: function(params, monitor, helper, loadPersistent) {
        this.parent({ style_class: 'draw-on-your-screen', name: params.name});
        
        this.connect('destroy', this._onDestroy.bind(this));
        this.reactiveHandler = this.connect('notify::reactive', this._onReactiveChanged.bind(this));
        
        this.settings = Convenience.getSettings();
        this.monitor = monitor;
        this.helper = helper;
        
        this.elements = [];
        this.undoneElements = [];
        this.currentElement = null;
        this.currentTool = Shapes.NONE;
        this.currentImage = 0;
        this.currentFontGeneric = 0;
        this.isSquareArea = false;
        this.hasGrid = false;
        this.hasBackground = false;
        this.textHasCursor = false;
        this.dashedLine = false;
        this.fill = false;
        this.colors = [Clutter.Color.new(0, 0, 0, 255)];
        this.newThemeAttributes = {};
        this.oldThemeAttributes = {};
        
        if (loadPersistent)
            this._loadPersistent();
    },
    
    get menu() {
        if (!this._menu)
            this._menu = new Menu.DrawingMenu(this, this.monitor);
        return this._menu;
    },
    
    closeMenu: function() {
        if (this._menu)
            this._menu.close();
    },
    
    get isWriting() {
        return this.textEntry ? true : false;
    },
    
    get currentTool() {
        return this._currentTool;
    },
    
    set currentTool(tool) {
        this._currentTool = tool;
        if (this.hasManipulationTool)
            this._startElementGrabber();
        else
            this._stopElementGrabber();
    },
    
    get hasManipulationTool() {
        // No Object.values method in GS 3.24.
        return Object.keys(Manipulations).map(key => Manipulations[key]).indexOf(this.currentTool) != -1;
    },
    
    // Boolean wrapper for switch menu item.
    get currentEvenodd() {
        return this.currentFillRule == Cairo.FillRule.EVEN_ODD;
    },
    
    set currentEvenodd(evenodd) {
        this.currentFillRule = evenodd ? Cairo.FillRule.EVEN_ODD : Cairo.FillRule.WINDING;
    },
    
    getImages() {
        let images = Files.getImages();
        if (!images[this.currentImage])
            this.currentImage = Math.max(images.length - 1, 0);
        return images;
    },
    
    vfunc_repaint: function() {
        let cr = this.get_context();
        
        try {
            this._repaint(cr);
        } catch(e) {
            logError(e, "An error occured while painting");
        }
        
        cr.$dispose();
        if (this.elements.some(element => element.shape == Shapes.IMAGE) || this.currentElement && this.currentElement.shape == Shapes.IMAGE)
            System.gc();
    },
    
    _redisplay: function() {
        // force area to emit 'repaint'
        this.queue_repaint();
    },
    
    _updateStyle: function() {
        try {
            let themeNode = this.get_theme_node();
            for (let i = 1; i < 10; i++) {
                this.colors[i] = themeNode.get_color('-drawing-color' + i);
            }
            let font = themeNode.get_font();
            this.newThemeAttributes.ThemeFontFamily = font.get_family();
            try { this.newThemeAttributes.FontWeight = font.get_weight(); } catch(e) { this.newThemeAttributes.FontWeight = Pango.Weight.NORMAL; }
            this.newThemeAttributes.FontStyle = font.get_style();
            this.newThemeAttributes.FontStretch = font.get_stretch();
            this.newThemeAttributes.FontVariant = font.get_variant();
            this.newThemeAttributes.TextRightAligned = themeNode.get_text_align() == St.TextAlign.RIGHT;
            this.newThemeAttributes.LineWidth = themeNode.get_length('-drawing-line-width');
            this.newThemeAttributes.LineJoin = themeNode.get_double('-drawing-line-join');
            this.newThemeAttributes.LineCap = themeNode.get_double('-drawing-line-cap');
            this.newThemeAttributes.FillRule = themeNode.get_double('-drawing-fill-rule');
            this.dashArray = [Math.abs(themeNode.get_length('-drawing-dash-array-on')), Math.abs(themeNode.get_length('-drawing-dash-array-off'))];
            this.dashOffset = themeNode.get_length('-drawing-dash-offset');
            this.gridGap = themeNode.get_length('-grid-overlay-gap');
            this.gridLineWidth = themeNode.get_length('-grid-overlay-line-width');
            this.gridInterlineWidth = themeNode.get_length('-grid-overlay-interline-width');
            this.gridColor = themeNode.get_color('-grid-overlay-color');
            this.squareAreaWidth = themeNode.get_length('-drawing-square-area-width');
            this.squareAreaHeight = themeNode.get_length('-drawing-square-area-height');
            this.activeBackgroundColor = themeNode.get_color('-drawing-background-color');
        } catch(e) {
            logError(e);
        }
        
        for (let i = 1; i < 10; i++) {
            this.colors[i] = this.colors[i].alpha ? this.colors[i] : this.colors[0];
        }
        this.currentColor = this.currentColor || this.colors[1];
        // SVG does not support 'Ultra-heavy' weight (1000)
        this.newThemeAttributes.FontWeight = Math.min(this.newThemeAttributes.FontWeight, 900);
        this.newThemeAttributes.LineWidth = (this.newThemeAttributes.LineWidth > 0) ? this.newThemeAttributes.LineWidth : 3;
        this.newThemeAttributes.LineJoin = ([0, 1, 2].indexOf(this.newThemeAttributes.LineJoin) != -1) ? this.newThemeAttributes.LineJoin : Cairo.LineJoin.ROUND;
        this.newThemeAttributes.LineCap = ([0, 1, 2].indexOf(this.newThemeAttributes.LineCap) != -1) ? this.newThemeAttributes.LineCap : Cairo.LineCap.ROUND;
        this.newThemeAttributes.FillRule = ([0, 1].indexOf(this.newThemeAttributes.FillRule) != -1) ? this.newThemeAttributes.FillRule : Cairo.FillRule.WINDING;
        for (let attributeName in this.newThemeAttributes) {
            if (this.newThemeAttributes[attributeName] != this.oldThemeAttributes[attributeName]) {
                this.oldThemeAttributes[attributeName] = this.newThemeAttributes[attributeName];
                this[`current${attributeName}`] = this.newThemeAttributes[attributeName];
            }
        }
        this.gridGap = this.gridGap && this.gridGap >= 1 ? this.gridGap : 10;
        this.gridLineWidth = this.gridLineWidth || 0.4;
        this.gridInterlineWidth = this.gridInterlineWidth || 0.2;
        this.gridColor = this.gridColor && this.gridColor.alpha ? this.gridColor : Clutter.Color.new(127, 127, 127, 255);
    },
    
    _repaint: function(cr) {
        if (CAIRO_DEBUG_EXTENDS) {
            cr.scale(0.5, 0.5);
            cr.translate(this.monitor.width, this.monitor.height);
        }
        
        for (let i = 0; i < this.elements.length; i++) {
            cr.save();
            
            this.elements[i].buildCairo(cr, { showTextRectangle: this.grabbedElement && this.grabbedElement == this.elements[i],
                                              drawTextRectangle: this.grabPoint ? true : false });
            
            if (this.grabPoint)
                this._searchElementToGrab(cr, this.elements[i]);
            
            if (this.elements[i].fill && !this.elements[i].isStraightLine) {
                cr.fillPreserve();
                if (this.elements[i].shape == Shapes.NONE || this.elements[i].shape == Shapes.LINE)
                    cr.closePath();
            } 
            
            cr.stroke();
            cr.restore();
        }
        
        if (this.currentElement) {
            cr.save();
            this.currentElement.buildCairo(cr, { showTextCursor: this.textHasCursor,
                                                 showTextRectangle: this.currentElement.shape != Shapes.TEXT || !this.isWriting,
                                                 dummyStroke: this.currentElement.fill && this.currentElement.line.lineWidth == 0 });
            
            cr.stroke();
            cr.restore();
        }
        
        if (this.reactive && this.hasGrid && this.gridGap && this.gridGap >= 1) {
            cr.save();
            Clutter.cairo_set_source_color(cr, this.gridColor);
            
            let [gridX, gridY] = [0, 0];
            while (gridX < this.monitor.width / 2) {
                cr.setLineWidth((gridX / this.gridGap) % 5 ? this.gridInterlineWidth : this.gridLineWidth);
                cr.moveTo(this.monitor.width / 2 + gridX, 0);
                cr.lineTo(this.monitor.width / 2 + gridX, this.monitor.height);
                cr.moveTo(this.monitor.width / 2 - gridX, 0);
                cr.lineTo(this.monitor.width / 2 - gridX, this.monitor.height);
                gridX += this.gridGap;
                cr.stroke();
            }
            while (gridY < this.monitor.height / 2) {
                cr.setLineWidth((gridY / this.gridGap) % 5 ? this.gridInterlineWidth : this.gridLineWidth);
                cr.moveTo(0, this.monitor.height / 2 + gridY);
                cr.lineTo(this.monitor.width, this.monitor.height / 2 + gridY);
                cr.moveTo(0, this.monitor.height / 2 - gridY);
                cr.lineTo(this.monitor.width, this.monitor.height / 2 - gridY);
                gridY += this.gridGap;
                cr.stroke();
            }
            cr.restore();
        }
    },
    
    _onButtonPressed: function(actor, event) {
        if (this.spaceKeyPressed)
            return Clutter.EVENT_PROPAGATE;
        
        let button = event.get_button();
        let [x, y] = event.get_coords();
        let controlPressed = event.has_control_modifier();
        let shiftPressed = event.has_shift_modifier();
        
        if (this.currentElement && this.currentElement.shape == Shapes.TEXT && this.isWriting)
            // finish writing
            this._stopWriting();
        
        if (this.helper.visible) {
            // hide helper
            this.toggleHelp();
            return Clutter.EVENT_STOP;
        }
        
        if (button == 1) {
            if (this.hasManipulationTool) {
                if (this.grabbedElement)
                    this._startTransforming(x, y, controlPressed, shiftPressed);
            } else {
                this._startDrawing(x, y, shiftPressed);
            }
            return Clutter.EVENT_STOP;
        } else if (button == 2) {
            this.toggleFill();
        } else if (button == 3) {
            this._stopDrawing();
            this.menu.open(x, y);
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    },
    
    _onKeyboardPopupMenu: function() {
        this._stopDrawing();
        if (this.helper.visible)
            this.toggleHelp();
        this.menu.popup();
        return Clutter.EVENT_STOP;
    },
    
    _onStageKeyPressed: function(actor, event) {
        if (event.get_key_symbol() == Clutter.KEY_space)
            this.spaceKeyPressed = true;
        
        return Clutter.EVENT_PROPAGATE;
    },
    
    _onStageKeyReleased: function(actor, event) {
        if (event.get_key_symbol() == Clutter.KEY_space)
            this.spaceKeyPressed = false;
        
        return Clutter.EVENT_PROPAGATE;
    },
    
    _onKeyPressed: function(actor, event) {
        if (this.currentElement && this.currentElement.shape == Shapes.LINE) {
            if (event.get_key_symbol() == Clutter.KEY_Return ||
                event.get_key_symbol() == Clutter.KEY_KP_Enter ||
                event.get_key_symbol() == Clutter.KEY_Control_L) {
                if (this.currentElement.points.length == 2)
                    this.emit('show-osd', null, _("Press <i>%s</i> to get\na fourth control point")
                                                .format(Gtk.accelerator_get_label(Clutter.KEY_Return, 0)), "", -1, true);
                this.currentElement.addPoint();
                this.updatePointerCursor(true);
                this._redisplay();
                return Clutter.EVENT_STOP;
            } else {
                return Clutter.EVENT_PROPAGATE;
            }
        
        } else if (this.currentElement &&
                   (this.currentElement.shape == Shapes.POLYGON || this.currentElement.shape == Shapes.POLYLINE) &&
                   (event.get_key_symbol() == Clutter.KEY_Return || event.get_key_symbol() == Clutter.KEY_KP_Enter)) {
            this.currentElement.addPoint();
            return Clutter.EVENT_STOP;
            
        } else if (event.get_key_symbol() == Clutter.KEY_Escape) {
            if (this.helper.visible)
                this.toggleHelp();
            else
                this.emit('leave-drawing-mode');
            return Clutter.EVENT_STOP;
            
        } else {
            return Clutter.EVENT_PROPAGATE;
        }
    },
    
    _onScroll: function(actor, event) {
        if (this.helper.visible)
            return Clutter.EVENT_PROPAGATE;
        let direction = event.get_scroll_direction();
        if (direction == Clutter.ScrollDirection.UP)
             this.incrementLineWidth(1);
        else if (direction == Clutter.ScrollDirection.DOWN)
            this.incrementLineWidth(-1);
        else
            return Clutter.EVENT_PROPAGATE;
        return Clutter.EVENT_STOP;
    },
    
    _searchElementToGrab: function(cr, element) {
        if (element.getContainsPoint(cr, this.grabPoint[0], this.grabPoint[1]))
            this.grabbedElement = element;
        else if (this.grabbedElement == element)
            this.grabbedElement = null;
        
        if (element == this.elements[this.elements.length - 1])
            // All elements have been tested, the winner is the last.
            this.updatePointerCursor();
    },
    
    _startElementGrabber: function() {
        if (this.elementGrabberHandler)
            return;
        
        this.elementGrabberHandler = this.connect('motion-event', (actor, event) => {
            if (this.motionHandler || this.grabbedElementLocked) {
                this.grabPoint = null;
                return;
            }
            
            // Reduce computing without notable effect.
            if (Math.random() <= 0.75)
                return;
            
            let coords = event.get_coords();
            let [s, x, y] = this.transform_stage_point(coords[0], coords[1]);
            if (!s)
                return;
            
            this.grabPoint = [x, y];
            this.grabbedElement = null;
            // this._redisplay calls this._searchElementToGrab.
            this._redisplay();
        });
    },
    
    _stopElementGrabber: function() {
        if (this.elementGrabberHandler) {
            this.disconnect(this.elementGrabberHandler);
            this.grabPoint = null;
            this.elementGrabberHandler = null;
        }
    },
    
    _startTransforming: function(stageX, stageY, controlPressed, duplicate) {
        let [success, startX, startY] = this.transform_stage_point(stageX, stageY);
        
        if (!success)
            return;
        
        if (this.currentTool == Manipulations.MIRROR) {
            this.grabbedElementLocked = !this.grabbedElementLocked;
            if (this.grabbedElementLocked) {
                this.updatePointerCursor();
                let label = controlPressed ? _("Mark a point of symmetry") : _("Draw a line of symmetry");
                this.emit('show-osd', null, label, "", -1, true);
                return;
            }
        }
        
        this.grabPoint = null;
        
        this.buttonReleasedHandler = this.connect('button-release-event', (actor, event) => {
            this._stopTransforming();
        });
        
        if (duplicate) {
            // deep cloning
            let copy = new this.grabbedElement.constructor(JSON.parse(JSON.stringify(this.grabbedElement)));
            if (this.grabbedElement.image)
                copy.image = this.grabbedElement.image;
            this.elements.push(copy);
            this.grabbedElement = copy;
        }
        
        if (this.currentTool == Manipulations.MOVE)
            this.grabbedElement.startTransformation(startX, startY, controlPressed ? Transformations.ROTATION : Transformations.TRANSLATION);
        else if (this.currentTool == Manipulations.RESIZE)
            this.grabbedElement.startTransformation(startX, startY, controlPressed ? Transformations.STRETCH : Transformations.SCALE_PRESERVE);
         else if (this.currentTool == Manipulations.MIRROR) {
            this.grabbedElement.startTransformation(startX, startY, controlPressed ? Transformations.INVERSION : Transformations.REFLECTION);
            this._redisplay();
        }
        
        
        this.motionHandler = this.connect('motion-event', (actor, event) => {
            if (this.spaceKeyPressed)
                return;
            
            let coords = event.get_coords();
            let [s, x, y] = this.transform_stage_point(coords[0], coords[1]);
            if (!s)
                return;
            let controlPressed = event.has_control_modifier();
            this._updateTransforming(x, y, controlPressed);
        });
    },
    
    _updateTransforming: function(x, y, controlPressed) {
        if (controlPressed && this.grabbedElement.lastTransformation.type == Transformations.TRANSLATION) {
            this.grabbedElement.stopTransformation();
            this.grabbedElement.startTransformation(x, y, Transformations.ROTATION);
        } else if (!controlPressed && this.grabbedElement.lastTransformation.type == Transformations.ROTATION) {
            this.grabbedElement.stopTransformation();
            this.grabbedElement.startTransformation(x, y, Transformations.TRANSLATION);
        }
        
        if (controlPressed && this.grabbedElement.lastTransformation.type == Transformations.SCALE_PRESERVE) {
            this.grabbedElement.stopTransformation();
            this.grabbedElement.startTransformation(x, y, Transformations.STRETCH);
        } else if (!controlPressed && this.grabbedElement.lastTransformation.type == Transformations.STRETCH) {
            this.grabbedElement.stopTransformation();
            this.grabbedElement.startTransformation(x, y, Transformations.SCALE_PRESERVE);
        }
        
        if (controlPressed && this.grabbedElement.lastTransformation.type == Transformations.REFLECTION) {
            this.grabbedElement.transformations.pop();
            this.grabbedElement.startTransformation(x, y, Transformations.INVERSION);
        } else if (!controlPressed && this.grabbedElement.lastTransformation.type == Transformations.INVERSION) {
            this.grabbedElement.transformations.pop();
            this.grabbedElement.startTransformation(x, y, Transformations.REFLECTION);
        }
        
        this.grabbedElement.updateTransformation(x, y);
        this._redisplay();
    },
    
    _stopTransforming: function() {
        if (this.motionHandler) {
            this.disconnect(this.motionHandler);
            this.motionHandler = null;
        }
        if (this.buttonReleasedHandler) {
            this.disconnect(this.buttonReleasedHandler);
            this.buttonReleasedHandler = null;
        }
        
        this.grabbedElement.stopTransformation();
        this.grabbedElement = null;
        this.grabbedElementLocked = false;
        this._redisplay();
    },
    
    _startDrawing: function(stageX, stageY, eraser) {
        let [success, startX, startY] = this.transform_stage_point(stageX, stageY);
        
        if (!success)
            return;
        
        this.buttonReleasedHandler = this.connect('button-release-event', (actor, event) => {
            this._stopDrawing();
        });
        
        if (this.currentTool == Shapes.TEXT) {
            this.currentElement = new Elements.DrawingElement({
                shape: this.currentTool,
                color: this.currentColor.to_string(),
                eraser: eraser,
                font: {
                    family: (this.currentFontGeneric == 0 ? this.currentThemeFontFamily : FontGenericNames[this.currentFontGeneric]),
                    weight: this.currentFontWeight,
                    style: this.currentFontStyle,
                    stretch: this.currentFontStretch,
                    variant: this.currentFontVariant },
                text: _("Text"),
                textRightAligned: this.currentTextRightAligned,
                points: []
            });
        } else if (this.currentTool == Shapes.IMAGE) {
            let images = this.getImages();
            if (!images.length)
                return;
            this.currentElement = new Elements.DrawingElement({
                shape: this.currentTool,
                color: this.currentColor.to_string(),
                eraser: eraser,
                image: images[this.currentImage],
                operator: this.currentOperator,
                points: []
            });
        } else {
            this.currentElement = new Elements.DrawingElement({
                shape: this.currentTool,
                color: this.currentColor.to_string(),
                eraser: eraser,
                fill: this.fill,
                fillRule: this.currentFillRule,
                line: { lineWidth: this.currentLineWidth, lineJoin: this.currentLineJoin, lineCap: this.currentLineCap },
                dash: { active: this.dashedLine, array: this.dashedLine ? [this.dashArray[0] || this.currentLineWidth, this.dashArray[1] || this.currentLineWidth * 3] : [0, 0] , offset: this.dashOffset },
                points: []
            });
        }
        
        this.currentElement.startDrawing(startX, startY);
        
        if (this.currentTool == Shapes.POLYGON || this.currentTool == Shapes.POLYLINE)
            this.emit('show-osd', null, _("Press <i>%s</i> to mark vertices")
                                        .format(Gtk.accelerator_get_label(Clutter.KEY_Return, 0)), "", -1, true);
        
        this.motionHandler = this.connect('motion-event', (actor, event) => {
            if (this.spaceKeyPressed)
                return;
            
            let coords = event.get_coords();
            let [s, x, y] = this.transform_stage_point(coords[0], coords[1]);
            if (!s)
                return;
            let controlPressed = event.has_control_modifier();
            this._updateDrawing(x, y, controlPressed);
        });
    },
    
    _updateDrawing: function(x, y, controlPressed) {
        if (!this.currentElement)
            return;
        
        this.currentElement.updateDrawing(x, y, controlPressed);
        
        this._redisplay();
        this.updatePointerCursor(controlPressed);
    },
    
    _stopDrawing: function() {
        if (this.motionHandler) {
            this.disconnect(this.motionHandler);
            this.motionHandler = null;
        }
        if (this.buttonReleasedHandler) {
            this.disconnect(this.buttonReleasedHandler);
            this.buttonReleasedHandler = null;
        }
        
        // skip when a polygon has not at least 3 points
        if (this.currentElement && this.currentElement.shape == Shapes.POLYGON && this.currentElement.points.length < 3)
            this.currentElement = null;
        
        if (this.currentElement)
            this.currentElement.stopDrawing();
        
        if (this.currentElement && this.currentElement.points.length >= 2) {
            if (this.currentElement.shape == Shapes.TEXT && !this.isWriting) {
                this._startWriting();
                return;
            }
        
            this.elements.push(this.currentElement);
        }
        
        this.currentElement = null;
        this._redisplay();
        this.updatePointerCursor();
    },
    
    _startWriting: function() {
        let [x, y] = [this.currentElement.x, this.currentElement.y];
        this.currentElement.text = '';
        this.currentElement.cursorPosition = 0;
        this.emit('show-osd', null, _("Type your text and press <i>%s</i>")
                                    .format(Gtk.accelerator_get_label(Clutter.KEY_Escape, 0)), "", -1, true);
        this._updateTextCursorTimeout();
        this.textHasCursor = true;
        this._redisplay();
        
        this.textEntry = new St.Entry({ visible: false, x, y });
        this.get_parent().add_child(this.textEntry);
        this.textEntry.grab_key_focus();
        this.updateActionMode();
        this.updatePointerCursor();
        
        let ibusCandidatePopup = Main.layoutManager.uiGroup.get_children().filter(child =>
            child.has_style_class_name && child.has_style_class_name('candidate-popup-boxpointer'))[0] || null;
        if (ibusCandidatePopup) {
            this.ibusHandler = ibusCandidatePopup.connect('notify::visible', popup => popup.visible && (this.textEntry.visible = true));
            this.textEntry.connect('destroy', () => ibusCandidatePopup.disconnect(this.ibusHandler));
        }
        
        this.textEntry.clutterText.connect('activate', (clutterText) => {
            let startNewLine = true;
            this._stopWriting(startNewLine);
            clutterText.text = "";
        });
        
        this.textEntry.clutterText.connect('text-changed', (clutterText) => {
            GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                this.currentElement.text = clutterText.text;
                this.currentElement.cursorPosition = clutterText.cursorPosition;
                this._updateTextCursorTimeout();
                this._redisplay();
            });
        });
        
        this.textEntry.clutterText.connect('key-press-event', (clutterText, event) => {
            if (event.get_key_symbol() == Clutter.KEY_Escape) {
                this._stopWriting();
                return Clutter.EVENT_STOP;
            }
            
            // 'cursor-changed' signal is not emitted if the text entry is not visible.
            // So key events related to the cursor must be listened.
            if (event.get_key_symbol() == Clutter.KEY_Left || event.get_key_symbol() == Clutter.KEY_Right ||
                event.get_key_symbol() == Clutter.KEY_Home || event.get_key_symbol() == Clutter.KEY_End) {
                GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
                    this.currentElement.cursorPosition = clutterText.cursorPosition;
                    this._updateTextCursorTimeout();
                    this.textHasCursor = true;
                    this._redisplay();
                });
            }
            
            return Clutter.EVENT_PROPAGATE;
        });
    },
    
    _stopWriting: function(startNewLine) {
        if (this.currentElement.text.length > 0)
            this.elements.push(this.currentElement);
            
        if (startNewLine && this.currentElement.points.length == 2) {
            this.currentElement.lineIndex = this.currentElement.lineIndex || 0;
            // copy object, the original keep existing in this.elements
            this.currentElement = Object.create(this.currentElement);
            this.currentElement.lineIndex ++;
            // define a new 'points' array, the original keep existing in this.elements
            this.currentElement.points = [
                [this.currentElement.points[0][0], this.currentElement.points[0][1] + this.currentElement.height],
                [this.currentElement.points[1][0], this.currentElement.points[1][1] + this.currentElement.height]
            ];
            this.currentElement.text = "";
            this.textEntry.set_y(this.currentElement.y);
        } else {
            this.currentElement = null;
            this._stopTextCursorTimeout();
            this.textEntry.destroy();
            delete this.textEntry;
            this.grab_key_focus();
            this.updateActionMode();
            this.updatePointerCursor();
        }
        
        this._redisplay();
    },
    
    setPointerCursor: function(pointerCursorName) {
        if (!this.currentPointerCursorName || this.currentPointerCursorName != pointerCursorName) {
            this.currentPointerCursorName = pointerCursorName;
            Extension.setCursor(pointerCursorName);
        }
    },
    
    updatePointerCursor: function(controlPressed) {
        if (this.currentTool == Manipulations.MIRROR && this.grabbedElementLocked)
            this.setPointerCursor('CROSSHAIR');
        else if (this.hasManipulationTool)
            this.setPointerCursor(this.grabbedElement ? 'MOVE_OR_RESIZE_WINDOW' : 'DEFAULT');
        else if (this.currentElement && this.currentElement.shape == Shapes.TEXT && this.isWriting)
            this.setPointerCursor('IBEAM');
        else if (!this.currentElement)
            this.setPointerCursor(this.currentTool == Shapes.NONE ? 'POINTING_HAND' : 'CROSSHAIR');
        else if (this.currentElement.shape != Shapes.NONE && controlPressed)
            this.setPointerCursor('MOVE_OR_RESIZE_WINDOW');
    },
    
    initPointerCursor: function() {
        this.currentPointerCursorName = null;
        this.updatePointerCursor();
    },
    
    _stopTextCursorTimeout: function() {
        if (this.textCursorTimeoutId) {
            GLib.source_remove(this.textCursorTimeoutId);
            this.textCursorTimeoutId = null;
        }
        this.textHasCursor = false;
    },
    
    _updateTextCursorTimeout: function() {
        this._stopTextCursorTimeout();
        this.textCursorTimeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TEXT_CURSOR_TIME, () => {
            this.textHasCursor = !this.textHasCursor;
            this._redisplay();
            return GLib.SOURCE_CONTINUE;
        });
    },
    
    erase: function() {
        this.deleteLastElement();
        this.elements = [];
        this.undoneElements = [];
        this._redisplay();
    },
    
    deleteLastElement: function() {
        if (this.currentElement) {
            if (this.motionHandler) {
                this.disconnect(this.motionHandler);
                this.motionHandler = null;
            }
            if (this.buttonReleasedHandler) {
                this.disconnect(this.buttonReleasedHandler);
                this.buttonReleasedHandler = null;
            }
            if (this.isWriting)
                this._stopWriting();
            this.currentElement = null;
        } else {
            this.elements.pop();
        }
        this._redisplay();
    },
    
    undo: function() {
        if (this.elements.length > 0)
            this.undoneElements.push(this.elements.pop());
        this._redisplay();
    },
    
    redo: function() {
        if (this.undoneElements.length > 0)
            this.elements.push(this.undoneElements.pop());
        this._redisplay();
    },
    
    smoothLastElement: function() {
        if (this.elements.length > 0 && this.elements[this.elements.length - 1].shape == Shapes.NONE) {
            this.elements[this.elements.length - 1].smoothAll();
            this._redisplay();
        }
    },
    
    toggleBackground: function() {
        this.hasBackground = !this.hasBackground;
        this.get_parent().set_background_color(this.hasBackground ? this.activeBackgroundColor : null);
    },
    
    toggleGrid: function() {
        this.hasGrid = !this.hasGrid;
        this._redisplay();
    },
    
    toggleSquareArea: function() {
        this.isSquareArea = !this.isSquareArea;
        if (this.isSquareArea) {
            let width = this.squareAreaWidth || this.squareAreaHeight || Math.min(this.monitor.width, this.monitor.height) * 3 / 4;
            let height = this.squareAreaHeight || this.squareAreaWidth || Math.min(this.monitor.width, this.monitor.height) * 3 / 4;
            this.set_position(Math.floor(this.monitor.width / 2 - width / 2), Math.floor(this.monitor.height / 2 - height / 2));
            this.set_size(width, height);
            this.add_style_class_name('draw-on-your-screen-square-area');
        } else {
            this.set_position(0, 0);
            this.set_size(this.monitor.width, this.monitor.height);
            this.remove_style_class_name('draw-on-your-screen-square-area');
        }
    },
    
    toggleColor: function() {
        this.selectColor((this.currentColor == this.colors[1]) ? 2 : 1);
    },
    
    selectColor: function(index) {
        this.currentColor = this.colors[index];
        if (this.currentElement) {
            this.currentElement.color = this.currentColor.to_string();
            this._redisplay();
        }
        // Foreground color markup is not displayed since 3.36, use style instead but the transparency is lost.
        this.emit('show-osd', null, this.currentColor.to_string(), this.currentColor.to_string().slice(0, 7), -1, false);
    },
    
    selectTool: function(tool) {
        this.currentTool = tool;
        this.emit('show-osd', null, _(ToolNames[tool]), "", -1, false);
        this.updatePointerCursor();
    },
    
    toggleFill: function() {
        this.fill = !this.fill;
        this.emit('show-osd', null, this.fill ? _("Fill") : _("Outline"), "", -1, false);
    },
    
    toggleDash: function() {
        this.dashedLine = !this.dashedLine;
        this.emit('show-osd', null, this.dashedLine ? _("Dashed line") : _("Full line"), "", -1, false);
    },
    
    incrementLineWidth: function(increment) {
        this.currentLineWidth = Math.max(this.currentLineWidth + increment, 0);
        this.emit('show-osd', null, _("%d px").format(this.currentLineWidth), "", 2 * this.currentLineWidth, false);
    },
    
    toggleLineJoin: function() {
        this.currentLineJoin = this.currentLineJoin == 2 ? 0 : this.currentLineJoin + 1;
        this.emit('show-osd', null, _(LineJoinNames[this.currentLineJoin]), "", -1, false);
    },
    
    toggleLineCap: function() {
        this.currentLineCap = this.currentLineCap == 2 ? 0 : this.currentLineCap + 1;
        this.emit('show-osd', null, _(LineCapNames[this.currentLineCap]), "", -1, false);
    },
    
    toggleFillRule: function() {
        this.currentFillRule = this.currentFillRule == 1 ? 0 : this.currentFillRule + 1;
        this.emit('show-osd', null, _(FillRuleNames[this.currentFillRule]), "", -1, false);
    },
    
    toggleFontWeight: function() {
        let fontWeights = Object.keys(FontWeightNames).map(key => Number(key));
        let index = fontWeights.indexOf(this.currentFontWeight);
        this.currentFontWeight = index == fontWeights.length - 1 ? fontWeights[0] : fontWeights[index + 1];
        if (this.currentElement && this.currentElement.font) {
            this.currentElement.font.weight = this.currentFontWeight;
            this._redisplay();
        }
        this.emit('show-osd', null, `<span font_weight="${this.currentFontWeight}">` +
                                    `${_(FontWeightNames[this.currentFontWeight])}</span>`, "", -1, false);
    },
    
    toggleFontStyle: function() {
        this.currentFontStyle = this.currentFontStyle == 2 ? 0 : this.currentFontStyle + 1;
        if (this.currentElement && this.currentElement.font) {
            this.currentElement.font.style = this.currentFontStyle;
            this._redisplay();
        }
        this.emit('show-osd', null, `<span font_style="${FontStyleNames[this.currentFontStyle].toLowerCase()}">` + 
                                    `${_(FontStyleNames[this.currentFontStyle])}</span>`, "", -1, false);
    },
    
    toggleFontFamily: function() {
        this.currentFontGeneric = this.currentFontGeneric == 5 ? 0 : this.currentFontGeneric + 1;
        let currentFontFamily = this.currentFontGeneric == 0 ? this.currentThemeFontFamily : FontGenericNames[this.currentFontGeneric];
        if (this.currentElement && this.currentElement.font) {
            this.currentElement.font.family = currentFontFamily;
            this._redisplay();
        }
        this.emit('show-osd', null, `<span font_family="${currentFontFamily}">${_(currentFontFamily)}</span>`, "", -1, false);
    },
    
    toggleTextAlignment: function() {
        this.currentTextRightAligned = !this.currentTextRightAligned;
        if (this.currentElement && this.currentElement.textRightAligned !== undefined) {
            this.currentElement.textRightAligned = this.currentTextRightAligned;
            this._redisplay();
        }
        this.emit('show-osd', null, this.currentTextRightAligned ? _("Right aligned") : _("Left aligned"), "", -1, false);
    },
    
    toggleImageFile: function() {
        let images = this.getImages();
        if (!images.length)
            return;
        if (images.length > 1)
            this.currentImage = this.currentImage == images.length - 1 ? 0 : this.currentImage + 1;
        this.emit('show-osd-gicon', images[this.currentImage].gicon, images[this.currentImage].toString(), "", -1, false);
    },
    
    toggleHelp: function() {
        if (this.helper.visible) {
            this.helper.hideHelp();
            if (this.textEntry)
                this.textEntry.grab_key_focus();
        } else {
            this.helper.showHelp();
            this.grab_key_focus();
        }
        
    },
    
    // The area is reactive when it is modal.
    _onReactiveChanged: function() {
        if (this.hasGrid)
            this._redisplay();
        if (this.helper.visible)
            this.toggleHelp();
        if (this.textEntry && this.reactive)
            this.textEntry.grab_key_focus();
    },
    
    _onDestroy: function() {
        this.disconnect(this.reactiveHandler);
        this.erase();
        if (this._menu)
            this._menu.disable();
    },
    
    updateActionMode: function() {
        this.emit('update-action-mode');
    },
    
    enterDrawingMode: function() {
        this.stageKeyPressedHandler = global.stage.connect('key-press-event', this._onStageKeyPressed.bind(this));
        this.stageKeyReleasedHandler = global.stage.connect('key-release-event', this._onStageKeyReleased.bind(this));
        this.keyPressedHandler = this.connect('key-press-event', this._onKeyPressed.bind(this));
        this.buttonPressedHandler = this.connect('button-press-event', this._onButtonPressed.bind(this));
        this._onKeyboardPopupMenuHandler = this.connect('popup-menu', this._onKeyboardPopupMenu.bind(this));
        this.scrollHandler = this.connect('scroll-event', this._onScroll.bind(this));
        this.get_parent().set_background_color(this.reactive && this.hasBackground ? this.activeBackgroundColor : null);
        this._updateStyle();
    },
    
    leaveDrawingMode: function(save) {
        if (this.stageKeyPressedHandler) {
            global.stage.disconnect(this.stageKeyPressedHandler);
            this.stageKeyPressedHandler = null;
        }
        if (this.stageKeyReleasedHandler) {
            global.stage.disconnect(this.stageKeyReleasedHandler);
            this.stageKeyReleasedHandler = null;
        }
        if (this.keyPressedHandler) {
            this.disconnect(this.keyPressedHandler);
            this.keyPressedHandler = null;
        }
        if (this.buttonPressedHandler) {
            this.disconnect(this.buttonPressedHandler);
            this.buttonPressedHandler = null;
        }
        if (this._onKeyboardPopupMenuHandler) {
            this.disconnect(this._onKeyboardPopupMenuHandler);
            this._onKeyboardPopupMenuHandler = null;
        }
        if (this.motionHandler) {
            this.disconnect(this.motionHandler);
            this.motionHandler = null;
        }
        if (this.buttonReleasedHandler) {
            this.disconnect(this.buttonReleasedHandler);
            this.buttonReleasedHandler = null;
        }
        if (this.scrollHandler) {
            this.disconnect(this.scrollHandler);
            this.scrollHandler = null;
        }
        
        this.currentElement = null;
        this._stopTextCursorTimeout();
        this._redisplay();
        this.closeMenu();
        this.get_parent().set_background_color(null);
        if (save)
            this.savePersistent();
    },
    
    saveAsSvg: function() {
        // stop drawing or writing
        if (this.currentElement && this.currentElement.shape == Shapes.TEXT && this.isWriting) {
            this._stopWriting();
        } else if (this.currentElement && this.currentElement.shape != Shapes.TEXT) {
            this._stopDrawing();
        }
        
        let prefixes = 'xmlns="http://www.w3.org/2000/svg"';
        if (this.elements.some(element => element.shape == Shapes.IMAGE))
            prefixes += ' xmlns:xlink="http://www.w3.org/1999/xlink"';
        let content = `<svg viewBox="0 0 ${this.width} ${this.height}" ${prefixes}>`;
        if (SVG_DEBUG_EXTENDS)
            content = `<svg viewBox="${-this.width} ${-this.height} ${2 * this.width} ${2 * this.height}" xmlns="http://www.w3.org/2000/svg">`;
        let backgroundColorString = this.hasBackground ? this.activeBackgroundColor.to_string() : 'transparent';
        if (backgroundColorString != 'transparent') {
            content += `\n  <rect id="background" width="100%" height="100%" fill="${backgroundColorString}"/>`;
        }
        if (SVG_DEBUG_EXTENDS) {
            content += `\n  <line stroke="black" x1="0" y1="${-this.height}" x2="0" y2="${this.height}"/>`;
            content += `\n  <line stroke="black" x1="${-this.width}" y1="0" x2="${this.width}" y2="0"/>`;
        }
        for (let i = 0; i < this.elements.length; i++) {
            content += this.elements[i].buildSVG(backgroundColorString);
        }
        content += "\n</svg>";
        
        let filename = `${Me.metadata['svg-file-name']} ${getDateString()}.svg`;
        let dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        let path = GLib.build_filenamev([dir, filename]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS))
            return false;
        let success = GLib.file_set_contents(path, content);
        
        if (success) {
            // pass the parent (bgContainer) to Flashspot because coords of this are relative
            let flashspot = new Screenshot.Flashspot(this.get_parent());
            flashspot.fire();
            if (global.play_theme_sound) {
                global.play_theme_sound(0, 'screen-capture', "Save as SVG", null);
            } else if (global.display && global.display.get_sound_player) {
                let player = global.display.get_sound_player();
                player.play_from_theme('screen-capture', "Save as SVG", null);
            }
        }
    },
    
    _saveAsJson: function(name, notify) {
        // stop drawing or writing
        if (this.currentElement && this.currentElement.shape == Shapes.TEXT && this.isWriting) {
            this._stopWriting();
        } else if (this.currentElement && this.currentElement.shape != Shapes.TEXT) {
            this._stopDrawing();
        }
        
        let dir = GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir']]);
        if (!GLib.file_test(dir, GLib.FileTest.EXISTS))
            GLib.mkdir_with_parents(dir, 0o700);
        let path = GLib.build_filenamev([dir, `${name}.json`]);
        
        let oldContents;
        
        if (name == Me.metadata['persistent-file-name']) {
            if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
                oldContents = GLib.file_get_contents(path)[1];
                if (oldContents instanceof Uint8Array)
                    oldContents = ByteArray.toString(oldContents);
            }
            
            // do not create a file to write just an empty array
            if (!oldContents && this.elements.length == 0)
                return;
        }
        
        // do not use "content = JSON.stringify(this.elements, null, 2);", neither "content = JSON.stringify(this.elements);"
        // because of compromise between disk usage and human readability
        let contents = `[\n  ` + new Array(...this.elements.map(element => JSON.stringify(element))).join(`,\n\n  `) + `\n]`;
        
        if (name == Me.metadata['persistent-file-name'] && contents == oldContents)
            return;
        
        GLib.idle_add(GLib.PRIORITY_DEFAULT_IDLE, () => {
            GLib.file_set_contents(path, contents);
            if (notify)
                this.emit('show-osd', 'document-save-symbolic', name, "", -1, false);
            if (name != Me.metadata['persistent-file-name']) {
                this.jsonName = name;
                this.lastJsonContents = contents;
            }
        });
    },
    
    saveAsJsonWithName: function(name) {
        this._saveAsJson(name);
    },
    
    saveAsJson: function() {
        this._saveAsJson(getDateString(), true);
    },
    
    savePersistent: function() {
        this._saveAsJson(Me.metadata['persistent-file-name']);
    },
    
    syncPersistent: function() {
        // do not override peristent.json with an empty drawing when changing persistency setting
        if (!this.elements.length)
            this._loadPersistent();
        else
            this.savePersistent();
            
    },
    
    _loadJson: function(name, notify) {
        // stop drawing or writing
        if (this.currentElement && this.currentElement.shape == Shapes.TEXT && this.isWriting) {
            this._stopWriting();
        } else if (this.currentElement && this.currentElement.shape != Shapes.TEXT) {
            this._stopDrawing();
        }
        this.elements = [];
        this.currentElement = null;
        
        let dir = GLib.get_user_data_dir();
        let path = GLib.build_filenamev([dir, Me.metadata['data-dir'], `${name}.json`]);
        
        if (!GLib.file_test(path, GLib.FileTest.EXISTS))
            return;
        let [success, contents] = GLib.file_get_contents(path);
        if (!success)
            return;
        if (contents instanceof Uint8Array)
            contents = ByteArray.toString(contents);
        this.elements.push(...JSON.parse(contents).map(object => {
            if (object.image)
                object.image = new Files.Image(object.image);
            return new Elements.DrawingElement(object);
        }));
        
        if (notify)
            this.emit('show-osd', 'document-open-symbolic', name, "", -1, false);
        if (name != Me.metadata['persistent-file-name']) {
            this.jsonName = name;
            this.lastJsonContents = contents;
        }
    },
    
    _loadPersistent: function() {
        this._loadJson(Me.metadata['persistent-file-name']);
    },
    
    loadJson: function(name, notify) {
        this._loadJson(name, notify);
        this._redisplay();
    },
    
    loadNextJson: function() {
        let names = getJsonFiles().map(file => file.name);
        
        if (!names.length)
            return;
        
        let nextName = names[this.jsonName && names.indexOf(this.jsonName) != names.length - 1 ? names.indexOf(this.jsonName) + 1 : 0];
        this.loadJson(nextName, true);
    },
    
    loadPreviousJson: function() {
        let names = getJsonFiles().map(file => file.name);
        
        if (!names.length)
            return;
        
        let previousName = names[this.jsonName && names.indexOf(this.jsonName) > 0 ? names.indexOf(this.jsonName) - 1 : names.length - 1];
        this.loadJson(previousName, true);
    },
    
    get drawingContentsHasChanged() {
        let contents = `[\n  ` + new Array(...this.elements.map(element => JSON.stringify(element))).join(`,\n\n  `) + `\n]`;
        return contents != this.lastJsonContents;
    }
});

