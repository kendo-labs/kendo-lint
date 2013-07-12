// quick'n'dirty HTML parser.

var SYS = require("util");
var FS = require("fs");

var WHITESPACE_CHARS = " \u00a0\n\r\t\f\u000b\u200b\u180e\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000";

var NAME_START_CHAR = [
    ":",
    "A-Z",
    "_",
    "a-z",
    "\\u00C0-\\u00D6",
    "\\u00D8-\\u00F6",
    "\\u00F8-\\u02FF",
    "\\u0370-\\u037D",
    "\\u037F-\\u1FFF",
    "\\u200C-\\u200D",
    "\\u2070-\\u218F",
    "\\u2C00-\\u2FEF",
    "\\u3001-\\uD7FF",
    "\\uF900-\\uFDCF",
    "\\uFDF0-\\uFFFD",
];

var NAME_CHAR = NAME_START_CHAR.concat([ "\\-", ".", "0-9", "\\u00B7", "\\u0300-\\u036F", "\\u203F-\\u2040" ]);

var RX_NAME_START_CHAR = new RegExp("[" + NAME_START_CHAR.join("") + "]", "i");
var RX_NAME_CHAR = new RegExp("[" + NAME_CHAR.join("") + "]", "i");

var RX_NAME = new RegExp("^([" + NAME_START_CHAR.join("") + "][" + NAME_CHAR.join("") + "]*)");
var RX_CHAR_REF = /^&#([0-9]+|x[0-9a-fA-F]+);/;
var RX_ENTITY_REF = new RegExp("^&([" + NAME_START_CHAR.join("") + "][" + NAME_CHAR.join("") + "]*);", "i");

function InputStream(text) {
    this.pos = 0;
    this.line = 1;
    this.col = 0;
    this.text = text;
    this.len = text.length;
};

InputStream.prototype = {
    peek: function() {
        if (this.pos < this.len)
            return this.text.charAt(this.pos);
        return null;
    },
    next: function() {
        if (this.pos < this.len) {
            var ch = this.text.charAt(this.pos++);
            if (ch == "\n") {
                ++this.line;
                this.col = 0;
            } else {
                ++this.col;
            }
            return ch;
        }
        return null;
    },
    get: function(rx) {
        var m = this.looking_at(rx);
        if (m) {
            this.forward(m[0].length);
            return m;
        }
    },
    forward: function(n) {
        while (n-- > 0) this.next();
    },
    looking_at: function(rx) {
        if (typeof rx == "string") {
            return this.text.substr(this.pos, rx.length) == rx ? [ rx ] : null;
        }
        return rx.exec(this.text.substr(this.pos));
    },
    save: function() {
        return {
            line: this.line,
            col: this.col,
            pos: this.pos,
        };
    },
    restore: function(state) {
        this.pos = state.pos;
        this.line = state.line;
        this.col = state.col;
    }
};

function parse(input) {

    input = new InputStream(input);

    var errors = [];

    function next() { return input.next() }
    function peek() { return input.peek() }
    function eof() { return peek() == null }
    function looking_at(thing) { return input.looking_at(thing) }
    function get(thing) { return input.get(thing) }

    function push_error(msg, pos) {
        errors.push({
            err : msg,
            loc : pos || input.save()
        });
    }

    function read_while(pred) {
        var ret = "";
        while (!eof() && pred(peek())) ret += next();
        return ret;
    }

    function dumptag(tag) {
        var ret = "<";
        if (tag.type == "closetag") {
            ret += "/";
        }
        ret += tag.name + "[" + tag.loc.line + ":" + tag.loc.col + "]>";
        return ret;
    }

    function read_text(tag) {
        var nodes = [];
        var text = "";
        function dumptext() {
            if (text) nodes.push(text);
            text = "";
        }
        function maybe(reader) {
            var state = input.save();
            var thing = reader();
            if (thing) {
                dumptext();
                nodes.push(thing);
            } else {
                input.restore(state);
                text += next();
            }
        }
        while (!eof()) {
            switch (peek()) {
              case "<":
                if (looking_at("</")) {
                    var pos = input.save();
                    var close = read_close_tag();
                    if (!close) {
                        input.restore(pos);
                        text += next();
                    } else {
                        if (!tag || tag.name != close.name) {
                            push_error("Misplaced close tag: " + dumptag(close) + " (should be a " + dumptag(tag) + ")", pos);
                        }
                        if (tag) {
                            tag.closed = close;
                        }
                        dumptext();
                        return nodes;
                    }
                }
                else if (looking_at("<!--")) {
                    maybe(read_comment);
                }
                // else if (looking_at("<!")) {
                //     maybe(read_declaration);
                // }
                else {
                    maybe(read_tag);
                }
                break;

              case "&":
                maybe(read_entity);
                break;

              default:
                text += next();
            }
        }
        dumptext();
        return nodes;
    }

    function skip_whitespace() {
        read_while(function(ch){ return WHITESPACE_CHARS.indexOf(ch) >= 0 });
    }

    function read_close_tag() {
        var pos = input.save();
        input.forward(2);       // skip </
        var m = get(RX_NAME);
        if (m) {
            read_while(function(ch){ return ch != ">" });
            next();
            return {
                type   : "closetag",
                name   : m[1],
                loc    : pos,
                endloc : input.save()
            };
        }
    }

    function read_tag() {
        var pos = input.save();
        next();                 // skip <
        var m = get(RX_NAME);
        if (m) {
            var tag = {
                type: "tag",
                name: m[1],
                attr: [],
                loc: pos
            };
            while (!eof()) {
                skip_whitespace();
                if (get("/>")) {
                    tag.endloc = input.save();
                    return tag;
                }
                if (get(">")) {
                    tag.endloc = input.save();
                    break;
                }
                var att = read_attribute();
                if (att) tag.attr.push(att);
                else next();
                skip_whitespace();
            }
            tag.body = read_text(tag);
            return tag;
        }
    }

    function read_entity() {
        var m = get(RX_CHAR_REF);
        if (m) return {
            type  : "char",
            value : m[1],
            code  : (m[1].charAt(0) == "x"
                     ? parseInt(m[1].substr(1), 16)
                     : parseInt(m[1], 10))
        };
        var m = get(RX_ENTITY_REF);
        if (m) return {
            type  : "entity",
            value : m[1]
        };
    }

    function read_string() {
        var q = next();
        if (q == "'" || q == "\"") {
            // should expand entities, but oh well.
            var str = read_while(function(ch){
                if (ch == "<") push_error("Misplaced < character in string");
                return ch != q;
            });
            next();
            return str;
        } else return q + read_while(function(ch){
            return WHITESPACE_CHARS.indexOf(ch) < 0;
        });
    }

    function read_attribute() {
        var pos = input.save();
        var m = get(RX_NAME);
        if (!m) return;
        skip_whitespace();
        if (looking_at("=")) {
            next();
            return {
                name: m[1],
                loc: pos,
                valoc: input.save(),
                value: read_string(),
            };
        }
        return {
            name: m[1],
            loc: pos
        };
    }

    function read_comment() {
        var pos = input.save();
        input.forward(4);       // skip <!--
        var comment = read_while(function(){
            return !looking_at("-->");
        });
        input.forward(3);
        return {
            type    : "comment",
            loc     : pos,
            endloc  : input.save(),
            content : comment,
        };
    }

    function read_cdata() {
    }

    function read_script() {
    }

    function read_style() {
    }

    var body = read_text();
    if (body.length == 1) {
        body[0].errors = errors;
        return body[0];
    }

    return {
        type: "root",
        errors: errors,
        body: body
    };
}


var code = FS.readFileSync("/home/mishoo/telerik/bs/docroot/index.html", "utf8");
// var code = "<span class='foo'\n\
// >bar</span\n\
// >foo";

var ret = parse(code);
//console.log(SYS.inspect(ret, null, null));
