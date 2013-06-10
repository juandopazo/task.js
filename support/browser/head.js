;(function (global) {

// local name for this module
var exports = {};

var registry = {
    rsvp: global.RSVP
};

function require(module) {
    return registry[module];
}

var hasPrevious = "task" in global;
var previous = global.task;

function uninstall() {
    if (hasPrevious)
        global.task = previous;
    else
        delete global.task;
    return exports;
}

exports.uninstall = uninstall;
