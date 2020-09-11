/* jslint esversion: 6 */
/* exported Icons, Image, Images, Json, getJsons, getDateString */

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
const ICON_NAMES = ['color', 'dashed-line', 'fillrule-evenodd', 'fillrule-nonzero', 'fill', 'full-line', 'linecap', 'linejoin', 'palette', 'smooth', 'stroke'];

var Icons = {
    get ENTER() { return this._enter || void (this._enter = new Gio.ThemedIcon({ name: 'applications-graphics-symbolic' })) || this._enter; },
    get GRAB() { return this._grab || void (this._grab = new Gio.ThemedIcon({ name: 'input-touchpad-symbolic' })) || this._grab; },
    get LEAVE() { return this._leave || void (this._leave = new Gio.ThemedIcon({ name: 'application-exit-symbolic' })) || this._leave; },
    get OPEN() { return this._open || void (this._open = new Gio.ThemedIcon({ name: 'document-open-symbolic' })) || this._open; },
    get SAVE() { return this._save || void (this._save = new Gio.ThemedIcon({ name: 'document-save-symbolic' })) || this._save; },
    get UNGRAB() { return this._ungrab || void (this._ungrab = new Gio.ThemedIcon({ name: 'touchpad-disabled-symbolic' })) || this._ungrab; }
};

ICON_NAMES.forEach(name => {
    Object.defineProperty(Icons, name.toUpperCase().replace(/-/gi, '_'), {
        get: function() {
            if (!this[`_${name}`]) {
                let file = Gio.File.new_for_path(ICON_DIR.get_child(`${name}-symbolic.svg`).get_path());
                this[`_${name}`] = file.query_exists(null) ? new Gio.FileIcon({ file }) : new Gio.ThemedIcon({ name: 'error-symbolic' });
            }
            return this[`_${name}`];
        }
    });
});

// wrapper around an image file
var Image = new Lang.Class({
    Name: 'DrawOnYourScreenImage',
    
    _init: function(params) {
        for (let key in params)
            this[key] = params[key];
        
        if (this.info) {
            this.displayName = this.info.get_display_name();
            this.contentType = this.info.get_content_type();
        }
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
    
    get thumbnailFile() {
        if (!this._thumbnailFile) {
            if (this.info.has_attribute('thumbnail::path') && this.info.get_attribute_boolean('thumbnail::is-valid')) {
                let thumbnailPath = this.info.get_attribute_as_string('thumbnail::path');
                this._thumbnailFile = Gio.File.new_for_path(thumbnailPath);
            }
        }
        return this._thumbnailFile || null;
    },
    
    // only called from menu or area so this.file exists
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
            if (this.file)
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
            else
                this._bytes = new GLib.Bytes(GLib.base64_decode(this.base64));
        }
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

// Get images with getPrevious, getNext, or by iterating over it.
var Images = {
    _images: [],
    _clipboardImages: [],
    _upToDate: false,
    
    _clipboardImagesContains: function(file) {
        return this._clipboardImages.some(image => image.file.equal(file));
    },
    
    _getImages: function() {
        if (this._upToDate)
            return this._images;
        
        let images = [];
        let userLocation = Me.drawingSettings.get_string('image-location') || DEFAULT_USER_IMAGE_LOCATION;
        let userDirectory = Gio.File.new_for_commandline_arg(userLocation);
        
        [EXAMPLE_IMAGE_DIRECTORY, userDirectory].forEach(directory => {
            let enumerator;
            try {
                enumerator = directory.enumerate_children('standard::,thumbnail::', Gio.FileQueryInfoFlags.NONE, null);
            } catch(e) {
                return;
            }
            
            let info = enumerator.next_file(null);
            while (info) {
                let file = enumerator.get_child(info);
                
                if (info.get_content_type().indexOf('image') == 0 && !this._clipboardImagesContains(file)) {
                    let index = this._images.findIndex(image => image.file.equal(file));
                    if (index != -1)
                        images.push(this._images[index]);
                    else
                        images.push(new Image({ file, info }));
                }
                
                info = enumerator.next_file(null);
            }
            enumerator.close(null);
        });
        
        this._images = images.concat(this._clipboardImages)
                             .sort((a, b) => a.toString().localeCompare(b.toString()));
        this._upToDate = true;
        return this._images;
    },
    
    [Symbol.iterator]: function() {
        return this._getImages()[Symbol.iterator]();
    },
    
    getNext: function(currentImage) {
        let images = this._getImages();
        let index = currentImage ? images.findIndex(image => image.file.equal(currentImage.file)) : 0;
        return images[index == images.length - 1 ? 0 : index + 1] || null;
    },
    
    getPrevious: function(currentImage) {
        let images = this._getImages();
        let index = currentImage ? images.findIndex(image => image.file.equal(currentImage.file)) : 0;
        return images[index <= 0 ? images.length - 1 : index - 1] || null;
    },
    
    reset: function() {
        this._upToDate = false;
    },
    
    addImagesFromClipboard: function(callback) {
        Clipboard.get_text(CLIPBOARD_TYPE, (clipBoard, text) => {
            if (!text)
                return;

            let lines = text.split('\n');
            if (lines[0] == 'x-special/nautilus-clipboard')
                lines = lines.slice(2);
            
            let images = lines.filter(line => !!line)
                              .map(line => Gio.File.new_for_commandline_arg(line))
                              .filter(file => file.query_exists(null))
                              .map(file => [file, file.query_info('standard::,thumbnail::', Gio.FileQueryInfoFlags.NONE, null)])
                              .filter(pair => pair[1].get_content_type().indexOf('image') == 0)
                              .map(pair => new Image({ file: pair[0], info: pair[1] }));
            
            // Prevent duplicated
            images.filter(image => !this._clipboardImagesContains(image.file))
                  .forEach(image => this._clipboardImages.push(image));
            
            if (images.length) {
                this.reset();
                let allImages = this._getImages();
                let lastFile = images[images.length - 1].file;
                let index = allImages.findIndex(image => image.file.equal(lastFile));
                callback(allImages[index]);
            }
        });
    }
};

// wrapper around a json file
var Json = new Lang.Class({
    Name: 'DrawOnYourScreenJson',
    
    _init: function(params) {
        for (let key in params)
            this[key] = params[key];
    },
    
    toString: function() {
        return this.displayName || this.name;
    },
    
    delete: function() {
        this.file.delete(null);
    },
    
    get file() {
        if (!this._file && this.name) 
            this._file = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir'], `${this.name}.json`]));
        
        return this._file || null;
    },
    
    set file(file) {
        this._file = file;
    },
    
    get contents() {
        let success_, contents;
        try {
            [success_, contents] = this.file.load_contents(null);
            if (contents instanceof Uint8Array)
                contents = ByteArray.toString(contents);
        } catch(e) {
            return null;
        }
        return contents;
    },
    
    set contents(contents) {
        try {
            this.file.replace_contents(contents, null, false, Gio.FileCreateFlags.NONE, null);
        } catch(e) {
            this.file.get_parent().make_directory_with_parents(null);
            this.file.replace_contents(contents, null, false, Gio.FileCreateFlags.NONE, null);
        }
    }
});

var getJsons = function() {
    let directory = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir']]));
    
    let enumerator;
    try {
        enumerator = directory.enumerate_children('standard::name,standard::display-name,standard::content-type,time::modified', Gio.FileQueryInfoFlags.NONE, null);
    } catch(e) {
        return [];
    }
    
    let jsons = [];
    let fileInfo = enumerator.next_file(null);
    while (fileInfo) {
        if (fileInfo.get_content_type().indexOf('json') != -1 && fileInfo.get_name() != `${Me.metadata['persistent-file-name']}.json`) {
            let file = enumerator.get_child(fileInfo);
            jsons.push(new Json({
                file,
                name: fileInfo.get_name().slice(0, -5),
                displayName: fileInfo.get_display_name().slice(0, -5),
                // fileInfo.get_modification_date_time: Gio 2.62+
                modificationUnixTime: fileInfo.get_attribute_uint64('time::modified')
            }));
        }
        fileInfo = enumerator.next_file(null);
    }
    enumerator.close(null);
    
    jsons.sort((a, b) => {
        return b.modificationUnixTime - a.modificationUnixTime;
    });
    
    return jsons;
};

var getDateString = function() {
    let date = GLib.DateTime.new_now_local();
    return `${date.format("%F")} ${date.format("%X")}`;
};
