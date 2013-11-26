var KAPI = require("./parsedocs.js").kendo_apidoc;

function htmlescape(txt) {
    return txt.replace(/&/g, "&amp;")
        .replace(/\x22/g, "&quot;")
        .replace(/\x27/g, "&#x27;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\u00A0/g, "&#xa0;")
}

function jsonml_to_html(tree, refs) {
    if (!refs) refs = {};
    var section = null;
    var param = null;
    return (function donode(tree) {
        if (typeof tree == "string") return htmlescape(tree);
        if (tree instanceof Array) {
            var tag = tree[0];
            if (tag instanceof Array) {
                // rootless tree
                return tree.map(function(tree){
                    return donode(tree)
                }).join("");
            }
            var has_attr = typeof tree[1] == "object" && !(tree[1] instanceof Array);
            var attr = has_attr ? deep_clone(tree[1]) : {};
            switch (tag) {
              case "bulletlist" : tag = "ul"   ; break;
              case "numberlist" : tag = "ol"   ; break;
              case "listitem"   : tag = "li"   ; break;
              case "para"       : tag = "p"    ; break;
              case "code_block" : tag = "pre"  ; break;
              case "inlinecode" : tag = "code" ; break;
              case "linebreak"  : tag = "br"   ; break;
              case "link"       : tag = "a"    ; break;

              case "markdown":
              case "root":
                tag = "div";
                if (!refs && has_attr)
                    refs = attr.references;
                break;

              case "header":
                if (typeof tree[2] == "string") {
                    attr.name = tree[2].trim();
                }
                if (attr.level == 2) {
                    attr.name = attr.name.toLowerCase();
                    section = attr.name;
                } else if (attr.level == 3) {
                    attr.name = section + "-" + attr.name;
                }
                tag = "h" + attr.level;
                delete attr.level;
                break;

              case "img":
                attr.src = attr.href;
                delete attr.href;
                break;

              case "link_ref":
                var ref = refs[attr.ref];
                if (!ref) return attr.original;
                tag = "a";
                attr.href = ref.href;
                if (ref.title) attr.title = ref.title;
                delete attr.original;
                break;

              case "img_ref":
                var ref = refs[attr.ref];
                if (!ref) return attr.original;
                tag = "img";
                attr.src = ref.href;
                if (ref.title) attr.title = ref.title;
                delete attr.original;
                break;
            }
            var output = "<" + tag;
            for (var i in attr)
                output += " " + i + "=\"" + htmlescape(attr[i]) + "\"";
            output += ">";
            output += tree.slice(has_attr ? 2 : 1).map(function(el){
                return donode(el);
            }).join("");
            output += "</" + tag + ">";
            return output;
        }
    })(tree);
}

function search(query) {
    var a = query.split(".");
    var widget_name = a[0].toLowerCase();
    var prop = a[1].toLowerCase();
    var components = KAPI.components;
    var comp;
    for (var i in components) if (components.hasOwnProperty(i)) {
        if (i.toLowerCase().substr(-widget_name.length) == widget_name) {
            comp = components[i];
            break;
        }
    }

    if (!comp) {
        return { error: "Component not found" };
    }

    function lookup(a, type) {
        for (var i = a.length; --i >= 0;) {
            if (a[i].name.toLowerCase() == prop) {
                return { type: type, prop: a[i] };
            }
        }
    }

    var info = lookup(comp.config, "config")
        || lookup(comp.events, "event")
        || lookup(comp.methods, "method")
        || lookup(comp.fields, "field");

    if (!info) {
        return { error: "Property " + prop + " not found in " + comp.name };
    }

    return deep_clone(info, function f(key, val, deep_clone){
        if (key == "short_doc" || key == "doc") {
            return jsonml_to_html(val);
        }
        if (key == "examples") {
            return val.map(function(example){
                return jsonml_to_html(example);
            });
        }
        return deep_clone(val, f);
    });
}

function deep_clone(obj, f) {
    if (obj === null) return null;
    if (Array.isArray(obj)) return obj.map(function(el){
        return deep_clone(el, f);
    });
    if (typeof obj == "object") {
        var ret = {};
        for (var i in obj) if (obj.hasOwnProperty(i)) {
            ret[i] = f ? f(i, obj[i], deep_clone) : deep_clone(obj[i]);
        }
        return ret;
    }
    return obj;
}

exports.search = search;
