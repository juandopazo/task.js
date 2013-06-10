var RSVP = require("rsvp");

var enqueue = RSVP.async;

const T_PAUSED    = 0;  // can't be scheduled or executed
const T_STARTED   = 1;  // may or may not currently be executing
const T_CANCELLED = 2;  // cancelled but not yet done cleaning up
const T_CLOSED    = 3;  // completely done

const R_BLOCKED   = 0;  // waiting on a promise
const R_RESOLVED  = 1;  // ready to resume with a resolved value
const R_REJECTED  = 2;  // ready to resume with a rejected value
const R_RUNNING   = 3;  // currently executing

var counter = 0;
function nextTID() {
    var result = counter;
    counter = (counter + 1) & 0xffffffff;
    return result;
}

function Task(thunk) {
    if (!(this instanceof Task))
        return new Task(thunk);
    this.tid = nextTID();                // thread ID
    this.result = void 0;                // intermediate or final result
    this.runState = R_RESOLVED;          // execution status within scheduler
    this.threadState = T_PAUSED;         // state in thread's lifecycle
    this.thread = thunk.call(this);      // thread
    this.scheduler = currentScheduler(); // scheduler
    this.deferred = RSVP.defer();
    this.then = function () {
        var promise = this.deferred.promise;
        promise.then.apply(promise, arguments);
    };
}

var Tp = Task.prototype;

Tp.isStarted = function() {
    return this.threadState === T_STARTED;
};

Tp.isRunning = function() {
    return this.runState === R_RUNNING;
};

Tp.start = function() {
    if (this.threadState !== T_PAUSED)
        throw new Error("task is already started or completed");
    this.threadState = T_STARTED;
    if (this.runState !== R_BLOCKED) {
        this.scheduler.schedule(this);
        pump(this.scheduler);
    }
    return this;
};

Tp.pause = function() {
    if (this.runState === R_RUNNING)
        throw new Error("tasks can only be paused while blocked");
    this.threadState = T_PAUSED;
    this.scheduler.unschedule(this);
    return this;
};

Tp.cancel = function() {
    if (this.runState === R_RUNNING)
        throw new Error("tasks can only be cancelled while blocked");
    this.threadState = T_CANCELLED;
    this.scheduler.schedule(this);
    pump(this.scheduler);
    return this;
};

Tp.toString = function() {
    return "[object Task " + this.tid + "]";
};

const READY = RSVP.resolve();

function runScheduledTask(task) {
    var result = task.result, send = (task.runState === R_RESOLVED);
    try {
        task.runState = R_RUNNING;
        task.result = void 0;
        if (task.threadState === T_CANCELLED) {
            task.result = void 0;
            task.runState = R_RESOLVED;
            task.threadState = T_CLOSED;
        } else {
            var p = (send ? task.thread.send(result) : task.thread["throw"](result)) || READY;
            task.runState = R_BLOCKED;
            p.then(function(value) {
                task.result = value;
                task.runState = R_RESOLVED;
                if (task.threadState === T_STARTED) {
                    task.scheduler.schedule(task);
                    pump(task.scheduler);
                }
            }, function(e) {
                task.result = e;
                task.runState = R_REJECTED;
                if (task.threadState === T_STARTED) {
                    task.scheduler.schedule(task);
                    pump(task.scheduler);
                }
            });
        }
    } catch (e) {
        task.threadState = T_CLOSED;
        if (e instanceof TaskResult || e instanceof StopIteration) {
            task.result = e.value;
            task.runState = R_RESOLVED;
            task.deferred.resolve(e.value);
        } else {
            task.result = e;
            task.runState = R_REJECTED;
            task.deferred.reject(e);
        }
    }
}

var runningTask = null;

Task.current = function() {
    return runningTask;
};

function pump(scheduler) {
    if (runningTask)
        return;
    var task = scheduler.choose();
    if (!task)
        return;
    enqueue(function() {
        runningTask = task;
        runScheduledTask(task);
        runningTask = null;
        pump(scheduler);
    });
}

function spawn(thunk) {
    return (new Task(thunk)).start();
}

function currentStack() {
    try {
        throw new Error();
    } catch (e) {
        return e.stack.split(/\n/).slice(1).map(function (line) {
            var match1 = line.match(/^[a-zA-Z0-9_]*/);
            var match2 = line.match(/[^\/]+:[0-9]+$/);
            return (match1 && match2) ? (match1[0] + "@" + match2[0]) : line;
        });
    }
}

function sourceOf(x) {
    return (x && typeof x === "object") ? x.toSource() : String(x);
}

function RandomScheduler() {
    this.ready = []; // unblocked tasks ready to resume
}

RandomScheduler.prototype = {
    choose: function() {
        var n = this.ready.length;
        if (n === 0)
            return null;
        if (n === 1) {
            var r = this.ready[0];
            this.ready = []
            return r;
        }
        var i = Math.floor(Math.random() * n);
        return this.ready.splice(i, 1)[0];
    },
    schedule: function(task) {
        this.ready.push(task);
    },
    unschedule: function(task) {
        var ready = this.ready;
        for (var i = 0, n = ready.length; i < n; i++) {
            if (ready[i] === task) {
                ready.splice(i, 1);
                return;
            }
        }
    }
};

var scheduler = new RandomScheduler();

function currentScheduler() {
    return scheduler;
}

function setCurrentScheduler(s) {
    scheduler = s;
}

function TaskResult(value) {
    if (!(this instanceof TaskResult))
        return new TaskResult(value);
    this.value = value;
}

TaskResult.prototype = {
    toString: function() {
        return "[TaskResult " + this.value + "]";
    }
};

exports.Task = Task;
exports.TaskResult = TaskResult;
exports.spawn = spawn;
exports.currentScheduler = currentScheduler;
exports.setCurrentScheduler = setCurrentScheduler;
exports.RandomScheduler = RandomScheduler;
