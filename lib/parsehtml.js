"use strict";

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

var NO_CONTENT_TAGS = ",area,base,br,col,command,embed,hr,img,input,keygen,link,meta,param,source,track,wbr,";

function html_no_content(tagname) {
    return NO_CONTENT_TAGS.indexOf("," + tagname.toLowerCase() + ",") >= 0;
}

function is_whitespace(ch) {
    return WHITESPACE_CHARS.indexOf(ch) >= 0;
}

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

function defaults(args, defs) {
    if (!args) args = {};
    Object.keys(defs).forEach(function(key){
        if (args[key] === undefined)
            args[key] = defs[key];
    });
    return args;
}

function last(array) {
    return array[array.length - 1];
}

function parse(input, options) {

    options = defaults(options, {
        html    : true,
        asp     : false,
        tagsoup : false,
    });

    if (options.asp) {
        // The HTML parser can't deal with ASP constructs, so let's
        // just drop them.  There's no good way to analyze them
        // anyway.  We must replace with a string having the same
        // length (and newlines) so we don't mess up the location
        // information in output.
        input = input.replace(/<%(.*?)%>/g, function(s, p1){
            return "/*" + p1.replace(/[<&>\'\"]/g, " ") + "*/";
        });
    }

    input = new InputStream(input);

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
        ret += tag.name + ">[" + tag.loc.line + ":" + tag.loc.col + "]";
        return ret;
    }

    function read_text() {
        function nodes() { return last(stack).body }
        var text, textpos;
        function new_text() { text = ""; textpos = input.save(); }

        function dumptext() {
            if (text) {
                nodes().push({
                    type   : "text",
                    value  : text,
                    loc    : textpos,
                    endloc : input.save()
                });
            }
            new_text();
        }

        function maybe(reader) {
            var pos = input.save();
            var thing = reader();
            if (thing) {
                thing.loc = pos;
                thing.endloc = input.save();
                dumptext();
                nodes().push(thing);
            } else {
                input.restore(pos);
                text += next();
            }
        }

        function fetch_attribute() {
            var pos = input.save();
            var m = get(RX_NAME);
            if (!m) return;
            skip_whitespace();
            if (looking_at("=")) {
                next();
                skip_whitespace();
                return {
                    name   : m[1],
                    loc    : pos,
                    valoc  : input.save(),
                    value  : read_string(),
                    endloc : input.save(),
                };
            }
            return {
                name   : m[1],
                loc    : pos,
                endloc : input.save(),
            };
        }

        function open_tag() {
            var pos = input.save();
            next();                 // skip <
            var m = get(RX_NAME);
            if (!m) {
                text += "<";
                return;
            }

            dumptext();        // definitely reading tag from here on.

            var tag = {
                type: "tag",
                name: m[1],
                attr: [],
                loc: pos,
            };

            if (options.tagsoup) {
                // XXX: that's TODO
            }

            nodes().push(tag);

            skip_whitespace();
            while (!eof()) {
                if (get("/>")) {
                    tag.endloc = input.save();
                    return;
                }
                if (get(">")) {
                    tag.endloc = input.save();
                    break;
                }
                var att = fetch_attribute();
                if (att) tag.attr.push(att);
                else next();
                skip_whitespace();
            }

            if (options.html) {
                if (html_no_content(tag.name))
                    return;
                if (tag.name == "script") {
                    tag.body = read_script(tag);
                    return;
                }
                if (tag.name == "style") {
                    tag.body = read_style(tag);
                    return;
                }
            }
            tag.body = [];
            stack.push(tag);
        }

        function close_tag() {
            var pos = input.save();
            input.forward(2);       // skip </
            var m = get(RX_NAME);
            if (!m) {
                text += "</";
                return;
            }
            dumptext();     // definitely going to read close tag now.
            read_while(function(ch){
                if (ch != ">" && !is_whitespace(ch)) {
                    push_error("Unexpected character in close tag: " + ch);
                }
                return ch != ">";
            });
            next();
            var close = {
                type   : "closetag",
                name   : m[1],
                loc    : pos,
                endloc : input.save()
            };
            if (stack.length > 1) {
                var open = stack.pop();
                if (open.name != close.name) {
                    push_error("Misplaced close tag " + dumptag(close) + " (should be " + dumptag(open) + ")");
                }
            }
        }

        new_text();
        while (!eof()) {
            if (looking_at("</")) {
                close_tag();
            }
            else if (looking_at("<!--")) {
                maybe(read_comment);
            }
            else if (looking_at("<![CDATA[")) {
                maybe(read_cdata);
            }
            else if (looking_at("<!")) {
                maybe(read_declaration);
            }
            else if (looking_at("<")) {
                open_tag();
            }
            else if (looking_at("&")) {
                maybe(read_entity);
            }
            else {
                text += next();
            }
        }
        dumptext();
    }

    function skip_whitespace() {
        read_while(is_whitespace);
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
            type   : "entity",
            value  : m[1],
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
            return !is_whitespace(ch) && !/[<>]/.test(ch);
        });
    }

    function read_comment() {
        input.forward(4);       // skip <!--
        var comment = read_while(function(){
            return !looking_at("-->");
        });
        input.forward(3);
        return {
            type    : "comment",
            value   : comment,
        };
    }

    function read_cdata() {
        input.forward(9);       // skip <![CDATA[
        var cdata = read_while(function(){
            return !looking_at("]]>");
        });
        input.forward(3);       // skip ]]>
        return {
            type   : "cdata",
            value  : cdata,
        };
    }

    function make_close_tag(name) {
        var pos = input.save();
        input.forward(name.length + 2); // i.e. </script
        read_while(function(ch){
            if (ch != ">" && !is_whitespace(ch)) {
                push_error("Unexpected character in close tag: " + ch);
            }
            return ch != ">";
        });
        next();
        return {
            type   : "closetag",
            name   : name,
            loc    : pos,
            endloc : input.save(),
        };
    }

    function read_declaration() {
        input.forward(2);       // skip <!
        var body = read_while(function(ch){ return ch != ">" });
        input.forward(1);
        return {
            type   : "decl",
            value  : body,
        }
    }

    function read_script(tag) {
        var pos = input.save();
        var script = read_while(function(){
            return !looking_at("</script");
        });
        tag.closed = make_close_tag("script");
        return {
            type   : "script",
            loc    : pos,
            value  : script,
            endloc : input.save(),
        };
    }

    function read_style(tag) {
        var pos = input.save();
        var style = read_while(function(){
            return !looking_at("</style");
        });
        tag.closed = make_close_tag("style");
        return {
            type   : "style",
            loc    : pos,
            value  : style,
            endloc : input.save(),
        };
    }

    var errors = [];
    var root = { type   : "root",
                 body   : [],
                 loc    : input.save(),
                 errors : errors };
    var stack = [ root ];
    read_text();
    root.endloc = input.save();
    return root;
}

exports.parse = parse;
