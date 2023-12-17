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
/* exported parseFile */


const decoder = new TextDecoder('utf-8');

/*
 * [
 *   [
 *     'palette name 1', // a palette for each column
 *     [
 *       'rgb(...)',
 *       'rgb(...):color display name', // the optional name separated with ':'
 *       ...
 *     ]
 *   ],
 *   [
 *     'palette name 2',
 *     [...]
 *   ],
 *   ...
 * ]
*/

function parse(contents) {
    let lines = contents.split('\n');
    let line, name, columnNumber;

    line = lines.shift();
    if (!line || !line.startsWith('GIMP Palette'))
        log("Missing magic header");

    line = lines.shift();
    if (line.startsWith('Name:')) {
        name = line.slice(5).trim() || file.get_basename();
        line = lines.shift();
    }
    if (line.startsWith('Columns:')) {
        columnNumber = Number(line.slice(8).trim()) || 1;
        line = lines.shift();
    }

    let columns = (new Array(columnNumber)).fill(null).map(() => []);

    lines.forEach((line, index) => {
        if (!line || line.startsWith('#'))
            return;
        
        line = line.split('#')[0].trim();
        
        let [, color, displayName] = line.split(/(^[\d\s]+)/);
        
        let values = color.trim().split(/\D+/gi).filter(value => value >= 0 && value <= 255);
        if (values.length < 3)
            return;
        
        let string = `rgb(${values[0]},${values[1]},${values[2]})`;
        if (displayName.trim())
            string += `:${displayName.trim()}`;
        
        columns[index % columns.length].push(string);
    });

    return columns.map((column, index) => [columnNumber > 1 ? `${name} ${index + 1}` : name, column]);
}

export function parseFile(file) {
    if (!file.query_exists(null))
        return [];
    
    let [, contents] = file.load_contents(null);
    if (contents instanceof Uint8Array)
        contents = decoder.decode(contents);
    
    return parse(contents);
}
