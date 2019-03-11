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

const Cairo = imports.cairo;
const Clutter = imports.gi.Clutter;
const GLib = imports.gi.GLib;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const Mainloop = imports.mainloop;
const Signals = imports.signals;
const St = imports.gi.St;
const Screenshot = imports.ui.screenshot;
const Tweener = imports.ui.tweener;

const ExtensionUtils = imports.misc.extensionUtils;
const Extension = ExtensionUtils.getCurrentExtension();
const Convenience = Extension.imports.convenience;
const Prefs = Extension.imports.prefs;
const _ = imports.gettext.domain(Extension.metadata["gettext-domain"]).gettext;

var Shapes = { NONE: 0, LINE: 1, ELLIPSE: 2, RECTANGLE: 3, TEXT: 4 };
var ShapeNames = { 0: "Free drawing", 1: "Line", 2: "Ellipse", 3: "Rectangle", 4: "Text" };
var LineCapNames = { 0: 'Butt', 1: 'Round', 2: 'Square' };
var LineJoinNames = { 0: 'Miter', 1: 'Round', 2: 'Bevel' };
var FontWeightNames = { 0: 'Normal', 1: 'Bold' };
var FontStyleNames = { 0: 'Normal', 1: 'Italic', 2: 'Oblique' };
var FontFamilyNames = {  0: 'Default', 1: 'Sans-Serif', 2: 'Serif', 3: 'Monospace', 4: 'Cursive', 5: 'Fantasy' };

// DrawingArea is the widget in which we draw, thanks to Cairo.
// It creates and manages a DrawingElement for each "brushstroke".
// It handles pointer/mouse/(touch?) events and some keyboard events.
var DrawingArea = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingArea',
    Extends: St.DrawingArea,

    _init: function(params, monitor, helper, loadJson) {
        this.parent({ style_class: 'draw-on-your-screen', name: params && params.name ? params.name : ""});
        
        // 'style-changed' is emitted when 'this' is added to an actor
        // ('this' needs to be in the stage to query theme_node)
        this.connect('style-changed', this._onStyleChanged.bind(this));
        this.connect('repaint', this._repaint.bind(this));
        
        this.settings = Convenience.getSettings();
        this.emitter = new DrawingAreaEmitter();
        this.monitor = monitor;
        this.helper = helper;
        
        this.elements = [];
        this.undoneElements = [];
        this.currentElement = null;
        this.currentShape = Shapes.NONE;
        this.isSquareArea = false;
        this.hasBackground = false;
        this.textHasCursor = false;
        this.dashedLine = false;
        this.colors = [Clutter.Color.new(0, 0, 0, 255)];
        
        if (loadJson)
            this._loadJson();
    },
    
    _redisplay: function() {
        // force area to emit 'repaint'
        this.queue_repaint();
    },
    
    _onStyleChanged: function() {
        try {
            let themeNode = this.get_theme_node();
            for (let i = 1; i < 10; i++) {
                this.colors[i] = themeNode.get_color('-drawing-color' + i);
            }
            this.activeBackgroundColor = themeNode.get_color('-drawing-background-color');
            this.currentLineWidth = themeNode.get_length('-drawing-line-width');
            this.currentLineJoin = themeNode.get_double('-drawing-line-join');
            this.currentLineCap = themeNode.get_double('-drawing-line-cap');
            this.dashArray = [themeNode.get_length('-drawing-dash-array-on'), themeNode.get_length('-drawing-dash-array-off')];
            this.dashOffset = themeNode.get_length('-drawing-dash-offset');
            let font = themeNode.get_font();
            this.fontFamily = font.get_family();
            this.currentFontWeight = font.get_weight();
            this.currentFontStyle = font.get_style();
        } catch(e) {
            logError(e);
        }
        
        for (let i = 1; i < 10; i++) {
            this.colors[i] = this.colors[i].alpha ? this.colors[i] : this.colors[0];
        }
        this.currentColor = this.colors[1];
        
        this.currentLineWidth = (this.currentLineWidth > 0) ? this.currentLineWidth : 3;
        this.currentLineJoin = ([0, 1, 2].indexOf(this.currentLineJoin) != -1) ? this.currentLineJoin : Cairo.LineJoin.ROUND;
        this.currentLineCap = ([0, 1, 2].indexOf(this.currentLineCap) != -1) ? this.currentLineCap : Cairo.LineCap.ROUND;
        this.currentFontFamilyId = 0;
        this.currentFontWeight = this.currentFontWeight > 500 ? 1 : 0 ;
        // font style enum order of Cairo and Pango are different
        this.currentFontStyle = this.currentFontStyle == 2 ? 1 : ( this.currentFontStyle == 1 ? 2 : 0);
    },
    
    _repaint: function(area) {
        let cr = area.get_context();
        
        for (let i = 0; i < this.elements.length; i++) {
            this.elements[i].buildCairo(cr, false);
            
            let isStraightLine = this.elements[i].shape == Shapes.LINE &&
                                (this.elements[i].points.length < 3 || this.elements[i].points[2] == this.elements[i].points[1] || this.elements[i].points[2] == this.elements[i].points[0]);
            if (this.elements[i].fill && !isStraightLine)
                cr.fill();
            else
                cr.stroke();
        }
        
        if (this.currentElement) {
            this.currentElement.buildCairo(cr, this.textHasCursor);
            cr.stroke();
        }
        
        cr.$dispose();
    },
    
    _onButtonPressed: function(actor, event) {
        let button = event.get_button();
        let [x, y] = event.get_coords();
        let shiftPressed = event.has_shift_modifier();
        
        // stop writing
        if (this.currentElement && this.currentElement.shape == Shapes.TEXT) {
            this._stopWriting();
        }
        
        // hide helper
        if (this.helper.visible && button != 2) {
            this.helper.hideHelp();
            return Clutter.EVENT_STOP;
        }
        
        if (button == 1) {
            this._startDrawing(x, y, false, shiftPressed);
            return Clutter.EVENT_STOP;
        } else if (button == 2) {
            this.toggleShape();
        } else if (button == 3) {
            this._startDrawing(x, y, true, shiftPressed);
            return Clutter.EVENT_STOP;
        }

        return Clutter.EVENT_PROPAGATE;
    },
    
    _onKeyPressed: function(actor, event) {
        if (event.get_key_symbol() == Clutter.Escape) {
            this.emitter.emit('stop-drawing', true);
            return Clutter.EVENT_STOP;
            
        } else if (this.currentElement && this.currentElement.shape == Shapes.TEXT) {
            if (event.get_key_symbol() == Clutter.KEY_BackSpace) {
                this.currentElement.text = this.currentElement.text.slice(0, -1);
                this._updateCursorTimeout();
            } else if (event.has_control_modifier() && event.get_key_symbol() == 118) {
            // Ctrl + V
                St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (clipBoard, clipText) => {
                    this.currentElement.text += clipText;
                    this._updateCursorTimeout();
                    this._redisplay();
                });
                return Clutter.EVENT_STOP;
            } else if (event.get_key_symbol() == Clutter.KEY_Return || event.get_key_symbol() == 65421) {
            // stop writing
            // Clutter.KEY_Return is "Enter" and 65421 is KP_Enter
                this._stopWriting();
            } else {
                let unicode = event.get_key_unicode();
                this.currentElement.text += unicode;
                this._updateCursorTimeout();
            }
            this._redisplay();
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
    
    _startDrawing: function(stageX, stageY, fill, eraser) {
        let [success, startX, startY] = this.transform_stage_point(stageX, stageY);
        
        if (!success)
            return;
        
        this.buttonReleasedHandler = this.connect('button-release-event', (actor, event) => {
            this._stopDrawing();
        });
        
        this.smoothedStroke = this.settings.get_boolean('smoothed-stroke');
        
        this.currentElement = new DrawingElement ({
            shape: this.currentShape == Shapes.TEXT ? Shapes.RECTANGLE : this.currentShape,
            color: this.currentColor.to_string(),
            line: { lineWidth: this.currentLineWidth, lineJoin: this.currentLineJoin, lineCap: this.currentLineCap },
            dash: { array: this.dashedLine ? this.dashArray : [0, 0] , offset: this.dashedLine ? this.dashOffset : 0 },
            fill: fill,
            eraser: eraser,
            transform: { active: false, center: [0, 0], angle: 0, startAngle: 0, ratio: 1 },
            text: '',
            font: { family: (this.currentFontFamilyId == 0 ? this.fontFamily : FontFamilyNames[this.currentFontFamilyId]), weight: this.currentFontWeight, style: this.currentFontStyle },
            points: [[startX, startY]]
        });
        
        this.motionHandler = this.connect('motion-event', (actor, event) => {
            let coords = event.get_coords();
            let [s, x, y] = this.transform_stage_point(coords[0], coords[1]);
            if (!s)
                return;
            let controlPressed = event.has_control_modifier();
            this._updateDrawing(x, y, controlPressed);
        });
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
        
        // skip when the size is too small to be visible (3px) (except for free drawing)
        if (this.currentElement && this.currentElement.points.length >= 2 &&
            (this.currentShape == Shapes.NONE ||
                Math.hypot(this.currentElement.points[1][0] - this.currentElement.points[0][0], this.currentElement.points[1][1] - this.currentElement.points[0][1]) > 3)) {
            
            // start writing
            if (this.currentShape == Shapes.TEXT) {
                this.currentElement.shape = Shapes.TEXT;
                this.currentElement.text = '';
                this.emitter.emit('show-osd', _("Type your text\nand press Enter"), null);
                this._updateCursorTimeout();
                this._redisplay();
                return;
            }
        
            this.elements.push(this.currentElement);
        }
        
        this.currentElement = null;
        this._redisplay();
    },
    
    _updateDrawing: function(x, y, controlPressed) {
        if (!this.currentElement)
            return;
        if (this.currentElement.shape == Shapes.NONE)
            this.currentElement.addPoint(x, y, this.smoothedStroke);
        else if (this.currentElement.shape == Shapes.RECTANGLE && (controlPressed || this.currentElement.transform.active))
            this.currentElement.transformRectangle(x, y);
        else if (this.currentElement.shape == Shapes.ELLIPSE && (controlPressed || this.currentElement.transform.active))
            this.currentElement.transformEllipse(x, y);
        else if (this.currentElement.shape == Shapes.LINE && (controlPressed || this.currentElement.transform.active))
            this.currentElement.transformLine(x, y);
        else
            this.currentElement.points[1] = [x, y];
        this._redisplay();
    },
    
    _stopWriting: function() {
        if (this.currentElement.text.length > 0)
            this.elements.push(this.currentElement);
        this.currentElement = null;
        this._stopCursorTimeout();
        this._redisplay();
    },
    
    _stopCursorTimeout: function() {
        if (this.cursorTimeoutId) {
            Mainloop.source_remove(this.cursorTimeoutId);
            this.cursorTimeoutId = null;
        }
        this.textHasCursor = false;
    },
    
    _updateCursorTimeout: function() {
        this._stopCursorTimeout();
        this.cursorTimeoutId = Mainloop.timeout_add(600, () => {
            this.textHasCursor = !this.textHasCursor;
            this._redisplay();
            return true;
        });
    },
    
    erase: function() {
        this.elements = [];
        this.undoneElements = [];
        this.currentElement = null;
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
            this.currentElement = null;
            this._stopCursorTimeout();
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
    
    toggleSquareArea: function() {
        this.isSquareArea = !this.isSquareArea;
        if (this.isSquareArea) {
            let squareWidth = Math.min(this.monitor.width, this.monitor.height) * 3 / 4;
            this.set_position(Math.floor(this.monitor.width / 2 - squareWidth / 2), Math.floor(this.monitor.height / 2 - squareWidth / 2));
            this.set_size(squareWidth, squareWidth);
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
        this.emitter.emit('show-osd', this.currentColor.to_string(), null);
    },
    
    selectShape: function(shape) {
        this.currentShape = shape;
        this.emitter.emit('show-osd', _(ShapeNames[shape]), null);
    },
    
    toggleShape: function() {
        this.selectShape((this.currentShape == Object.keys(Shapes).length - 1) ? 0 : this.currentShape + 1);
    },
    
    toggleDash: function() {
        this.dashedLine = !this.dashedLine;
        this.emitter.emit('show-osd', this.dashedLine ? _("Dashed line") : _("Full line"), null);
    },
    
    incrementLineWidth: function(increment) {
        this.currentLineWidth = Math.max(this.currentLineWidth + increment, 1);
        this.emitter.emit('show-osd', this.currentLineWidth + "px", this.currentLineWidth);
    },
    
    toggleLineJoin: function() {
        this.currentLineJoin = this.currentLineJoin == 2 ? 0 : this.currentLineJoin + 1;
        this.emitter.emit('show-osd', LineJoinNames[this.currentLineJoin], null);
    },
    
    toggleLineCap: function() {
        this.currentLineCap = this.currentLineCap == 2 ? 0 : this.currentLineCap + 1;
        this.emitter.emit('show-osd', LineCapNames[this.currentLineCap], null);
    },
    
    toggleFontWeight: function() {
        this.currentFontWeight = this.currentFontWeight == 1 ? 0 : this.currentFontWeight + 1;
        if (this.currentElement) {
            this.currentElement.font.weight = this.currentFontWeight;
            this._redisplay();
        }
        this.emitter.emit('show-osd', FontWeightNames[this.currentFontWeight], null);
    },
    
    toggleFontStyle: function() {
        this.currentFontStyle = this.currentFontStyle == 2 ? 0 : this.currentFontStyle + 1;
        if (this.currentElement) {
            this.currentElement.font.style = this.currentFontStyle;
            this._redisplay();
        }
        this.emitter.emit('show-osd', FontStyleNames[this.currentFontStyle], null);
    },
    
    toggleFontFamily: function() {
        this.currentFontFamilyId = this.currentFontFamilyId == 5 ? 0 : this.currentFontFamilyId + 1;
        let currentFontFamily = this.currentFontFamilyId == 0 ? this.fontFamily : FontFamilyNames[this.currentFontFamilyId];
        if (this.currentElement) {
            this.currentElement.font.family = currentFontFamily;
            this._redisplay();
        }
        this.emitter.emit('show-osd',currentFontFamily , null);
    },
    
    toggleHelp: function() {
        if (this.helper.visible)
            this.helper.hideHelp();
        else
            this.helper.showHelp();
    },
    
    get isEmpty() {
        return this.elements.length == 0;
    },
    
    enterDrawingMode: function() {
        this.keyPressedHandler = this.connect('key-press-event', this._onKeyPressed.bind(this));        
        this.buttonPressedHandler = this.connect('button-press-event', this._onButtonPressed.bind(this));
        this.scrollHandler = this.connect('scroll-event', this._onScroll.bind(this));
        this.selectShape(Shapes.NONE);
        this.get_parent().set_background_color(this.hasBackground ? this.activeBackgroundColor : null);
    },
    
    leaveDrawingMode: function(save) {
        if (this.keyPressedHandler) {
            this.disconnect(this.keyPressedHandler);
            this.keyPressedHandler = null;
        }
        if (this.buttonPressedHandler) {
            this.disconnect(this.buttonPressedHandler);
            this.buttonPressedHandler = null;
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
        
        if (this.helper.visible)
            this.helper.hideHelp();
        
        this.currentElement = null;
        this._stopCursorTimeout();
        this.dashedLine = false;
        this._redisplay();
        this.get_parent().set_background_color(null);
        if (save)
            this._saveAsJson();
    },
    
    saveAsSvg: function() {
        // stop drawing or writing
        if (this.currentElement && this.currentElement.shape == Shapes.TEXT) {
            this._stopWriting();
        } else if (this.currentElement && this.currentShape != Shapes.TEXT) {
            this._stopDrawing();
        }
        
        let content = `<svg viewBox="0 0 ${this.width} ${this.height}" xmlns="http://www.w3.org/2000/svg">`;
        let backgroundColorString = this.hasBackground ? this.activeBackgroundColor.to_string() : 'transparent';
        if (backgroundColorString != 'transparent') {
            content += `\n  <rect id="background" width="100%" height="100%" fill="${backgroundColorString}"/>`;
        }
        for (let i = 0; i < this.elements.length; i++) {
            content += this.elements[i].buildSVG(backgroundColorString);
        }
        content += "\n</svg>";
        
        let date = GLib.DateTime.new_now_local();
        let filename = `DrawOnYourScreen ${date.format("%F")} ${date.format("%X")}.svg`;
        let dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
        let path = GLib.build_filenamev([dir, filename]);
        if (GLib.file_test(path, GLib.FileTest.EXISTS))
            return false;
        let success = GLib.file_set_contents(path, content);
        
        if (success) {
            // pass the parent (bgContainer) to Flashspot because coords of this are relative
            let flashspot = new Screenshot.Flashspot(this.get_parent());
            flashspot.fire();
            global.play_theme_sound(0, 'screen-capture', "Save as SVG", null);
        }
    },
    
    _saveAsJson: function() {
        let filename = `DrawOnYourScreen.json`;
        let dir = GLib.get_user_data_dir();
        let path = GLib.build_filenamev([dir, filename]);
        
        let oldContents;
        if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
            oldContents = GLib.file_get_contents(path)[1];
            if (oldContents instanceof Uint8Array)
                oldContents = imports.byteArray.toString(oldContents);
        }
        
        // do not use "content = JSON.stringify(this.elements, null, 2);", neither "content = JSON.stringify(this.elements);"
        // because of compromise between disk usage and human readability
        let contents = `[\n  ` + new Array(...this.elements.map(element => JSON.stringify(element))).join(`,\n\n  `) + `\n]`;
        
        if (contents != oldContents)
            GLib.file_set_contents(path, contents);
    },
    
    _loadJson: function() {
        let filename = `DrawOnYourScreen.json`;
        let dir = GLib.get_user_data_dir();
        let path = GLib.build_filenamev([dir, filename]);
        
        if (!GLib.file_test(path, GLib.FileTest.EXISTS))
            return;
        let [success, contents] = GLib.file_get_contents(path);
        if (!success)
            return;
        if (contents instanceof Uint8Array)
            contents = imports.byteArray.toString(contents);
        this.elements.push(...JSON.parse(contents).map(object => new DrawingElement(object)));
    },
    
    disable: function() {
        this.erase();
    }
});

var DrawingAreaEmitter = new Lang.Class({
    Name: 'DrawingAreaEmitter',
    
    _init: function() {
    }
});
Signals.addSignalMethods(DrawingAreaEmitter.prototype);


// DrawingElement represents a "brushstroke".
// It can be converted into a cairo path as well as a svg element.
// See DrawingArea._startDrawing() to know its params.
var DrawingElement = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingElement',
    
    _init: function(params) {
        for (let key in params)
            this[key] = params[key];
    },
    
    // toJSON is called by JSON.stringify
    toJSON: function() {
        return {
            shape: this.shape,
            color: this.color,
            line: this.line,
            dash: this.dash,
            fill: this.fill,
            eraser: this.eraser,
            transform: this.transform,
            text: this.text,
            font: this.font,
            points: this.points.map((point) => [Math.round(point[0]*100)/100, Math.round(point[1]*100)/100])
        };
    },
    
    buildCairo: function(cr, showTextCursor) {
        cr.setLineCap(this.line.lineCap);
        cr.setLineJoin(this.line.lineJoin);
        cr.setLineWidth(this.line.lineWidth);
        
        if (this.dash.array[0] > 0 && this.dash.array[1] > 0)
            cr.setDash(this.dash.array, this.dash.offset);
        else
            cr.setDash([1000000], 0);
        
        if (this.eraser)
            cr.setOperator(Cairo.Operator.CLEAR);
        else
            cr.setOperator(Cairo.Operator.OVER);
        
        let [success, color] = Clutter.Color.from_string(this.color);
        if (success)
            Clutter.cairo_set_source_color(cr, color);
        
        let [points, shape, trans] = [this.points, this.shape, this.transform];
        
        if (shape == Shapes.LINE && points.length == 3) {
            cr.moveTo(points[0][0], points[0][1]);
            cr.curveTo(points[0][0], points[0][1], points[1][0], points[1][1], points[2][0], points[2][1]);
        } else if (shape == Shapes.NONE || shape == Shapes.LINE) {
            cr.moveTo(points[0][0], points[0][1]);
            for (let j = 1; j < points.length; j++) {
                cr.lineTo(points[j][0], points[j][1]);
            }
            
        } else if (shape == Shapes.ELLIPSE && points.length == 2) {
            this.rotate(cr, trans.angle + trans.startAngle, trans.center[0], trans.center[1]);
            this.scale(cr, trans.ratio, trans.center[0], trans.center[1]);
            let r = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
            cr.arc(points[0][0], points[0][1], r, 0, 2 * Math.PI);
            this.scale(cr, 1 / trans.ratio, trans.center[0], trans.center[1]);
            this.rotate(cr, - (trans.angle + trans.startAngle), trans.center[0], trans.center[1]);
            
        } else if (shape == Shapes.RECTANGLE && points.length == 2) {
            this.rotate(cr, trans.angle, trans.center[0], trans.center[1]);
            cr.rectangle(points[0][0], points[0][1], points[1][0] - points[0][0], points[1][1] - points[0][1]);
            this.rotate(cr, - trans.angle, trans.center[0], trans.center[1]);
            
        } else if (shape == Shapes.TEXT && points.length == 2) {
            this.rotate(cr, trans.angle, trans.center[0], trans.center[1]);
            cr.selectFontFace(this.font.family, this.font.style, this.font.weight);
            cr.setFontSize(Math.abs(points[1][1] - points[0][1]));
            cr.moveTo(Math.min(points[0][0], points[1][0]), Math.max(points[0][1], points[1][1]));
            cr.showText((showTextCursor) ? (this.text + "_") : this.text);
            this.rotate(cr, - trans.angle, trans.center[0], trans.center[1]);
        }
    },
    
    buildSVG: function(bgColor) {
        let row = "\n  ";
        let points = this.points.map((point) => [Math.round(point[0]*100)/100, Math.round(point[1]*100)/100]);
        let color = this.eraser ? bgColor : this.color;
        let isStraightLine = this.shape == Shapes.LINE && (points.length < 3 || points[2] == points[1] || points[2] == points[0]);
        let fill = this.fill && !isStraightLine;
        let attributes = `fill="${fill ? color : 'transparent'}" ` +
                         `stroke="${fill ? 'transparent' : color}" ` +
                         `${fill ? 'stroke-opacity="0"' : 'fill-opacity="0"'} ` +
                         `stroke-width="${this.line.lineWidth}" ` +
                         `stroke-linecap="${LineCapNames[this.line.lineCap].toLowerCase()}" ` +
                         `stroke-linejoin="${LineJoinNames[this.line.lineJoin].toLowerCase()}"`;
                          
        if (this.dash.array[0] > 0 && this.dash.array[1] > 0)
            attributes += ` stroke-dasharray="${this.dash.array[0]} ${this.dash.array[1]}" stroke-dashoffset="${this.dash.offset}"`;
        
        if (this.shape == Shapes.LINE && points.length == 3) {
            row += `<path ${attributes} d="M${points[0][0]} ${points[0][1]}`;
            row += ` C ${points[0][0]} ${points[0][1]}, ${points[1][0]} ${points[1][1]}, ${points[2][0]} ${points[2][1]}`;
            row += `${fill ? 'z' : ''}"/>`;
            
        } else if (this.shape == Shapes.NONE || this.shape == Shapes.LINE) {
            row += `<path ${attributes} d="M${points[0][0]} ${points[0][1]}`;
            for (let i = 1; i < points.length; i++) {
                row += ` L ${points[i][0]} ${points[i][1]}`;
            }
            row += `${fill ? 'z' : ''}"/>`;
            
        } else if (this.shape == Shapes.ELLIPSE && points.length == 2 && this.transform.ratio != 1) {
            let ry = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
            let rx = ry * this.transform.ratio;
            let angle = (this.transform.angle + this.transform.startAngle) * 180 / Math.PI;
            row += `<ellipse ${attributes} cx="${points[0][0]}" cy="${points[0][1]}" rx="${rx}" ry="${ry}" transform="rotate(${angle}, ${points[0][0]}, ${points[0][1]})"/>`;
            
        } else if (this.shape == Shapes.ELLIPSE && points.length == 2) {
            let r = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
            row += `<circle ${attributes} cx="${points[0][0]}" cy="${points[0][1]}" r="${r}"/>`;
            
        } else if (this.shape == Shapes.RECTANGLE && points.length == 2) {
            let transAttribute = "";
            if (this.transform.angle != 0) {
                let angle = this.transform.angle * 180 / Math.PI;
                transAttribute = ` transform="rotate(${angle}, ${this.transform.center[0]}, ${this.transform.center[1]})"`;
            }
            row += `<rect ${attributes} x="${Math.min(points[0][0], points[1][0])}" y="${Math.min(points[0][1], points[1][1])}" ` +
                   `width="${Math.abs(points[1][0] - points[0][0])}" height="${Math.abs(points[1][1] - points[0][1])}"${transAttribute}/>`;
                   
        } else if (this.shape == Shapes.TEXT && points.length == 2) {
            let transAttribute = "";
            if (this.transform.angle != 0) {
                let angle = this.transform.angle * 180 / Math.PI;
                transAttribute = ` transform="rotate(${angle}, ${this.transform.center[0]}, ${this.transform.center[1]})"`;
            }
            attributes = `fill="${color}" ` +
                         `stroke="transparent" ` +
                         `stroke-opacity="0" ` +
                         `font-family="${this.font.family}" ` +
                         `font-size="${Math.abs(points[1][1] - points[0][1])}" ` +
                         `font-weight="${FontWeightNames[this.font.weight].toLowerCase()}" ` +
                         `font-style="${FontStyleNames[this.font.style].toLowerCase()}"`;
            
            row += `<text ${attributes}${transAttribute} x="${Math.min(points[0][0], points[1][0])}" y="${Math.max(points[0][1], points[1][1])}">${this.text}</text>`;
        }
        
        return row;
    },
    
    addPoint: function(x, y, smoothedStroke) {
        this.points.push([x, y]);
        if (smoothedStroke)
            this.smooth(this.points.length - 1);
    },
    
    smooth: function(i) {
        if (i < 2)
            return;
        this.points[i-1] = [(this.points[i-2][0] + this.points[i][0]) / 2, (this.points[i-2][1] + this.points[i][1]) / 2];
    },
    
    smoothAll: function() {
        for (let i = 0; i < this.points.length; i++) {
            this.smooth(i);
        }
    },
    
    rotate: function(cr, angle, x, y) {
        if (angle == 0)
            return;
        cr.translate(x, y);
        cr.rotate(angle);
        cr.translate(-x, -y);
    },
    
    scale: function(cr, ratio, x, y) {
        if (ratio == 1)
            return;
        cr.translate(x, y);
        cr.scale(ratio, 1);
        cr.translate(-x, -y);
    },
    
    transformRectangle: function(x, y) {
        let points = this.points;
        if (points.length < 2 || points[0][0] == points[1][0] || points[0][1] == points[1][1])
            return;
            
        this.transform.center = [points[0][0] + (points[1][0] - points[0][0]) / 2, points[0][1] + (points[1][1] - points[0][1]) / 2];
        
        this.transform.angle = getAngle(this.transform.center[0], this.transform.center[1], points[1][0], points[1][1], x, y);
        this.transform.active = true;
    },
    
    transformEllipse: function(x, y) {
        let points = this.points;
        if (points.length < 2 || points[0][0] == points[1][0] || points[0][1] == points[1][1])
            return;
        
        this.transform.center = [points[0][0], points[0][1]];
        
        let r1 = Math.hypot(points[1][0] - points[0][0], points[1][1] - points[0][1]);
        let r2 = Math.hypot(x - points[0][0], y - points[0][1]);
        this.transform.ratio = r2 / r1;
        
        this.transform.angle = getAngle(this.transform.center[0], this.transform.center[1], points[1][0], points[1][1], x, y);
        if (!this.transform.startAngle)
            // that is the angle between the direction when starting ellipticalizing, and the x-axis
            this.transform.startAngle = getAngle(points[0][0], points[0][1], points[0][0] + 1, points[0][1], points[1][0], points[1][1]);
        this.transform.active = true;
    },
    
    transformLine: function(x, y) {
        if (this.points.length < 2)
            return;
        if (this.points.length == 2)
            this.points[2] = this.points[1];
        this.points[1] = [x, y];
        this.transform.active = true;
    },
});

function getAngle(xO, yO, xA, yA, xB, yB) {
    // calculate angle of rotation in absolute value
    // cos(AOB) = (OA.OB)/(||OA||*||OB||) where OA.OB = (xA-xO)*(xB-xO) + (yA-yO)*(yB-yO)
    let angle = Math.acos( ((xA - xO)*(xB - xO) + (yA - yO)*(yB - yO)) / (Math.hypot(xA - xO, yA - yO) * Math.hypot(xB - xO, yB - yO)) );
    
    // determine the sign of the angle
    // equation of OA: y = ax + b
    let a = (yA - yO) / (xA - xO);
    let b = yA - a*xA;
    if (yB < a*xB + b)
        angle = - angle;
    if (xA < xO)
        angle = - angle;
    return angle;
}

var HELPER_ANIMATION_TIME = 0.25;
var MEDIA_KEYS_SCHEMA = 'org.gnome.settings-daemon.plugins.media-keys';
var MEDIA_KEYS_KEYS = {
    'screenshot': "Screenshot",
    'screenshot-clip': "Screenshot to clipboard",
    'area-screenshot': "Area screenshot",
    'area-screenshot-clip': "Area screenshot to clipboard"
};

// DrawingHelper provides the "help osd" (Ctrl + F1)
// It uses the same texts as in prefs
var DrawingHelper = new Lang.Class({
    Name: 'DrawOnYourScreenDrawingHelper',
    Extends: St.ScrollView,
    
    _init: function(params, monitor) {
        this.parent(params);
        this.monitor = monitor;
        this.hide();
        this.vbox = new St.BoxLayout({ style_class: 'osd-window draw-on-your-screen-helper', vertical: true });
        this.add_actor(this.vbox);
        this.vbox.add(new St.Label({ text: _("Global") }));
        
        let settings = Convenience.getSettings();
        
        for (let settingKey in Prefs.GLOBAL_KEYBINDINGS) {
            let hbox = new St.BoxLayout({ vertical: false });
            if (settingKey.indexOf('-separator-') != -1) {
                this.vbox.add(hbox);
                continue;
            }
            let [keyval, mods] = Gtk.accelerator_parse(settings.get_strv(settingKey)[0]);
            hbox.add(new St.Label({ text: _(Prefs.GLOBAL_KEYBINDINGS[settingKey]) }));
            hbox.add(new St.Label({ text: Gtk.accelerator_get_label(keyval, mods) }), { expand: true });
            this.vbox.add(hbox);
        }
        
        this.vbox.add(new St.Label({ text: _("Internal") }));
        
        for (let i = 0; i < Prefs.OTHER_SHORTCUTS.length; i++) {
            if (Prefs.OTHER_SHORTCUTS[i].desc.indexOf('-separator-') != -1) {
                this.vbox.add(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-separator' }));
                continue;
            }
            let hbox = new St.BoxLayout({ vertical: false });
            hbox.add(new St.Label({ text: _(Prefs.OTHER_SHORTCUTS[i].desc) }));
            hbox.add(new St.Label({ text: _(Prefs.OTHER_SHORTCUTS[i].shortcut) }), { expand: true });
            this.vbox.add(hbox);
        }
        
        this.vbox.add(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-separator' }));
        
        for (let settingKey in Prefs.INTERNAL_KEYBINDINGS) {
            if (settingKey.indexOf('-separator-') != -1) {
                this.vbox.add(new St.BoxLayout({ vertical: false, style_class: 'draw-on-your-screen-separator' }));
                continue;
            }
            let hbox = new St.BoxLayout({ vertical: false });
            let [keyval, mods] = Gtk.accelerator_parse(settings.get_strv(settingKey)[0]);
            hbox.add(new St.Label({ text: _(Prefs.INTERNAL_KEYBINDINGS[settingKey]) }));
            hbox.add(new St.Label({ text: Gtk.accelerator_get_label(keyval, mods) }), { expand: true });
            this.vbox.add(hbox);
        }
        
        let mediaKeysSettings;
        try { mediaKeysSettings = Convenience.getSettings(MEDIA_KEYS_SCHEMA); } catch(e) { return; }
        this.vbox.add(new St.Label({ text: _("System") }));
        
        for (let settingKey in MEDIA_KEYS_KEYS) {
            if (!mediaKeysSettings.settings_schema.has_key(settingKey))
                return;
            let [keyval, mods] = Gtk.accelerator_parse(mediaKeysSettings.get_string(settingKey));
            let hbox = new St.BoxLayout({ vertical: false });
            hbox.add(new St.Label({ text: _(MEDIA_KEYS_KEYS[settingKey]) }));
            hbox.add(new St.Label({ text: Gtk.accelerator_get_label(keyval, mods) }), { expand: true });
            this.vbox.add(hbox);
        }
    },
    
    showHelp: function() {
        this.opacity = 0;
        this.show();
        
        let maxHeight = this.monitor.height*(3/4);
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
        
    },
});
