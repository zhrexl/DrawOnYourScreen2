/* jslint esversion: 6 */
/* exported Icons, Image, Images, Json, Jsons, getDateString, saveSvg */

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
const Gdk = imports.gi.Gdk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const St = imports.gi.St;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const EXAMPLE_IMAGE_DIRECTORY = Me.dir.get_child('data').get_child('images');
const DEFAULT_USER_IMAGE_LOCATION = GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir'], 'images']);
const Clipboard = St.Clipboard.get_default();
const CLIPBOARD_TYPE = St.ClipboardType.CLIPBOARD;
const ICON_DIR = Me.dir.get_child('data').get_child('icons');
const ICON_NAMES = [
    'arc', 'color', 'dashed-line', 'document-export', 'fillrule-evenodd', 'fillrule-nonzero', 'fill', 'full-line', 'linecap', 'linejoin', 'palette', 'smooth', 'stroke',
    'tool-ellipse', 'tool-line', 'tool-mirror', 'tool-move', 'tool-none', 'tool-polygon', 'tool-polyline', 'tool-rectangle', 'tool-resize',
];
const ThemedIconNames = {
    ENTER: 'applications-graphics', LEAVE: 'application-exit',
    GRAB: 'input-touchpad', UNGRAB: 'touchpad-disabled',
    OPEN: 'document-open', SAVE: 'document-save',
    FONT_FAMILY: 'font-x-generic', FONT_STYLE: 'format-text-italic', FONT_WEIGHT:'format-text-bold',
    LEFT_ALIGNED: 'format-justify-left', RIGHT_ALIGNED: 'format-justify-right',
    TOOL_IMAGE: 'insert-image', TOOL_TEXT: 'insert-text',
};

var Icons = {};

ICON_NAMES.forEach(name => {
    Object.defineProperty(Icons, name.toUpperCase().replace(/-/gi, '_'), {
        get: function() {
            if (!this[`_${name}`]) {
                let file = Gio.File.new_for_path(ICON_DIR.get_child(`${name}-symbolic.svg`).get_path());
                this[`_${name}`] = file.query_exists(null) ? new Gio.FileIcon({ file }) : new Gio.ThemedIcon({ name: 'action-unavailable-symbolic' });
            }
            return this[`_${name}`];
        }
    });
});

Object.keys(ThemedIconNames).forEach(key => {
    Object.defineProperty(Icons, key, {
        get: function() {
            if (!this[`_${key}`])
                this[`_${key}`] = new Gio.ThemedIcon({ name: `${ThemedIconNames[key]}-symbolic` });
            return this[`_${key}`];
        }
    });
});

// Wrapper around image data. If not subclassed, it is used when loading in the area an image element for a drawing file (.json)
// and it takes { displayName, contentType, base64, hash } as params.
var Image = new Lang.Class({
    Name: 'DrawOnYourScreenImage',
    
    _init: function(params) {
        for (let key in params)
            this[key] = params[key];
    },
    
    toString: function() {
        return this.displayName;
    },
    
    toJson: function() {
        return {
            displayName: this.displayName,
            contentType: this.contentType,
            base64: this.base64,
            hash: this.hash
        };
    },
    
    get bytes() {
        if (!this._bytes)
            this._bytes = new GLib.Bytes(GLib.base64_decode(this.base64));
        return this._bytes;
    },
    
    get base64() {
        if (!this._base64)
            this._base64 = GLib.base64_encode(this.bytes.get_data());
        return this._base64;
    },
    
    set base64(base64) {
        this._base64 = base64;
    },
    
    // hash is not used
    get hash() {
        if (!this._hash)
            this._hash = this.bytes.hash();
        return this._hash;
    },
    
    set hash(hash) {
        this._hash = hash;
    },
    
    get pixbuf() {
        if (!this._pixbuf) {
            let stream = Gio.MemoryInputStream.new_from_bytes(this.bytes);
            this._pixbuf = GdkPixbuf.Pixbuf.new_from_stream(stream, null);
            stream.close(null);
        }
        return this._pixbuf;
    },
    
    getPixbufAtScale: function(width, height) {
        let stream = Gio.MemoryInputStream.new_from_bytes(this.bytes);
        let pixbuf = GdkPixbuf.Pixbuf.new_from_stream_at_scale(stream, width, height, true, null);
        stream.close(null);
        return pixbuf;
    },
    
    setCairoSource: function(cr, x, y, width, height, preserveAspectRatio) {
        let pixbuf = preserveAspectRatio ? this.getPixbufAtScale(width, height)
                                         : this.pixbuf.scale_simple(width, height, GdkPixbuf.InterpType.BILINEAR);
        Gdk.cairo_set_source_pixbuf(cr, pixbuf, x, y);
    }
});

// Add a gicon generator to Image. It is used with image files and it takes { file, info } as params.
const ImageWithGicon = new Lang.Class({
    Name: 'DrawOnYourScreenImageWithGicon',
    Extends: Image,
    
    get displayName() {
        return this.info.get_display_name();
    },
    
    get contentType() {
        return this.info.get_content_type();
    },
    
    get thumbnailFile() {
        if (!this._thumbnailFile) {
            if (this.info.has_attribute('thumbnail::path') && this.info.get_attribute_boolean('thumbnail::is-valid')) {
                let thumbnailPath = this.info.get_attribute_as_string('thumbnail::path');
                this._thumbnailFile = Gio.File.new_for_path(thumbnailPath);
            }
        }
        return this._thumbnailFile || null;
    },
    
    get gicon() {
        if (!this._gicon)
            this._gicon = new Gio.FileIcon({ file: this.thumbnailFile || this.file });
        return this._gicon;
    },
    
    // use only thumbnails in menu (memory)
    get thumbnailGicon() {
        if (this.contentType != 'image/svg+xml' && !this.thumbnailFile)
            return null;
        
        return this.gicon;
    },
    
    get bytes() {
        if (!this._bytes) {
            try {
                // load_bytes available in GLib 2.56+
                this._bytes = this.file.load_bytes(null)[0];
            } catch(e) {
                let [, contents] = this.file.load_contents(null);
                if (contents instanceof Uint8Array)
                    this._bytes = ByteArray.toGBytes(contents);
                else
                    this._bytes = contents.toGBytes();
            }
        }
        return this._bytes;
    }
});

// It is directly generated from a Json object, without an image file. It takes { bytes, displayName, gicon } as params.
const ImageFromJson = new Lang.Class({
    Name: 'DrawOnYourScreenImageFromJson',
    Extends: Image,
    contentType: 'image/svg+xml',
    
    get bytes() {
        return this._bytes;
    },
    
    set bytes(bytes) {
        this._bytes = bytes;
    }
});

// Access images with getPrevious, getNext, getSorted or by iterating over it.
var Images = {
    _images: [],
    _clipboardImages: [],
    _upToDate: false,
    
    disable: function() {
        this._images = [];
        this._clipboardImages = [];
        this._upToDate = false;
    },
    
    _clipboardImagesContains: function(file) {
        return this._clipboardImages.some(image => image.file.equal(file));
    },
    
    // Firstly iterate over the extension directory that contains Example.svg,
    // secondly iterate over the directory that was configured by the user in prefs,
    // finally iterate over the images pasted from the clipboard.
    [Symbol.iterator]: function() {
        if (this._upToDate)
            return this._images.concat(this._clipboardImages)[Symbol.iterator]();
        
        this._upToDate = true;
        let oldImages = this._images;
        let newImages = this._images = [];
        let clipboardImagesContains = this._clipboardImagesContains.bind(this);
        let clipboardIterator = this._clipboardImages[Symbol.iterator]();
        
        return {
            getExampleEnumerator: function() {
                try {
                    return EXAMPLE_IMAGE_DIRECTORY.enumerate_children('standard::,thumbnail::', Gio.FileQueryInfoFlags.NONE, null);
                } catch(e) {
                    return this.getUserEnumerator();
                }
            },
            
            getUserEnumerator: function() {
                try {
                    let userLocation = Me.drawingSettings.get_string('image-location') || DEFAULT_USER_IMAGE_LOCATION;
                    let userDirectory = Gio.File.new_for_commandline_arg(userLocation);
                    return userDirectory.enumerate_children('standard::,thumbnail::', Gio.FileQueryInfoFlags.NONE, null);
                } catch(e) {
                    return null;
                }
            },
            
            get enumerator() {
                if (this._enumerator === undefined)
                    this._enumerator = this.getExampleEnumerator();
                else if (this._enumerator && this._enumerator.get_container().equal(EXAMPLE_IMAGE_DIRECTORY) && this._enumerator.is_closed())
                    this._enumerator = this.getUserEnumerator();
                else if (this._enumerator && this._enumerator.is_closed())
                    this._enumerator = null;
                
                return this._enumerator;
            },
            
            next: function() {
                if (!this.enumerator)
                    return clipboardIterator.next();
                
                let info = this.enumerator.next_file(null);
                if (!info) {
                    this.enumerator.close(null);
                    return this.next();
                }
                
                let file = this.enumerator.get_child(info);
                
                if (info.get_content_type().indexOf('image') == 0 && !clipboardImagesContains(file)) {
                    let image = oldImages.find(oldImage => oldImage.file.equal(file)) || new ImageWithGicon({ file, info });
                    newImages.push(image);
                    return { value: image, done: false };
                } else {
                    return this.next();
                }
            }
        };
    },
    
    getSorted: function() {
        return [...this].sort((a, b) => a.toString().localeCompare(b.toString()));
    },
    
    getNext: function(currentImage) {
        let images = this.getSorted();
        let index = currentImage && currentImage.file ? images.findIndex(image => image.file.equal(currentImage.file)) : -1;
        return images[index == images.length - 1 ? 0 : index + 1] || null;
    },
    
    getPrevious: function(currentImage) {
        let images = this.getSorted();
        let index = currentImage && currentImage.file ? images.findIndex(image => image.file.equal(currentImage.file)) : -1;
        return images[index <= 0 ? images.length - 1 : index - 1] || null;
    },
    
    reset: function() {
        this._upToDate = false;
    },
    
    addImagesFromClipboard: function(callback) {
        Clipboard.get_text(CLIPBOARD_TYPE, (clipboard, text) => {
            if (!text)
                return;
            
            // Since 3.38 there is a line terminator character, that has to be removed with .trim().
            let lines = text.split('\n').map(line => line.trim());
            if (lines[0] == 'x-special/nautilus-clipboard')
                lines = lines.slice(2);
            
            let images = lines.filter(line => !!line)
                              .map(line => Gio.File.new_for_commandline_arg(line))
                              .filter(file => file.query_exists(null))
                              .map(file => [file, file.query_info('standard::,thumbnail::', Gio.FileQueryInfoFlags.NONE, null)])
                              .filter(pair => pair[1].get_content_type().indexOf('image') == 0)
                              .map(pair => new ImageWithGicon({ file: pair[0], info: pair[1] }));
            
            // Prevent duplicated
            images.filter(image => !this._clipboardImagesContains(image.file))
                  .forEach(image => this._clipboardImages.push(image));
            
            if (images.length) {
                this.reset();
                let lastFile = images[images.length - 1].file;
                callback(this._clipboardImages.find(image => image.file.equal(lastFile)));
            }
        });
    }
};

// Wrapper around a json file (drawing saves).
var Json = new Lang.Class({
    Name: 'DrawOnYourScreenJson',
    
    _init: function(params) {
        for (let key in params)
            this[key] = params[key];
    },
    
    get isPersistent() {
        return this.name == Me.metadata['persistent-file-name'];
    },
    
    toString: function() {
        return this.displayName || this.name;
    },
    
    delete: function() {
        this.file.delete(null);
    },
    
    get file() {
        if (!this._file) 
            this._file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir'], `${this.name}.json`]));
        
        return this._file;
    },
    
    set file(file) {
        this._file = file;
    },
    
    get contents() {
        if (this._contents === undefined) {
            try {
                [, this._contents] = this.file.load_contents(null);
                if (this._contents instanceof Uint8Array)
                    this._contents = ByteArray.toString(this._contents);
            } catch(e) {
                this._contents = null;
            }
        }
        
        return this._contents;
    },
    
    set contents(contents) {
        if (this.isPersistent && (this.contents == contents || !this.contents && contents == '[]'))
            return;
        
        try {
            this.file.replace_contents(contents, null, false, Gio.FileCreateFlags.NONE, null);
        } catch(e) {
            this.file.get_parent().make_directory_with_parents(null);
            this.file.replace_contents(contents, null, false, Gio.FileCreateFlags.NONE, null);
        }
        
        this._contents = contents;
    },
    
    addSvgContents: function(getGiconSvgContent, getImageSvgContent) {
        let giconSvgBytes = new GLib.Bytes(getGiconSvgContent());
        this.gicon = Gio.BytesIcon.new(giconSvgBytes);
        this.getImageSvgBytes = () => new GLib.Bytes(getImageSvgContent());
    },
    
    get image() {
        if (!this._image)
            this._image = new ImageFromJson({ bytes: this.getImageSvgBytes(), gicon: this.gicon, displayName: this.displayName });
        
        return this._image;
    }
});

// Access jsons with getPersistent, getDated, getNamed, getPrevious, getNext, getSorted or by iterating over it.
var Jsons = {
    _jsons: [],
    _upToDate: false,
    
    disable: function() {
        if (this._monitor) {
            this._monitor.disconnect(this._monitorHandler);
            this._monitor.cancel();
        }
        
        delete this._monitor;
        delete this._persistent;
        
        this._jsons = [];
        this._upToDate = false;
    },
    
    _updateMonitor: function() {
        if (this._monitor)
            return;
        
        let directory = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir']]));
        this._monitor = directory.monitor(Gio.FileMonitorFlags.NONE, null);
        this._monitorHandler = this._monitor.connect('changed', (monitor, file) => {
            if (file.get_basename() != `${Me.metadata['persistent-file-name']}.json` && file.get_basename().indexOf('.goutputstream'))
                this.reset();
        });
    },
    
    [Symbol.iterator]: function() {
        if (this._upToDate)
            return this._jsons[Symbol.iterator]();
        
        this._updateMonitor();
        this._upToDate = true;
        let newJsons = this._jsons = [];
        
        return {
            get enumerator() {
                if (this._enumerator === undefined) {
                    try {
                        let directory = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir']]));
                        this._enumerator = directory.enumerate_children('standard::name,standard::display-name,standard::content-type,time::modified', Gio.FileQueryInfoFlags.NONE, null);
                    } catch(e) {
                        this._enumerator = null;
                    }
                }
                
                return this._enumerator;
            },
            
            next: function() {
                if (!this.enumerator || this.enumerator.is_closed())
                    return { done: true };
                
                let info = this.enumerator.next_file(null);
                if (!info) {
                    this.enumerator.close(null);
                    return this.next();
                }
                
                let file = this.enumerator.get_child(info);
                
                if (info.get_content_type().indexOf('json') != -1 && info.get_name() != `${Me.metadata['persistent-file-name']}.json`) {
                    let json = new Json({
                        file, name: info.get_name().slice(0, -5),
                        displayName: info.get_display_name().slice(0, -5),
                        // info.get_modification_date_time: Gio 2.62+
                        modificationUnixTime: info.get_attribute_uint64('time::modified')
                    });
                    
                    newJsons.push(json);
                    return { value: json, done: false };
                } else {
                    return this.next();
                }
            }
        };
    },
    
    getSorted: function() {
        return [...this].sort((a, b) => b.modificationUnixTime - a.modificationUnixTime);
    },
    
    getNext: function(currentJson) {
        let jsons = this.getSorted();
        let index = currentJson ? jsons.findIndex(json => json.name == currentJson.name) : -1;
        return jsons[index == jsons.length - 1 ? 0 : index + 1] || null;
    },
    
    getPrevious: function(currentJson) {
        let jsons = this.getSorted();
        let index = currentJson ? jsons.findIndex(json => json.name == currentJson.name) : -1;
        return jsons[index <= 0 ? jsons.length - 1 : index - 1] || null;
    },
    
    getPersistent: function() {
        if (!this._persistent)
            this._persistent = new Json({ name: Me.metadata['persistent-file-name'] });
        
        return this._persistent;
    },
    
    getDated: function() {
        return new Json({ name: getDateString() });
    },
    
    getNamed: function(name) {
        return [...this].find(json => json.name == name) || new Json({ name });
    },
    
    reset: function() {
        this._upToDate = false;
    }
};

var getDateString = function() {
    let date = GLib.DateTime.new_now_local();
    return `${date.format("%F")} ${date.format("%X")}`;
};

var saveSvg = function(content) {
    let filename = `${Me.metadata['svg-file-name']} ${getDateString()}.svg`;
    let dir = GLib.get_user_special_dir(GLib.UserDirectory.DIRECTORY_PICTURES);
    let path = GLib.build_filenamev([dir, filename]);
    let file = Gio.File.new_for_path(path);
    if (file.query_exists(null))
        return false;
    
    try {
        return file.replace_contents(content, null, false, Gio.FileCreateFlags.NONE, null)[0];
    } catch(e) {
        return false;
    }
};

