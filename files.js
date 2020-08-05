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
const Gdk = imports.gi.Gdk;
const GdkPixbuf = imports.gi.GdkPixbuf;
const Gio = imports.gi.Gio;
const GLib = imports.gi.GLib;
const Lang = imports.lang;

const ExtensionUtils = imports.misc.extensionUtils;
const Me = ExtensionUtils.getCurrentExtension();
const EXAMPLE_IMAGES = Me.dir.get_child('data').get_child('images');
const USER_IMAGES = Gio.File.new_for_path(GLib.build_filenamev([GLib.get_user_data_dir(), Me.metadata['data-dir'], 'images']));

// wrapper around an image file
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
            _base64: this.base64,
            _hash: this.hash
        };
    },
    
    // only called from menu so file exists
    get gicon() {
        if (!this._gicon)
            this._gicon = new Gio.FileIcon({ file: this.file });
        return this._gicon;
    },
    
    get bytes() {
        if (!this._bytes) {
            if (this.file)
                this._bytes = this.file.load_bytes(null)[0];
            else
                this._bytes = new GLib.Bytes(GLib.base64_decode(this._base64));
        }
        return this._bytes;
    },
    
    get base64() {
        if (!this._base64)
            this._base64 = GLib.base64_encode(this.bytes.get_data());
        return this._base64;
    },
    
    get hash() {
        if (!this._hash)
            this._hash = this.bytes.hash();
        return this._hash;
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

var getImages = function() {
    let images = [];
    
    [EXAMPLE_IMAGES, USER_IMAGES].forEach(directory => {
        let enumerator;
        try {
            enumerator = directory.enumerate_children('standard::display-name,standard::content-type', Gio.FileQueryInfoFlags.NONE, null);
        } catch(e) {
            return;
        }
        
        let fileInfo = enumerator.next_file(null);
        while (fileInfo) {
            if (fileInfo.get_content_type().indexOf('image') == 0)
                images.push(new Image({ file: enumerator.get_child(fileInfo), contentType: fileInfo.get_content_type(), displayName: fileInfo.get_display_name() }));
            fileInfo = enumerator.next_file(null);
        }
        enumerator.close(null);
    });
    
    images.sort((a, b) => {
        return b.displayName < a.displayName;
    });
    
    return images;
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
