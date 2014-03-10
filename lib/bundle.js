exports.build_kendo = build_kendo;
exports.widget_usage = widget_usage;
exports.kendo_category = kendo_category;
exports.get_kendo_config = get_kendo_config;

var FS = require("fs");
var PATH = require("path");
var U2 = require("uglify-js");

var HTML = require("./parsehtml.js");

function widget_usage(options) {
    var detected_widgets = [];
    var widgets = [];
    var uses_binder = false;

    var kc = get_kendo_config().components;

    function do_js_code(code, filename) {
        var ast = U2.parse(code, { filename: filename });
        ast.walk(new U2.TreeWalker(function(node){
            var m;
            if (node instanceof U2.AST_Call
                && node.expression instanceof U2.AST_Dot) {

                // (...).kendoSomething()
                if (m = /^kendo(.*)$/.exec(node.expression.property)) {
                    push_uniq(widgets, m[1]);
                }

                // kendo.bind(...) should enable MVVM
                if (node.expression.expression instanceof U2.AST_Symbol &&
                    node.expression.expression.name == "kendo" &&
                    node.expression.property == "bind") {
                    uses_binder = true;
                }
            }
        }));
    }

    // look for (expr).kendoSomething(...) constructs in the JS files
    options.js_files.forEach(function(filename){
        var code = FS.readFileSync(filename, { encoding: "utf8" });
        do_js_code(code, filename);
    });

    // look for data-role attributes in the HTML
    options.html_files.forEach(function(filename){
        var code = FS.readFileSync(filename, { encoding: "utf8" });
        var tree = HTML.parse(code);
        (function search(node) {
            if (node.type == "tag") {
                var role = get_attr(node, "data-role");
                if (role) {
                    widgets.push(role.value);
                }
                if (node.name == "script") {
                    var type = get_attr(node, "type");
                    if (!type || /javascript/i.test(type.value)) {
                        do_js_code(node.body.value);
                    }
                    return;
                }
            }
            if (node.body instanceof Array) {
                node.body.forEach(search);
            }
        })(tree);
    });

    var components = [];
    widgets.forEach(function(name){
        components = components.concat(find_widget(name, options.category || "web"));
    });
    if (uses_binder) {
        components.push(kc.filter(function(c){ return c.id == "binder" })[0]);
    }

    return {
        widgets      : detected_widgets,
        components   : remove_duplicates(components),
        kendo_config : get_kendo_config(),
    };

    function find_widget(name, category) {
        name = name.toLowerCase();
        return kc.filter(function(comp){
            if (!(comp.category == "framework" || comp.category == "dataviz" ||
                  (comp.category == "mobile" && /mobile|all/.test(category)) ||
                  (comp.category == "web" && /web|all/.test(category)))) {
                return false;
            }
            for (var i = comp.widgets.length; --i >= 0;) {
                var el = comp.widgets[i];
                if (el.name.toLowerCase() == name) {
                    push_uniq(detected_widgets, el.name);
                    return true;
                }
            }
        });
    }
}

function build_kendo(options) {
    var kcomp = get_kendo_config().components;
    var selection = [];
    options.components.forEach(function require(comp) {
        if (typeof comp == "string") {
            for (var i = 0; i < kcomp.length; ++i) {
                if (kcomp[i].id == comp) {
                    comp = kcomp[i];
                    break;
                }
            }
        }
        if (comp.depends) {
            comp.depends.forEach(require);
        }
        push_uniq(selection, comp.source);
    });

    var toplevel = new U2.AST_Toplevel({ body: [] });
    selection.forEach(function(filename){
        if (options.log) {
            options.log(filename);
        }
        filename = PATH.join(options.kendo_dir, filename);
        var code = FS.readFileSync(filename, { encoding: "utf8" });
        toplevel = U2.parse(code, {
            filename: filename,
            toplevel: toplevel
        });
    });

    toplevel = toplevel.transform(new U2.TreeTransformer(function before(node, descend){
        if (node === toplevel)
            return undefined;

        if (!(this.parent() instanceof U2.AST_Toplevel))
            return node;    // no point to descend.

        // discard RequireJS boilerplate
        if (node instanceof U2.AST_SimpleStatement
            && node.body instanceof U2.AST_Call
            && node.body.expression instanceof U2.AST_Conditional
            && node.body.expression.consequent instanceof U2.AST_SymbolRef
            && node.body.expression.consequent.name == "define")
            // WHOA, I should really implement some pattern matching in UglifyJS
        {
            // so if that's the case, we want to replace the whole
            // simple statement with the *body* of the function
            // that gets passed to `define`.
            var f = node.body.args[1]; // args[0] is the dependency list
            return U2.MAP.splice(f.body);
        }

        return node;
    }));

    return toplevel.print_to_string();
}

function kendo_category(dir) {
    try {
        FS.statSync(PATH.join(dir, "kendo.all.min.js"));
        return "all";
    } catch(ex) {}

    try {
        FS.statSync(PATH.join(dir, "kendo.web.min.js"));
        return "web";
    } catch(ex) {}

    try {
        FS.statSync(PATH.join(dir, "kendo.mobile.min.js"));
        return "mobile";
    } catch(ex) {}

    try {
        FS.statSync(PATH.join(dir, "kendo.dataviz.min.js"));
        return "dataviz";
    } catch(ex) {}
}

var get_kendo_config = (function() {
    var config;
    return function() {
        if (!config) {
            var filename = PATH.join(__dirname, "kendo-config.json");
            config = FS.readFileSync(filename, { encoding: "utf8" });
            config = JSON.parse(config);
        }
        return config;
    };
})();

function remove_duplicates(a) {
    var seen = [];
    for (var i = a.length; --i >= 0;) {
        var el = a[i];
        if (seen.indexOf(el) >= 0)
            a.splice(i, 1);
        seen.push(el);
    }
    return a;
}

function find(array, pred) {
    for (var i = 0; i < array.length; ++i) {
        if (pred(array[i]))
            return array[i];
    }
}

function get_attr(node, name) {
    return find(node.attr, function(att){ return att.name == name });
}

function push_uniq(array, el) {
    if (array.indexOf(el) < 0)
        array.push(el);
}
