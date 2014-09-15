!function(e){if("object"==typeof exports&&"undefined"!=typeof module)module.exports=e();else if("function"==typeof define&&define.amd)define([],e);else{var o;"undefined"!=typeof window?o=window:"undefined"!=typeof global?o=global:"undefined"!=typeof self&&(o=self),o.Sono=e()}}(function(){var define,module,exports;return (function e(t,n,r){function s(o,u){if(!n[o]){if(!t[o]){var a=typeof require=="function"&&require;if(!u&&a)return a(o,!0);if(i)return i(o,!0);var f=new Error("Cannot find module '"+o+"'");throw f.code="MODULE_NOT_FOUND",f}var l=n[o]={exports:{}};t[o][0].call(l.exports,function(e){var n=t[o][1][e];return s(n?n:e)},l,l.exports,e,t,n,r)}return n[o].exports}var i=typeof require=="function"&&require;for(var o=0;o<r.length;o++)s(r[o]);return s})({1:[function(require,module,exports){
'use strict';

var Loader = require('./lib/loader.js'),
    NodeManager = require('./lib/node-manager.js'),
    Sound = require('./lib/sound.js'),
    Support = require('./lib/support.js'),
    Utils = require('./lib/utils.js');

function Sono() {
    this.VERSION = '0.0.0';

    window.AudioContext = window.AudioContext || window.webkitAudioContext;
    this._context = window.AudioContext ? new window.AudioContext() : null;
    Utils.setContext(this._context);

    this._node = new NodeManager(this._context);
    this._masterGain = this._node.gain();
    if(this._context) {
        this._node.setSource(this._masterGain);
        this._node.setDestination(this._context.destination);
    }

    this._sounds = [];
    this._support = new Support();

    this._handleTouchlock();
    this._handleVisibility();
    //this.log();
}

/*
 * Create
 *
 * Accepted values for param data:
 *
 * ArrayBuffer
 * HTMLMediaElement
 * Array (of files e.g. ['foo.ogg', 'foo.mp3'])
 * String (filename e.g. 'foo.ogg')
 * String (Oscillator type i.e. 'sine', 'square', 'sawtooth', 'triangle')
 * Object (ScriptProcessor config: { bufferSize: 1024, channels: 1, callback: fn, thisArg: self })
 */

Sono.prototype.createSound = function(data) {
    // try to load if data is Array or file string
    if(Utils.isFile(data)) {
        return this.load(data);
    }
    // otherwise just return a new sound object
    var sound = new Sound(this._context, data, this._masterGain);
    this._sounds.push(sound);

    return sound;
};

/*
 * Destroy
 */

Sono.prototype.destroy = function(soundOrId) {
    var sound;
    for (var i = 0, l = this._sounds.length; i < l; i++) {
        sound = this._sounds[i];
        if(sound === soundOrId || sound.id === soundOrId) {
            break;
        }
    }
    if(sound !== undefined) {
        this._sounds.splice(i, 1);

        if(sound.loader) {
            sound.loader.cancel();
        }
        try {
            sound.stop();
        } catch(e) {}
    }
};

/*
 * Get Sound by id
 */

Sono.prototype.getById = function(id) {
    for (var i = 0, l = this._sounds.length; i < l; i++) {
        if(this._sounds[i].id === id) {
            return this._sounds[i];
        }
    }
    return null;
};

/*
 * Loading
 */

Sono.prototype.load = function(url, complete, progress, thisArg, asMediaElement) {
    // multiple
    if(url instanceof Array && url.length && typeof url[0] === 'object') {
        this._loadMultiple(url, complete, progress, thisArg, asMediaElement);
        return;
    }

    var sound = this._queue(url, asMediaElement);

    if(progress) {
        sound.loader.onProgress.add(progress, thisArg || this);
    }
    if(complete) {
        sound.loader.onComplete.addOnce(function() {
            complete.call(thisArg || this, sound);
        });
    }
    sound.loader.start();

    return sound;
};

Sono.prototype._loadMultiple = function(config, complete, progress, thisArg, asMediaElement) {
    var sounds = [];
    for (var i = 0, l = config.length; i < l; i++) {
        var file = config[i];
        var sound = this._queue(file.url, asMediaElement);
        if(file.id) { sound.id = file.id; }
        sound.loop = !!file.loop;
        sound.volume = file.volume;
        sounds.push(sound);
    }
    if(progress) {
        this._loader.onProgress.add(function(p) {
            progress.call(thisArg || this, p);
        });
    }
    if(complete) {
        this._loader.onComplete.addOnce(function() {
            complete.call(thisArg || this, sounds);
        });
    }
    this._loader.start();
};

Sono.prototype._initLoader = function() {
    this._loader = new Loader();
    this._loader.touchLocked = this._isTouchLocked;
    this._loader.webAudioContext = this._context;
    this._loader.crossOrigin = true;
};

Sono.prototype._queue = function(url, asMediaElement) {
    if(!this._loader) {
        this._initLoader();
    }

    url = this._support.getSupportedFile(url);

    var sound = this.createSound();

    sound.loader = this._loader.add(url);
    sound.loader.onBeforeComplete.addOnce(function(buffer) {
        sound.setData(buffer);
    });

    if(asMediaElement) {
        sound.loader.webAudioContext = null;
    }

    return sound;
};

/*
 * Controls
 */

Sono.prototype.mute = function() {
    this._preMuteVolume = this.volume;
    this.volume = 0;
};

Sono.prototype.unMute = function() {
    this.volume = this._preMuteVolume || 1;
};

Object.defineProperty(Sono.prototype, 'volume', {
    get: function() {
        return this._masterGain.gain.value;
    },
    set: function(value) {
        if(isNaN(value)) { return; }

        this._masterGain.gain.value = value;

        if(!this.hasWebAudio) {
            for (var i = 0, l = this._sounds.length; i < l; i++) {
                this._sounds[i].volume = value;
            }
        }
    }
});

Sono.prototype.pauseAll = function() {
    for (var i = 0, l = this._sounds.length; i < l; i++) {
        if(this._sounds[i].playing) {
            this._sounds[i].pause();
        }
    }
};

Sono.prototype.resumeAll = function() {
    for (var i = 0, l = this._sounds.length; i < l; i++) {
        if(this._sounds[i].paused) {
            this._sounds[i].play();
        }
    }
};

Sono.prototype.stopAll = function() {
    for (var i = 0, l = this._sounds.length; i < l; i++) {
        this._sounds[i].stop();
    }
};

Sono.prototype.play = function(id, delay, offset) {
    this.getById(id).play(delay, offset);
};

Sono.prototype.pause = function(id) {
    this.getById(id).pause();
};

Sono.prototype.stop = function(id) {
    this.getById(id).stop();
};

/*
 * Mobile touch lock
 */

Sono.prototype._handleTouchlock = function() {
    var ua = navigator.userAgent,
        locked = !!ua.match(/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i),
        self = this;

    var unlock = function() {
        document.body.removeEventListener('touchstart', unlock);
        self._isTouchLocked = false;
        if(self._loader) {
            self._loader.touchLocked = false;
        }
        if(self.context) {
            var buffer = self.context.createBuffer(1, 1, 22050);
            var unlockSource = self.context.createBufferSource();
            unlockSource.buffer = buffer;
            unlockSource.connect(self.context.destination);
            unlockSource.start(0);
        }
    };
    if(locked) {
        document.body.addEventListener('touchstart', unlock, false);
    }
    this._isTouchLocked = locked;
};

/*
 * Page visibility events
 */

Sono.prototype._handleVisibility = function() {
    var pageHiddenPaused = [],
        sounds = this._sounds,
        hidden,
        visibilityChange;

    if (typeof document.hidden !== 'undefined') {
        hidden = 'hidden';
        visibilityChange = 'visibilitychange';
    }
    else if (typeof document.mozHidden !== 'undefined') {
        hidden = 'mozHidden';
        visibilityChange = 'mozvisibilitychange';
    }
    else if (typeof document.msHidden !== 'undefined') {
        hidden = 'msHidden';
        visibilityChange = 'msvisibilitychange';
    }
    else if (typeof document.webkitHidden !== 'undefined') {
        hidden = 'webkitHidden';
        visibilityChange = 'webkitvisibilitychange';
    }

    // pause currently playing sounds and store refs
    function onHidden() {
        var l = sounds.length;
        for (var i = 0; i < l; i++) {
            var sound = sounds[i];
            if(sound.playing) {
                sound.pause();
                pageHiddenPaused.push(sound);
            }
        }
    }

    // play sounds that got paused when page was hidden
    function onShown() {
        while(pageHiddenPaused.length) {
            pageHiddenPaused.pop().play();
        }
    }

    function onChange() {
        if (document[hidden]) {
            onHidden();
        }
        else {
            onShown();
        }
    }

    if(visibilityChange !== undefined) {
        document.addEventListener(visibilityChange, onChange, false);
    }
};

/*
 * Log version & device support info
 */

Sono.prototype.log = function() {
    var title = 'Sono ' + this.VERSION,
        info = 'Supported:' + this.isSupported +
               ' WebAudioAPI:' + this.hasWebAudio +
               ' TouchLocked:' + this._isTouchLocked +
               ' Extensions:' + this._support.extensions;

    if(navigator.userAgent.indexOf('Chrome') > -1) {
        var args = [
                '%c ♫ ' + title +
                ' ♫ %c ' + info + ' ',
                'color: #FFFFFF; background: #379F7A',
                'color: #1F1C0D; background: #E0FBAC'
            ];
        console.log.apply(console, args);
    }
    else if (window.console && window.console.log.call) {
        console.log.call(console, title + ' ' + info);
    }
};

/*
 * Getters & Setters
 */

Object.defineProperty(Sono.prototype, 'canPlay', {
    get: function() {
        return this._support.canPlay;
    }
});

Object.defineProperty(Sono.prototype, 'context', {
    get: function() {
        return this._context;
    }
});

Object.defineProperty(Sono.prototype, 'hasWebAudio', {
    get: function() {
        return !!this._context;
    }
});

Object.defineProperty(Sono.prototype, 'isSupported', {
    get: function() {
        return this._support.extensions.length > 0;
    }
});

Object.defineProperty(Sono.prototype, 'masterGain', {
    get: function() {
        return this._masterGain;
    }
});

Object.defineProperty(Sono.prototype, 'node', {
    get: function() {
        return this._node;
    }
});

Object.defineProperty(Sono.prototype, 'sounds', {
    get: function() {
        return this._sounds;
    }
});

Object.defineProperty(Sono.prototype, 'utils', {
    get: function() {
        return Utils;
    }
});

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = new Sono();
}

},{"./lib/loader.js":3,"./lib/node-manager.js":4,"./lib/sound.js":11,"./lib/support.js":17,"./lib/utils.js":18}],2:[function(require,module,exports){
/*jslint onevar:true, undef:true, newcap:true, regexp:true, bitwise:true, maxerr:50, indent:4, white:false, nomen:false, plusplus:false */
/*global define:false, require:false, exports:false, module:false, signals:false */

/** @license
 * JS Signals <http://millermedeiros.github.com/js-signals/>
 * Released under the MIT license
 * Author: Miller Medeiros
 * Version: 1.0.0 - Build: 268 (2012/11/29 05:48 PM)
 */

(function(global){

    // SignalBinding -------------------------------------------------
    //================================================================

    /**
     * Object that represents a binding between a Signal and a listener function.
     * <br />- <strong>This is an internal constructor and shouldn't be called by regular users.</strong>
     * <br />- inspired by Joa Ebert AS3 SignalBinding and Robert Penner's Slot classes.
     * @author Miller Medeiros
     * @constructor
     * @internal
     * @name SignalBinding
     * @param {Signal} signal Reference to Signal object that listener is currently bound to.
     * @param {Function} listener Handler function bound to the signal.
     * @param {boolean} isOnce If binding should be executed just once.
     * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
     * @param {Number} [priority] The priority level of the event listener. (default = 0).
     */
    function SignalBinding(signal, listener, isOnce, listenerContext, priority) {

        /**
         * Handler function bound to the signal.
         * @type Function
         * @private
         */
        this._listener = listener;

        /**
         * If binding should be executed just once.
         * @type boolean
         * @private
         */
        this._isOnce = isOnce;

        /**
         * Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @memberOf SignalBinding.prototype
         * @name context
         * @type Object|undefined|null
         */
        this.context = listenerContext;

        /**
         * Reference to Signal object that listener is currently bound to.
         * @type Signal
         * @private
         */
        this._signal = signal;

        /**
         * Listener priority
         * @type Number
         * @private
         */
        this._priority = priority || 0;
    }

    SignalBinding.prototype = {

        /**
         * If binding is active and should be executed.
         * @type boolean
         */
        active : true,

        /**
         * Default parameters passed to listener during `Signal.dispatch` and `SignalBinding.execute`. (curried parameters)
         * @type Array|null
         */
        params : null,

        /**
         * Call listener passing arbitrary parameters.
         * <p>If binding was added using `Signal.addOnce()` it will be automatically removed from signal dispatch queue, this method is used internally for the signal dispatch.</p>
         * @param {Array} [paramsArr] Array of parameters that should be passed to the listener
         * @return {*} Value returned by the listener.
         */
        execute : function (paramsArr) {
            var handlerReturn, params;
            if (this.active && !!this._listener) {
                params = this.params? this.params.concat(paramsArr) : paramsArr;
                handlerReturn = this._listener.apply(this.context, params);
                if (this._isOnce) {
                    this.detach();
                }
            }
            return handlerReturn;
        },

        /**
         * Detach binding from signal.
         * - alias to: mySignal.remove(myBinding.getListener());
         * @return {Function|null} Handler function bound to the signal or `null` if binding was previously detached.
         */
        detach : function () {
            return this.isBound()? this._signal.remove(this._listener, this.context) : null;
        },

        /**
         * @return {Boolean} `true` if binding is still bound to the signal and have a listener.
         */
        isBound : function () {
            return (!!this._signal && !!this._listener);
        },

        /**
         * @return {boolean} If SignalBinding will only be executed once.
         */
        isOnce : function () {
            return this._isOnce;
        },

        /**
         * @return {Function} Handler function bound to the signal.
         */
        getListener : function () {
            return this._listener;
        },

        /**
         * @return {Signal} Signal that listener is currently bound to.
         */
        getSignal : function () {
            return this._signal;
        },

        /**
         * Delete instance properties
         * @private
         */
        _destroy : function () {
            delete this._signal;
            delete this._listener;
            delete this.context;
        },

        /**
         * @return {string} String representation of the object.
         */
        toString : function () {
            return '[SignalBinding isOnce:' + this._isOnce +', isBound:'+ this.isBound() +', active:' + this.active + ']';
        }

    };


/*global SignalBinding:false*/

    // Signal --------------------------------------------------------
    //================================================================

    function validateListener(listener, fnName) {
        if (typeof listener !== 'function') {
            throw new Error( 'listener is a required param of {fn}() and should be a Function.'.replace('{fn}', fnName) );
        }
    }

    /**
     * Custom event broadcaster
     * <br />- inspired by Robert Penner's AS3 Signals.
     * @name Signal
     * @author Miller Medeiros
     * @constructor
     */
    function Signal() {
        /**
         * @type Array.<SignalBinding>
         * @private
         */
        this._bindings = [];
        this._prevParams = null;

        // enforce dispatch to aways work on same context (#47)
        var self = this;
        this.dispatch = function(){
            Signal.prototype.dispatch.apply(self, arguments);
        };
    }

    Signal.prototype = {

        /**
         * Signals Version Number
         * @type String
         * @const
         */
        VERSION : '1.0.0',

        /**
         * If Signal should keep record of previously dispatched parameters and
         * automatically execute listener during `add()`/`addOnce()` if Signal was
         * already dispatched before.
         * @type boolean
         */
        memorize : false,

        /**
         * @type boolean
         * @private
         */
        _shouldPropagate : true,

        /**
         * If Signal is active and should broadcast events.
         * <p><strong>IMPORTANT:</strong> Setting this property during a dispatch will only affect the next dispatch, if you want to stop the propagation of a signal use `halt()` instead.</p>
         * @type boolean
         */
        active : true,

        /**
         * @param {Function} listener
         * @param {boolean} isOnce
         * @param {Object} [listenerContext]
         * @param {Number} [priority]
         * @return {SignalBinding}
         * @private
         */
        _registerListener : function (listener, isOnce, listenerContext, priority) {

            var prevIndex = this._indexOfListener(listener, listenerContext),
                binding;

            if (prevIndex !== -1) {
                binding = this._bindings[prevIndex];
                if (binding.isOnce() !== isOnce) {
                    throw new Error('You cannot add'+ (isOnce? '' : 'Once') +'() then add'+ (!isOnce? '' : 'Once') +'() the same listener without removing the relationship first.');
                }
            } else {
                binding = new SignalBinding(this, listener, isOnce, listenerContext, priority);
                this._addBinding(binding);
            }

            if(this.memorize && this._prevParams){
                binding.execute(this._prevParams);
            }

            return binding;
        },

        /**
         * @param {SignalBinding} binding
         * @private
         */
        _addBinding : function (binding) {
            //simplified insertion sort
            var n = this._bindings.length;
            do { --n; } while (this._bindings[n] && binding._priority <= this._bindings[n]._priority);
            this._bindings.splice(n + 1, 0, binding);
        },

        /**
         * @param {Function} listener
         * @return {number}
         * @private
         */
        _indexOfListener : function (listener, context) {
            var n = this._bindings.length,
                cur;
            while (n--) {
                cur = this._bindings[n];
                if (cur._listener === listener && cur.context === context) {
                    return n;
                }
            }
            return -1;
        },

        /**
         * Check if listener was attached to Signal.
         * @param {Function} listener
         * @param {Object} [context]
         * @return {boolean} if Signal has the specified listener.
         */
        has : function (listener, context) {
            return this._indexOfListener(listener, context) !== -1;
        },

        /**
         * Add a listener to the signal.
         * @param {Function} listener Signal handler function.
         * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
         * @return {SignalBinding} An Object representing the binding between the Signal and listener.
         */
        add : function (listener, listenerContext, priority) {
            validateListener(listener, 'add');
            return this._registerListener(listener, false, listenerContext, priority);
        },

        /**
         * Add listener to the signal that should be removed after first execution (will be executed only once).
         * @param {Function} listener Signal handler function.
         * @param {Object} [listenerContext] Context on which listener will be executed (object that should represent the `this` variable inside listener function).
         * @param {Number} [priority] The priority level of the event listener. Listeners with higher priority will be executed before listeners with lower priority. Listeners with same priority level will be executed at the same order as they were added. (default = 0)
         * @return {SignalBinding} An Object representing the binding between the Signal and listener.
         */
        addOnce : function (listener, listenerContext, priority) {
            validateListener(listener, 'addOnce');
            return this._registerListener(listener, true, listenerContext, priority);
        },

        /**
         * Remove a single listener from the dispatch queue.
         * @param {Function} listener Handler function that should be removed.
         * @param {Object} [context] Execution context (since you can add the same handler multiple times if executing in a different context).
         * @return {Function} Listener handler function.
         */
        remove : function (listener, context) {
            validateListener(listener, 'remove');

            var i = this._indexOfListener(listener, context);
            if (i !== -1) {
                this._bindings[i]._destroy(); //no reason to a SignalBinding exist if it isn't attached to a signal
                this._bindings.splice(i, 1);
            }
            return listener;
        },

        /**
         * Remove all listeners from the Signal.
         */
        removeAll : function () {
            var n = this._bindings.length;
            while (n--) {
                this._bindings[n]._destroy();
            }
            this._bindings.length = 0;
        },

        /**
         * @return {number} Number of listeners attached to the Signal.
         */
        getNumListeners : function () {
            return this._bindings.length;
        },

        /**
         * Stop propagation of the event, blocking the dispatch to next listeners on the queue.
         * <p><strong>IMPORTANT:</strong> should be called only during signal dispatch, calling it before/after dispatch won't affect signal broadcast.</p>
         * @see Signal.prototype.disable
         */
        halt : function () {
            this._shouldPropagate = false;
        },

        /**
         * Dispatch/Broadcast Signal to all listeners added to the queue.
         * @param {...*} [params] Parameters that should be passed to each handler.
         */
        dispatch : function (params) {
            if (! this.active) {
                return;
            }

            var paramsArr = Array.prototype.slice.call(arguments),
                n = this._bindings.length,
                bindings;

            if (this.memorize) {
                this._prevParams = paramsArr;
            }

            if (! n) {
                //should come after memorize
                return;
            }

            bindings = this._bindings.slice(); //clone array in case add/remove items during dispatch
            this._shouldPropagate = true; //in case `halt` was called before dispatch or during the previous dispatch.

            //execute all callbacks until end of the list or until a callback returns `false` or stops propagation
            //reverse loop since listeners with higher priority will be added at the end of the list
            do { n--; } while (bindings[n] && this._shouldPropagate && bindings[n].execute(paramsArr) !== false);
        },

        /**
         * Forget memorized arguments.
         * @see Signal.memorize
         */
        forget : function(){
            this._prevParams = null;
        },

        /**
         * Remove all bindings from signal and destroy any reference to external objects (destroy Signal object).
         * <p><strong>IMPORTANT:</strong> calling any method on the signal instance after calling dispose will throw errors.</p>
         */
        dispose : function () {
            this.removeAll();
            delete this._bindings;
            delete this._prevParams;
        },

        /**
         * @return {string} String representation of the object.
         */
        toString : function () {
            return '[Signal active:'+ this.active +' numListeners:'+ this.getNumListeners() +']';
        }

    };


    // Namespace -----------------------------------------------------
    //================================================================

    /**
     * Signals namespace
     * @namespace
     * @name signals
     */
    var signals = Signal;

    /**
     * Custom event broadcaster
     * @see Signal
     */
    // alias for backwards compatibility (see #gh-44)
    signals.Signal = Signal;



    //exports to multiple environments
    if(typeof define === 'function' && define.amd){ //AMD
        define(function () { return signals; });
    } else if (typeof module !== 'undefined' && module.exports){ //node
        module.exports = signals;
    } else { //browser
        //use string because of Google closure compiler ADVANCED_MODE
        /*jslint sub:true */
        global['signals'] = signals;
    }

}(this));

},{}],3:[function(require,module,exports){
'use strict';

var signals = require('signals');

function Loader() {
    this.onChildComplete = new signals.Signal();
    this.onComplete = new signals.Signal();
    this.onProgress = new signals.Signal();
    this.onError = new signals.Signal();

    this.crossOrigin = false;
    this.loaded = false;
    this.loaders = {};
    this.loading = false;
    this.numLoaded = 0;
    this.numTotal = 0;
    this.queue = [];
    this.touchLocked = false;
    this.webAudioContext = null;
}

Loader.prototype.add = function(url) {
    var loader = new Loader.File(url);
    loader.webAudioContext = this.webAudioContext;
    loader.crossOrigin = this.crossOrigin;
    loader.touchLocked = this.touchLocked;
    this.queue.push(loader);
    this.loaders[loader.url] = loader;
    this.numTotal++;
    return loader;
};

Loader.prototype.start = function() {
    this.numTotal = this.queue.length;
    if(!this.loading) {
        this.loading = true;
        this.next();
    }
};

Loader.prototype.next = function() {
    if(this.queue.length === 0) {
        this.loaded = true;
        this.loading = false;
        this.onComplete.dispatch(this.loaders);
        return;
    }
    var loader = this.queue.pop();
    var self = this;
    var progressHandler = function(progress) {
        var numLoaded = self.numLoaded + progress;
        if(self.onProgress.getNumListeners() > 0) {
            self.onProgress.dispatch(numLoaded/self.numTotal);
        }
    };
    loader.onProgress.add(progressHandler);
    var completeHandler = function(){
        loader.onProgress.remove(progressHandler);
        self.numLoaded++;
        if(self.onProgress.getNumListeners() > 0) {
            self.onProgress.dispatch(self.numLoaded/self.numTotal);
        }
        self.onChildComplete.dispatch(loader);
        self.next();
    };
    loader.onBeforeComplete.addOnce(completeHandler);
    var errorHandler = function(){
        self.onError.dispatch(loader);
        self.next();
    };
    loader.onError.addOnce(errorHandler);
    loader.start();
};

/*Loader.prototype.addMultiple = function(array) {
    for (var i = 0; i < array.length; i++) {
        this.add(array[i]);
    }
};

Loader.prototype.get = function(url) {
    return this.loaders[url];
};*/

Loader.File = function(url) {
    this.url = url;

    this.onProgress = new signals.Signal();
    this.onBeforeComplete = new signals.Signal();
    this.onComplete = new signals.Signal();
    this.onError = new signals.Signal();

    this.webAudioContext = null;
    this.crossOrigin = false;
    this.touchLocked = false;
    this.progress = 0;
};

Loader.File.prototype.start = function() {
    if(this.webAudioContext) {
        this.loadArrayBuffer(this.webAudioContext);
    } else {
        this.loadAudioElement(this.touchLocked);
    }
};

Loader.File.prototype.loadArrayBuffer = function(webAudioContext) {
    var request = new XMLHttpRequest();
    request.open('GET', this.url, true);
    request.responseType = 'arraybuffer';
    var self = this;
    request.onprogress = function(event) {
        if (event.lengthComputable) {
            self.progress = event.loaded / event.total;
            self.onProgress.dispatch(self.progress);
        }
    };
    request.onload = function() {
        webAudioContext.decodeAudioData(request.response, function(buffer) {
            self.data = buffer;
            self.progress = 1;
            self.onProgress.dispatch(1);
            self.onBeforeComplete.dispatch(buffer);
            self.onComplete.dispatch(buffer);
        }, function() {
            self.onError.dispatch();
        });
    };
    request.onerror = function(e) {
        self.onError.dispatch(e);
    };
    request.send();
    this.request = request;
};

Loader.File.prototype.loadAudioElement = function(touchLocked) {
    var request = new Audio();
    this.data = request;
    request.name = this.url;
    request.preload = 'auto';
    var self = this;
    request.src = this.url;
    if (!!touchLocked) {
        this.onProgress.dispatch(1);
        this.onComplete.dispatch(this.data);
    }
    else {
        var ready = function(){
            request.removeEventListener('canplaythrough', ready);
            clearTimeout(timeout);
            self.progress = 1;
            self.onProgress.dispatch(1);
            self.onBeforeComplete.dispatch(self.data);
            self.onComplete.dispatch(self.data);
        };
        // timeout because sometimes canplaythrough doesn't fire
        var timeout = setTimeout(ready, 2000);
        request.addEventListener('canplaythrough', ready, false);
        request.onerror = function() {
            clearTimeout(timeout);
            self.onError.dispatch();
        };
        request.load();
    }
};

Loader.File.prototype.cancel = function() {
  if(this.request && this.request.readyState !== 4) {
      this.request.abort();
  }
};

module.exports = Loader;

},{"signals":2}],4:[function(require,module,exports){
'use strict';

var Analyser = require('./node/analyser.js'),
    Distortion = require('./node/distortion.js'),
    Echo = require('./node/echo.js'),
    Filter = require('./node/filter.js'),
    Panner = require('./node/panner.js'),
    Reverb = require('./node/reverb.js');

function NodeManager(context) {
    this._context = context || this.createFakeContext();
    this._destination = null;
    this._nodeList = [];
    this._sourceNode = null;
}

NodeManager.prototype.add = function(node) {
    console.log('NodeManager.add:', node);
    this._nodeList.push(node);
    this._updateConnections();
    return node;
};

NodeManager.prototype.remove = function(node) {
    var l = this._nodeList.length;
    for (var i = 0; i < l; i++) {
        if(node === this._nodeList[i]) {
            this._nodeList.splice(i, 1);
        }
    }
    node.disconnect();
    this._updateConnections();
    return node;
};

NodeManager.prototype.removeAll = function() {
    while(this._nodeList.length) {
        this._nodeList.pop().disconnect();
    }
    this._updateConnections();
    return this;
};

NodeManager.prototype._connectTo = function(node) {
    var l = this._nodeList.length;
    if(l > 0) {
        var n = this._nodeList[l - 1];
        console.log('connect:', n, 'to', node);
        n.disconnect();
        n.connect(node);
        if(typeof n.connected === 'function') {
            n.connected();
        }
    }
    else if(this._sourceNode) {
        //console.log(' x connect source to node:', node);
        this._sourceNode.disconnect();
        this._sourceNode.connect(node);
    }
    this._destination = node;
};

NodeManager.prototype._updateConnections = function() {
    if(!this._sourceNode) {
        return;
    }
    //console.log('_updateConnections');
    var l = this._nodeList.length,
        n;
    for (var i = 0; i < l; i++) {
        n = this._nodeList[i];
        if(i === 0) {
            console.log(' - connect source to node:', n);
            this._sourceNode.disconnect();
            this._sourceNode.connect(n.node || n);
        }
        else {
            var prev = this._nodeList[i-1];
            console.log('connect:', prev, 'to', n);
            prev.disconnect();
            prev.connect(n.node || n);
            if(typeof prev.connected === 'function') {
                prev.connected();
            }
        }
    }
    //console.log(this._destination)
    if(this._destination) {
        this._connectTo(this._destination);
    }
    /*else {
        this._connectTo(this._gain);
    }*/
};

// or setter for destination?
/*NodeManager.prototype._connectTo = function(node) {
    var l = this._nodeList.length;
    if(l > 0) {
      console.log('connect:', this._nodeList[l - 1], 'to', node);
        this._nodeList[l - 1].disconnect();
        this._nodeList[l - 1].connect(node);
    }
    else {
        console.log(' x connect source to node:', node);
        this._gain.disconnect();
        this._gain.connect(node);
    }
    this._destination = node;
};*/

// should source be item 0 in nodelist and desination last
// prob is addNode needs to add before destination
// + should it be called chain or something nicer?
// feels like node list could be a linked list??
// if list.last is destination addbefore

/*NodeManager.prototype._updateConnections = function() {
    if(!this._sourceNode) {
        return;
    }
    var l = this._nodeList.length;
    for (var i = 1; i < l; i++) {
      this._nodeList[i-1].connect(this._nodeList[i]);
    }
};*/
/*NodeManager.prototype._updateConnections = function() {
    if(!this._sourceNode) {
        return;
    }
    console.log('_updateConnections');
    this._sourceNode.disconnect();
    this._sourceNode.connect(this._gain);
    var l = this._nodeList.length;

    for (var i = 0; i < l; i++) {
        if(i === 0) {
            console.log(' - connect source to node:', this._nodeList[i]);
            this._gain.disconnect();
            this._gain.connect(this._nodeList[i]);
        }
        else {
            console.log('connect:', this._nodeList[i-1], 'to', this._nodeList[i]);
            this._nodeList[i-1].disconnect();
            this._nodeList[i-1].connect(this._nodeList[i]);
        }
    }
    this._connectTo(this._context.destination);
};*/

NodeManager.prototype.analyser = function(fftSize, smoothing, minDecibels, maxDecibels) {
    var analyser = new Analyser(this._context, fftSize, smoothing, minDecibels, maxDecibels);
    return this.add(analyser);
};

NodeManager.prototype.compressor = function() {
    // lowers the volume of the loudest parts of the signal and raises the volume of the softest parts
    var node = this._context.createDynamicsCompressor();
    // min decibels to start compressing at from -100 to 0
    node.threshold.value = -24;
    // decibel value to start curve to compressed value from 0 to 40
    node.knee.value = 30;
    // amount of change per decibel from 1 to 20
    node.ratio.value = 12;
    // gain reduction currently applied by compressor from -20 to 0
    // node.reduction.value
    // seconds to reduce gain by 10db from 0 to 1 - how quickly signal adapted when volume increased
    node.attack.value = 0.0003;
    // seconds to increase gain by 10db from 0 to 1 - how quickly signal adapted when volume redcuced
    node.release.value = 0.25;
    return this.add(node);
};

NodeManager.prototype.convolver = function(impulseResponse) {
    // impulseResponse is an audio file buffer
    var node = this._context.createConvolver();
    node.buffer = impulseResponse;
    return this.add(node);
};

NodeManager.prototype.delay = function(time) {
    var node = this._context.createDelay();
    if(time !== undefined) { node.delayTime.value = time; }
    return this.add(node);
};

NodeManager.prototype.echo = function(time, gain) {
    var echo = new Echo(this._context, time, gain);
    this.add(echo);
    return echo;
};

NodeManager.prototype.distortion = function(amount) {
    var node = new Distortion(this._context, amount);
    // Float32Array defining curve (values are interpolated)
    //node.curve
    // up-sample before applying curve for better resolution result 'none', '2x' or '4x'
    //node.oversample = '2x';
    return this.add(node);
};

NodeManager.prototype.filter = function(type, frequency, quality, gain) {
    var filter = new Filter(this._context, type, frequency, quality, gain);
    return this.add(filter);
};

NodeManager.prototype.lowpass = function(frequency, quality, gain) {
    return this.filter('lowpass', frequency, quality, gain);
};

NodeManager.prototype.highpass = function(frequency, quality, gain) {
    return this.filter('highpass', frequency, quality, gain);
};

NodeManager.prototype.bandpass = function(frequency, quality, gain) {
    return this.filter('bandpass', frequency, quality, gain);
};

NodeManager.prototype.lowshelf = function(frequency, quality, gain) {
    return this.filter('lowshelf', frequency, quality, gain);
};

NodeManager.prototype.highshelf = function(frequency, quality, gain) {
    return this.filter('highshelf', frequency, quality, gain);
};

NodeManager.prototype.peaking = function(frequency, quality, gain) {
    return this.filter('peaking', frequency, quality, gain);
};

NodeManager.prototype.notch = function(frequency, quality, gain) {
    return this.filter('notch', frequency, quality, gain);
};

NodeManager.prototype.allpass = function(frequency, quality, gain) {
    return this.filter('allpass', frequency, quality, gain);
};

NodeManager.prototype.gain = function(value) {
    var node = this._context.createGain();
    if(value !== undefined) {
        node.gain.value = value;
    }
    return node;
};

NodeManager.prototype.panner = function() {
    var panner = new Panner(this._context);
    this.add(panner);
    return panner;
};

NodeManager.prototype.reverb = function(seconds, decay, reverse) {
    var reverb = new Reverb(this._context, seconds, decay, reverse);
    this.add(reverb);
    return reverb;
};

NodeManager.prototype.scriptProcessor = function(bufferSize, inputChannels, outputChannels, callback, thisArg) {
    // bufferSize 256 - 16384 (pow 2)
    bufferSize = bufferSize || 1024;
    inputChannels = inputChannels === undefined ? 0 : inputChannels;
    outputChannels = outputChannels === undefined ? 1 : outputChannels;
    var node = this._context.createScriptProcessor(bufferSize, inputChannels, outputChannels);
    //node.onaudioprocess = callback.bind(callbackContext|| node);
    node.onaudioprocess = function (event) {
        // available props:
        /*
        event.inputBuffer
        event.outputBuffer
        event.playbackTime
        */
        // Example: generate noise
        /*
        var output = event.outputBuffer.getChannelData(0);
        var l = output.length;
        for (var i = 0; i < l; i++) {
            output[i] = Math.random();
        }
        */
        callback.call(thisArg || this, event);
    };
    return this.add(node);
};

NodeManager.prototype.createFakeContext = function() {
    var fn = function(){};
    var param = {
        value: 1,
        defaultValue: 1,
        linearRampToValueAtTime: fn,
        setValueAtTime: fn,
        exponentialRampToValueAtTime: fn,
        setTargetAtTime: fn,
        setValueCurveAtTime: fn,
        cancelScheduledValues: fn
    };
    var fakeNode = {
        connect:fn,
        disconnect:fn,
        // gain
        gain:{value: 1},
        // panner
        panningModel: 0,
        setPosition: fn,
        setOrientation: fn,
        setVelocity: fn,
        distanceModel: 0,
        refDistance: 0,
        maxDistance: 0,
        rolloffFactor: 0,
        coneInnerAngle: 360,
        coneOuterAngle: 360,
        coneOuterGain: 0,
        // filter:
        type:0,
        frequency: param,
        // delay
        delayTime: param,
        // convolver
        buffer: 0,
        // analyser
        smoothingTimeConstant: 0,
        fftSize: 0,
        minDecibels: 0,
        maxDecibels: 0,
        // compressor
        threshold: param,
        knee: param,
        ratio: param,
        attack: param,
        release: param,
        // distortion
        oversample: 0,
        curve: 0,
        // buffer
        sampleRate: 1,
        length: 0,
        duration: 0,
        numberOfChannels: 0,
        getChannelData: function() { return []; },
        copyFromChannel: fn,
        copyToChannel: fn
    };
    var returnFakeNode = function(){ return fakeNode; };
    return {
        createAnalyser: returnFakeNode,
        createBuffer: returnFakeNode,
        createBiquadFilter: returnFakeNode,
        createDynamicsCompressor: returnFakeNode,
        createConvolver: returnFakeNode,
        createDelay: returnFakeNode,
        createGain: function() {
            return {
                gain: {
                    value: 1,
                    defaultValue: 1,
                    linearRampToValueAtTime: fn,
                    setValueAtTime: fn,
                    exponentialRampToValueAtTime: fn,
                    setTargetAtTime: fn,
                    setValueCurveAtTime: fn,
                    cancelScheduledValues: fn
                },
                connect:fn,
                disconnect:fn
            };
        },
        createPanner: returnFakeNode,
        createScriptProcessor: returnFakeNode,
        createWaveShaper: returnFakeNode
    };
};

NodeManager.prototype.setSource = function(node) {
    this._sourceNode = node;
    this._updateConnections();
    return node;
};

NodeManager.prototype.setDestination = function(node) {
    this._connectTo(node);
    return node;
};


/*
function EchoNode(context, delayTime, feedbackVolume){
  this.delayTime.value = delayTime;
  this.gainNode = context.createGainNode();
  this.gainNode.gain.value = feedbackVolume;
  this.connect(this.gainNode);
  this.gainNode.connect(this);
}

function createEcho(context, delayTime, feedback){
  var delay = context.createDelayNode(delayTime + 1);
  FeedbackDelayNode.call(delay, context, delayTime, feedback);
  return delay;
}
*/

//http://stackoverflow.com/questions/13702733/creating-a-custom-echo-node-with-web-audio
//http://stackoverflow.com/questions/19895442/implementing-a-javascript-audionode

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = NodeManager;
}

},{"./node/analyser.js":5,"./node/distortion.js":6,"./node/echo.js":7,"./node/filter.js":8,"./node/panner.js":9,"./node/reverb.js":10}],5:[function(require,module,exports){
'use strict';

function Analyser(context, fftSize, smoothing, minDecibels, maxDecibels) {
    var node = context.createAnalyser();
    node.fftSize = fftSize; // frequencyBinCount will be half this value

    if(smoothing !== undefined) { node.smoothingTimeConstant = smoothing; }
    if(minDecibels !== undefined) { node.minDecibels = minDecibels; }
    if(maxDecibels !== undefined) { node.maxDecibels = maxDecibels; }

    var method = function() {
        
    };

    // public methods
    var exports = {
        node: node,
        method: method,
        // map native methods of AnalyserNode
        getByteFrequencyData: node.getByteFrequencyData.bind(node),
        getByteTimeDomainData: node.getByteTimeDomainData.bind(node),
        // map native methods of AudioNode
        connect: node.connect.bind(node),
        disconnect: node.disconnect.bind(node)
    };

    // map native properties of AnalyserNode
    Object.defineProperties(exports, {
        'fftSize': {
            // 32 to 2048 (must be pow 2)
            get: function() { return node.fftSize; },
            set: function(value) { node.fftSize = value; }
        },
        'smoothing': {
            // 0 to 1
            get: function() { return node.smoothingTimeConstant; },
            set: function(value) { node.smoothingTimeConstant = value; }
        },
        'minDecibels': {
            // 0 to 1
            get: function() { return node.minDecibels; },
            set: function(value) { node.minDecibels = value; }
        },
        'maxDecibels': {
            // 0 to 1 (makes the transition between values over time smoother)
            get: function() { return node.maxDecibels; },
            set: function(value) { node.maxDecibels = value; }
        },
        'frequencyBinCount': {
            get: function() { return node.frequencyBinCount; }
        }
    });

    return Object.freeze(exports);
}

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = Analyser;
}


},{}],6:[function(require,module,exports){
'use strict';

/*function Distortion(context, delayTime, gainValue) {
    var delay = context.createDelay();
    var gain = context.createGain();

    gain.gain.value = gainValue || 0.5;
    if(delayTime !== undefined) { delay.delayTime.value = delayTime; }


    var connect = function(node) {
        disconnect();
        delay.connect(gain);
        gain.connect(delay);
        delay.connect(node);
    };

    var disconnect = function() {
        delay.disconnect();
        gain.disconnect();
    };

    // public methods
    var exports = {
        node: delay,
        // map native methods of DistortionNode
        
        // map native methods of AudioNode
        connect: connect,
        disconnect: disconnect
    };

    // map native properties of DistortionNode
    Object.defineProperties(exports, {
        'delayTime': {
            get: function() { return delay.delayTime.value; },
            set: function(value) { delay.delayTime.value = value; }
        },
        'gainValue': {
            get: function() { return gain.gain.value; },
            set: function(value) { gain.gain.value = value; }
        }
    });

    return Object.freeze(exports);
}*/

function Distortion(context, amount) {
    var node = context.createWaveShaper();

    // create waveShaper distortion curve from 0 to 1
    node.update = function(value) {
        amount = value;
        var k = value * 100,
            n = 22050,
            curve = new Float32Array(n),
            deg = Math.PI / 180;

        for (var i = 0; i < n; i++) {
            var x = i * 2 / n - 1;
            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
        }

        this.curve = curve;
    };

    Object.defineProperties(node, {
        'amount': {
            get: function() { return amount; },
            set: function(value) { 
                console.log('hi');
                this.update(value); }
        }
    });

    if(amount !== undefined) {
        node.update(amount);
    }

    return node;
}

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = Distortion;
}


},{}],7:[function(require,module,exports){
'use strict';

/*function Echo(context, delayTime, gainValue) {
    var delay = context.createDelay();
    var gain = context.createGain();

    gain.gain.value = gainValue || 0.5;
    if(delayTime !== undefined) { delay.delayTime.value = delayTime; }


    var connect = function(node) {
        disconnect();
        delay.connect(gain);
        gain.connect(delay);
        delay.connect(node);
    };

    var disconnect = function() {
        delay.disconnect();
        gain.disconnect();
    };

    // public methods
    var exports = {
        node: delay,
        // map native methods of EchoNode
        
        // map native methods of AudioNode
        connect: connect,
        disconnect: disconnect
    };

    // map native properties of EchoNode
    Object.defineProperties(exports, {
        'delayTime': {
            get: function() { return delay.delayTime.value; },
            set: function(value) { delay.delayTime.value = value; }
        },
        'gainValue': {
            get: function() { return gain.gain.value; },
            set: function(value) { gain.gain.value = value; }
        }
    });

    return Object.freeze(exports);
}*/

/*
 * This way is more concise but requires 'connected' to be called in node manager
 */

function Echo(context, delayTime, gainValue) {
    var delay = context.createDelay();
    var gain = context.createGain();

    gain.gain.value = gainValue || 0.5;
    if(delayTime !== undefined) { delay.delayTime.value = delayTime; }

    //delay.connect(gain);
    //gain.connect(delay);

    delay.connected = function() {
        delay.connect(gain);
        gain.connect(delay);
    };

    return delay;
}

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = Echo;
}


},{}],8:[function(require,module,exports){
'use strict';

function Filter(context, type, frequency, quality, gain) {
    // Frequency between 40Hz and half of the sampling rate
    var minFrequency = 40;
    var maxFrequency = context.sampleRate / 2;

    console.log('maxFrequency:', maxFrequency);

    var node = context.createBiquadFilter();
    node.type = type;

    if(frequency !== undefined) { node.frequency.value = frequency; }
    if(quality !== undefined) { node.Q.value = quality; }
    if(gain !== undefined) { node.gain.value = gain; }


    var getFrequency = function(value) {
        // Logarithm (base 2) to compute how many octaves fall in the range.
        var numberOfOctaves = Math.log(maxFrequency / minFrequency) / Math.LN2;
        // Compute a multiplier from 0 to 1 based on an exponential scale.
        var multiplier = Math.pow(2, numberOfOctaves * (value - 1.0));
        // Get back to the frequency value between min and max.
        return maxFrequency * multiplier;
    };

    var setByPercent = function(percent, quality, gain) {
        // set filter frequency based on value from 0 to 1
        node.frequency.value = getFrequency(percent);
        if(quality !== undefined) { node.Q.value = quality; }
        if(gain !== undefined) { node.gain.value = gain; }
    };

    // public methods
    var exports = {
        node: node,
        setByPercent: setByPercent,
        // map native methods of BiquadFilterNode
        getFrequencyResponse: node.getFrequencyResponse,
        setOrientation: node.setOrientation,
        coneOuterGain: node.coneOuterGain,
        // map native methods of AudioNode
        connect: node.connect,
        disconnect: node.disconnect
    };

    // map native properties of BiquadFilterNode
    Object.defineProperties(exports, {
        'type': {
            get: function() { return node.type; },
            set: function(value) { node.type = value; }
        },
        'frequency': {
            get: function() { return node.frequency.value; },
            set: function(value) { node.frequency.value = value; }
        },
        'detune': {
            get: function() { return node.detune.value; },
            set: function(value) { node.detune.value = value; }
        },
        'quality': {
            // 0.0001 to 1000
            get: function() { return node.Q.value; },
            set: function(value) { node.Q.value = value; }
        },
        'gain': {
            // -40 to 40
            get: function() { return node.gain.value; },
            set: function(value) { node.gain.value = value; }
        }
    });

    return Object.freeze(exports);
}

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = Filter;
}


},{}],9:[function(require,module,exports){
'use strict';

function Panner(context) {
    var node = context.createPanner();
    // Default for stereo is HRTF
    node.panningModel = 'HRTF'; // 'equalpower'

    // Distance model and attributes
    node.distanceModel = 'linear'; // 'linear' 'inverse' 'exponential'
    node.refDistance = 1;
    node.maxDistance = 1000;
    node.rolloffFactor = 1;
    node.coneInnerAngle = 360;
    node.coneOuterAngle = 0;
    node.coneOuterGain = 0;
    
    // simple vec3 object pool
    var VecPool = {
        pool: [],
        get: function(x, y, z) {
            var v = this.pool.length ? this.pool.pop() : { x: 0, y: 0, z: 0 };
            // check if a vector has been passed in
            if(x !== undefined && isNaN(x) && 'x' in x && 'y' in x && 'z' in x) {
                v.x = x.x || 0;
                v.y = x.y || 0;
                v.z = x.z || 0;
            }
            else {
                v.x = x || 0;
                v.y = y || 0;
                v.z = z || 0;    
            }
            return v;
        },
        dispose: function(instance) {
            this.pool.push(instance);
        }
    };

    var globalUp = VecPool.get(0, 1, 0);

    var setOrientation = function(node, fw) {
        // set the orientation of the source (where the audio is coming from)

        // calculate up vec ( up = (forward cross (0, 1, 0)) cross forward )
        var up = VecPool.get(fw.x, fw.y, fw.z);
        cross(up, globalUp);
        cross(up, fw);
        normalize(up);
        normalize(fw);

        // set the audio context's listener position to match the camera position
        node.setOrientation(fw.x, fw.y, fw.z, up.x, up.y, up.z);

        // return the vecs to the pool
        VecPool.dispose(fw);
        VecPool.dispose(up);
    };

    var setPosition = function(node, vec) {
        node.setPosition(vec.x, vec.y, vec.z);
        VecPool.dispose(vec);
    };

    var setVelocity = function(node, vec) {
        node.setVelocity(vec.x, vec.y, vec.z);
        VecPool.dispose(vec);
    };

    var calculateVelocity = function(currentPosition, lastPosition, deltaTime) {
        var dx = currentPosition.x - lastPosition.x;
        var dy = currentPosition.y - lastPosition.y;
        var dz = currentPosition.z - lastPosition.z;
        return VecPool.get(dx / deltaTime, dy / deltaTime, dz / deltaTime);
    };

    // cross product of 2 vectors
    var cross = function ( a, b ) {
        var ax = a.x, ay = a.y, az = a.z;
        var bx = b.x, by = b.y, bz = b.z;
        a.x = ay * bz - az * by;
        a.y = az * bx - ax * bz;
        a.z = ax * by - ay * bx;
    };

    // normalise to unit vector
    var normalize = function (vec3) {
        if(vec3.x === 0 && vec3.y === 0 && vec3.z === 0) {
            return vec3;
        }
        var length = Math.sqrt( vec3.x * vec3.x + vec3.y * vec3.y + vec3.z * vec3.z );
        var invScalar = 1 / length;
        vec3.x *= invScalar;
        vec3.y *= invScalar;
        vec3.z *= invScalar;
        return vec3;
    };

    // pan left to right with value from -1 to 1
    // creates a nice curve with z
    var setX = function(value) {
        var deg45 = Math.PI / 4,
            deg90 = deg45 * 2,
            x = value * deg45,
            z = x + deg90;

        if (z > deg90) {
            z = Math.PI - z;
        }

        x = Math.sin(x);
        z = Math.sin(z);

        node.setPosition(x, 0, z);
    };

    // set the position the audio is coming from)
    var setSourcePosition = function(x, y, z) {
        setPosition(node, VecPool.get(x, y, z));
    };

    // set the direction the audio is coming from)
    var setSourceOrientation = function(x, y, z) {
        setOrientation(node, VecPool.get(x, y, z));
    };

    // set the veloicty of the audio source (if moving)
    var setSourceVelocity = function(x, y, z) {
        setVelocity(node, VecPool.get(x, y, z));
    };

    // set the position of who or what is hearing the audio (could be camera or some character)
    var setListenerPosition = function(x, y, z) {
        setPosition(context.listener, VecPool.get(x, y, z));
    };

    // set the position of who or what is hearing the audio (could be camera or some character)
    var setListenerOrientation = function(x, y, z) {
        setOrientation(context.listener, VecPool.get(x, y, z));
    };

    // set the velocity (if moving) of who or what is hearing the audio (could be camera or some character)
    var setListenerVelocity = function(x, y, z) {
        setVelocity(context.listener, VecPool.get(x, y, z));
    };

    // public methods
    var exports = {
        node: node,
        setX: setX,
        setSourcePosition: setSourcePosition,
        setSourceOrientation: setSourceOrientation,
        setSourceVelocity: setSourceVelocity,
        setListenerPosition: setListenerPosition,
        setListenerOrientation: setListenerOrientation,
        setListenerVelocity: setListenerVelocity,
        calculateVelocity: calculateVelocity,
        // map native methods of PannerNode
        setPosition: node.setPosition,
        setOrientation: node.setOrientation,
        setVelocity: node.setVelocity,
        // map native methods of AudioNode
        connect: node.connect.bind(node),
        disconnect: node.disconnect.bind(node)
    };

    // map native properties of PannerNode
    Object.defineProperties(exports, {
        'panningModel': {
            get: function() { return node.panningModel; },
            set: function(value) { node.panningModel = value; }
        },
        'distanceModel': {
            get: function() { return node.distanceModel; },
            set: function(value) { node.distanceModel = value; }
        },
        'refDistance': {
            get: function() { return node.refDistance; },
            set: function(value) { node.refDistance = value; }
        },
        'maxDistance': {
            get: function() { return node.maxDistance; },
            set: function(value) { node.maxDistance = value; }
        },
        'rolloffFactor': {
            get: function() { return node.rolloffFactor; },
            set: function(value) { node.rolloffFactor = value; }
        },
        'coneInnerAngle': {
            get: function() { return node.coneInnerAngle; },
            set: function(value) { node.coneInnerAngle = value; }
        },
        'coneOuterAngle': {
            get: function() { return node.coneOuterAngle; },
            set: function(value) { node.coneOuterAngle = value; }
        },
        'coneOuterGain': {
            get: function() { return node.coneOuterGain; },
            set: function(value) { node.coneOuterGain = value; }
        }
    });

    return Object.freeze(exports);
}

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = Panner;
}


},{}],10:[function(require,module,exports){
'use strict';

/*function Reverb(context, seconds, decay, reverse) {
    var node = context.createConvolver();

    var update = function(seconds, decay, reverse) {
        seconds = seconds || 1;
        decay = decay || 5;
        reverse = !!reverse;

        var numChannels = 2,
            rate = context.sampleRate,
            length = rate * seconds,
            impulseResponse = context.createBuffer(numChannels, length, rate),
            left = impulseResponse.getChannelData(0),
            right = impulseResponse.getChannelData(1),
            n, e;

        for (var i = 0; i < length; i++) {
            n = reverse ? length - 1 : i;
            e = Math.pow(1 - n / length, decay);
            left[i] = (Math.random() * 2 - 1) * e;
            right[i] = (Math.random() * 2 - 1) * e;
        }

        node.buffer = impulseResponse;
    };

    update(seconds, decay, reverse);

    // public methods
    var exports = {
        node: node,
        update: update,
        // map native methods of ConvolverNode
        connect: node.connect.bind(node),
        disconnect: node.disconnect.bind(node)
    };

    // map native properties of ReverbNode
    Object.defineProperties(exports, {
        'buffer': {
            // true or false
            get: function() { return node.buffer; },
            set: function(value) { node.buffer = value; }
        },
        'normalize': {
            // true or false
            get: function() { return node.normalize; },
            set: function(value) { node.normalize = value; }
        }
    });

    return Object.freeze(exports);
}*/

function Reverb(context, seconds, decay, reverse) {
    var node = context.createConvolver();

    node.update = function(seconds, decay, reverse) {
        seconds = seconds || 1;
        decay = decay || 5;
        reverse = !!reverse;

        var numChannels = 2,
            rate = context.sampleRate,
            length = rate * seconds,
            impulseResponse = context.createBuffer(numChannels, length, rate),
            left = impulseResponse.getChannelData(0),
            right = impulseResponse.getChannelData(1),
            n, e;

        for (var i = 0; i < length; i++) {
            n = reverse ? length - 1 : i;
            e = Math.pow(1 - n / length, decay);
            left[i] = (Math.random() * 2 - 1) * e;
            right[i] = (Math.random() * 2 - 1) * e;
        }

        this.buffer = impulseResponse;
    };

    node.update(seconds, decay, reverse);

    return node;
}

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = Reverb;
}


},{}],11:[function(require,module,exports){
'use strict';

var BufferSource = require('./source/buffer-source.js'),
    MediaSource = require('./source/media-source.js'),
    MicrophoneSource = require('./source/microphone-source.js'),
    NodeManager = require('./node-manager.js'),
    OscillatorSource = require('./source/oscillator-source.js'),
    ScriptSource = require('./source/script-source.js'),
    Utils = require('./utils.js');

function Sound(context, data, destination) {
    this.id = '';
    this._context = context;
    this._data = null;
    this._endedCallback = null;
    this._loop = false;
    this._pausedAt = 0;
    this._playWhenReady = false;
    this._source = null;
    this._startedAt = 0;

    this._node = new NodeManager(this._context);
    this._gain = this._node.gain();
    if(this._context) {
        this._node.setDestination(this._gain);
        this._gain.connect(destination || this._context.destination);
    }

    this.setData(data);
}

Sound.prototype.setData = function(data) {
    if(!data) { return this; }
    this._data = data; // AudioBuffer, MediaElement, etc

    if(Utils.isAudioBuffer(data)) {
        this._source = new BufferSource(data, this._context);
    }
    else if(Utils.isMediaElement(data)) {
        this._source = new MediaSource(data, this._context);
    }
    else if(Utils.isMediaStream(data)) {
        this._source = new MicrophoneSource(data, this._context);
    }
    else if(Utils.isOscillatorType(data)) {
        this._source = new OscillatorSource(data, this._context);
    }
    else if(Utils.isScriptConfig(data)) {
        this._source = new ScriptSource(data, this._context);
    }
    else {
        throw new Error('Cannot detect data type: ' + data);
    }

    this._node.setSource(this._source.sourceNode);

    if(typeof this._source.onEnded === 'function') {
        this._source.onEnded(this._endedHandler, this);
    }

    // should this take account of delay and offset?
    if(this._playWhenReady) {
        this.play();
    }
    return this;
};

/*
 * Controls
 */

Sound.prototype.play = function(delay, offset) {
    if(!this._source) {
        this._playWhenReady = true;
        return this;
    }
    this._node.setSource(this._source.sourceNode);
    this._source.loop = this._loop;

    // update volume needed for no webaudio
    if(!this._context) { this.volume = this.volume; }

    this._source.play(delay, offset);

    return this;
};

Sound.prototype.pause = function() {
    if(!this._source) { return this; }
    this._source.pause();
    return this;  
};

Sound.prototype.stop = function() {
    if(!this._source) { return this; }
    this._source.stop();
    return this;
};

Sound.prototype.seek = function(percent) {
    if(!this._source) { return this; }
    this.stop();
    this.play(0, this._source.duration * percent);
    return this;
};

/*
 * Ended handler
 */

Sound.prototype.onEnded = function(fn, context) {
    this._endedCallback = fn ? fn.bind(context || this) : null;
    return this;
};

Sound.prototype._endedHandler = function() {
    if(typeof this._endedCallback === 'function') {
        this._endedCallback(this);
    }
};

/*
 * Getters & Setters
 */

Object.defineProperty(Sound.prototype, 'context', {
    get: function() {
        return this._context;
    }
});

Object.defineProperty(Sound.prototype, 'currentTime', {
    get: function() {
        return this._source ? this._source.currentTime : 0;
    }
});

Object.defineProperty(Sound.prototype, 'data', {
    get: function() {
        return this._data;
    }
});

Object.defineProperty(Sound.prototype, 'duration', {
    get: function() {
        return this._source ? this._source.duration : 0;
    }
});

Object.defineProperty(Sound.prototype, 'ended', {
    get: function() {
        return this._source ? this._source.ended : false;
    }
});

Object.defineProperty(Sound.prototype, 'gain', {
    get: function() {
        return this._gain;
    }
});

Object.defineProperty(Sound.prototype, 'loop', {
    get: function() {
        return this._loop;
    },
    set: function(value) {
        this._loop = !!value;
        if(this._source) {
          this._source.loop = this._loop;
        }
    }
});

Object.defineProperty(Sound.prototype, 'node', {
    get: function() {
        return this._node;
    }
});

Object.defineProperty(Sound.prototype, 'paused', {
    get: function() {
        return this._source ? this._source.paused : false;
    }
});

Object.defineProperty(Sound.prototype, 'playing', {
    get: function() {
        return this._source ? this._source.playing : false;
    }
});

Object.defineProperty(Sound.prototype, 'progress', {
  get: function() {
    return this._source ? this._source.progress : 0;
  }
});

Object.defineProperty(Sound.prototype, 'volume', {
    get: function() {
        return this._gain.gain.value;
    },
    set: function(value) {
        if(isNaN(value)) { return; }

        this._gain.gain.value = value;

        if(this._data && this._data.volume !== undefined) {
            this._data.volume = value;
        }
    }
});

// for oscillator

Object.defineProperty(Sound.prototype, 'frequency', {
    get: function() {
        return this._source ? this._source.frequency : 0;
    },
    set: function(value) {
        if(this._source) {
            this._source.frequency = value;
        }
    }
});

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = Sound;
}

},{"./node-manager.js":4,"./source/buffer-source.js":12,"./source/media-source.js":13,"./source/microphone-source.js":14,"./source/oscillator-source.js":15,"./source/script-source.js":16,"./utils.js":18}],12:[function(require,module,exports){
'use strict';

function BufferSource(buffer, context) {
    this.id = '';
    this._buffer = buffer; // ArrayBuffer
    this._context = context;
    this._ended = false;
    this._endedCallback = null;
    this._loop = false;
    this._paused = false;
    this._pausedAt = 0;
    this._playing = false;
    this._sourceNode = null; // BufferSourceNode
    this._startedAt = 0;
}

/*
 * Controls
 */

BufferSource.prototype.play = function(delay, offset) {
    if(this._playing) { return; }
    if(delay === undefined) { delay = 0; }
    if(delay > 0) { delay = this._context.currentTime + delay; }

    if(offset === undefined) { offset = 0; }
    if(this._pausedAt > 0) { offset = offset + this._pausedAt; }

    this.sourceNode.loop = this._loop;
    this.sourceNode.onended = this._endedHandler.bind(this);
    this.sourceNode.start(delay, offset);

    if(this._pausedAt) {
        this._startedAt = this._context.currentTime - this._pausedAt;
    }
    else {
        this._startedAt = this._context.currentTime - offset;
    }

    this._ended = false;
    this._paused = false;
    this._pausedAt = 0;
    this._playing = true;
};

BufferSource.prototype.pause = function() {
    var elapsed = this._context.currentTime - this._startedAt;
    this.stop();
    this._pausedAt = elapsed;
    this._playing = false;
    this._paused = true;
};

BufferSource.prototype.stop = function() {
    if(this._sourceNode) {
        this._sourceNode.onended = null;
        try {
            this._sourceNode.stop(0);
        } catch(e) {}
        this._sourceNode = null;
    }

    this._paused = false;
    this._pausedAt = 0;
    this._playing = false;
    this._startedAt = 0;
};

/*
 * Ended handler
 */

BufferSource.prototype.onEnded = function(fn, context) {
    this._endedCallback = fn ? fn.bind(context || this) : null;
};

BufferSource.prototype._endedHandler = function() {
    this.stop();
    this._ended = true;
    if(typeof this._endedCallback === 'function') {
        this._endedCallback(this);
    }
};

/*
 * Getters & Setters
 */

Object.defineProperty(BufferSource.prototype, 'currentTime', {
    get: function() {
        if(this._pausedAt) {
            return this._pausedAt;
        }
        if(this._startedAt) {
            return this._context.currentTime - this._startedAt;
        }
        return 0;
    }
});

Object.defineProperty(BufferSource.prototype, 'duration', {
    get: function() {
        return this._buffer ? this._buffer.duration : 0;
    }
});

Object.defineProperty(BufferSource.prototype, 'ended', {
    get: function() {
        return this._ended;
    }
});

Object.defineProperty(BufferSource.prototype, 'loop', {
    get: function() {
        return this._loop;
    },
    set: function(value) {
        this._loop = !!value;
    }
});

Object.defineProperty(BufferSource.prototype, 'paused', {
    get: function() {
        return this._paused;
    }
});

Object.defineProperty(BufferSource.prototype, 'playing', {
    get: function() {
        return this._playing;
    }
});

Object.defineProperty(BufferSource.prototype, 'progress', {
  get: function() {
    return Math.min(this.currentTime / this.duration, 1);
  }
});

Object.defineProperty(BufferSource.prototype, 'sourceNode', {
    get: function() {
        if(!this._sourceNode) {
            this._sourceNode = this._context.createBufferSource();
            this._sourceNode.buffer = this._buffer;
        }
        return this._sourceNode;
    }
});


/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = BufferSource;
}

},{}],13:[function(require,module,exports){
'use strict';

function MediaSource(el, context) {
    this.id = '';
    this._context = context;
    this._el = el; // HTMLMediaElement
    this._ended = false;
    this._endedCallback = null;
    this._endedHandlerBound = this._endedHandler.bind(this);
    this._loop = false;
    this._paused = false;
    this._playing = false;
    this._sourceNode = null; // MediaElementSourceNode
}

/*
 * Controls
 */

MediaSource.prototype.play = function(delay, offset) {
    clearTimeout(this._delayTimeout);

    this.volume = this._volume;

    if(offset) {
        this._el.currentTime = offset;
    }

    if(delay) {
        this._delayTimeout = setTimeout(this.play.bind(this), delay);
    }
    else {
        this._el.play();
    }

    this._ended = false;
    this._paused = false;
    this._playing = true;

    this._el.removeEventListener('ended', this._endedHandlerBound);
    this._el.addEventListener('ended', this._endedHandlerBound, false);
};

MediaSource.prototype.pause = function() {
    clearTimeout(this._delayTimeout);

    if(!this._el) { return; }

    this._el.pause();
    this._playing = false;
    this._paused = true;
};

MediaSource.prototype.stop = function() {
    clearTimeout(this._delayTimeout);

    if(!this._el) { return; }

    this._el.pause();

    try {
        this._el.currentTime = 0;
        // fixes bug where server doesn't support seek:
        if(this._el.currentTime > 0) { this._el.load(); }    
    } catch(e) {}

    this._playing = false;
    this._paused = false;
};

/*
 * Ended handler
 */

MediaSource.prototype.onEnded = function(fn, context) {
    this._endedCallback = fn ? fn.bind(context || this) : null;
};

MediaSource.prototype._endedHandler = function() {
    this._ended = true;
    this._paused = false;
    this._playing = false;

    if(this._loop) {
        this._el.currentTime = 0;
        // fixes bug where server doesn't support seek:
        if(this._el.currentTime > 0) { this._el.load(); }
        this.play();
    } else if(typeof this._endedCallback === 'function') {
        this._endedCallback(this);
    }
};

/*
 * Getters & Setters
 */

Object.defineProperty(MediaSource.prototype, 'currentTime', {
    get: function() {
        return this._el ? this._el.currentTime : 0;
    }
});

Object.defineProperty(MediaSource.prototype, 'duration', {
    get: function() {
        return this._el ? this._el.duration : 0;
    }
});

Object.defineProperty(MediaSource.prototype, 'ended', {
    get: function() {
        return this._ended;
    }
});

Object.defineProperty(MediaSource.prototype, 'loop', {
    get: function() {
        return this._loop;
    },
    set: function(value) {
        this._loop = value;
    }
});

Object.defineProperty(MediaSource.prototype, 'paused', {
    get: function() {
        return this._paused;
    }
});

Object.defineProperty(MediaSource.prototype, 'playing', {
    get: function() {
        return this._playing;
    }
});

Object.defineProperty(MediaSource.prototype, 'progress', {
    get: function() {
        return this.currentTime / this.duration;
    }
});

Object.defineProperty(MediaSource.prototype, 'sourceNode', {
    get: function() {
        if(!this._sourceNode && this._context) {
            this._sourceNode = this._context.createMediaElementSource(this._el);
        }
        return this._sourceNode;
    }
});

if (typeof module === 'object' && module.exports) {
    module.exports = MediaSource;
}

},{}],14:[function(require,module,exports){
'use strict';

function MicrophoneSource(stream, context) {
    this.id = '';
    this._context = context;
    this._ended = false;
    this._paused = false;
    this._pausedAt = 0;
    this._playing = false;
    this._sourceNode = null; // MicrophoneSourceNode
    this._startedAt = 0;
    this._stream = stream;
}

/*
 * Controls
 */

MicrophoneSource.prototype.play = function(delay) {
    if(delay === undefined) { delay = 0; }
    if(delay > 0) { delay = this._context.currentTime + delay; }

    this.sourceNode.start(delay);

    if(this._pausedAt) {
        this._startedAt = this._context.currentTime - this._pausedAt;
    }
    else {
        this._startedAt = this._context.currentTime;
    }

    this._ended = false;
    this._playing = true;
    this._paused = false;
    this._pausedAt = 0;
};

MicrophoneSource.prototype.pause = function() {
    var elapsed = this._context.currentTime - this._startedAt;
    this.stop();
    this._pausedAt = elapsed;
    this._playing = false;
    this._paused = true;
};

MicrophoneSource.prototype.stop = function() {
    if(this._sourceNode) {
        try {
            this._sourceNode.stop(0);
        } catch(e) {}
        this._sourceNode = null;
    }
    this._ended = true;
    this._paused = false;
    this._pausedAt = 0;
    this._playing = false;
    this._startedAt = 0;
};

/*
 * Getters & Setters
 */

Object.defineProperty(MicrophoneSource.prototype, 'currentTime', {
    get: function() {
        if(this._pausedAt) {
            return this._pausedAt;
        }
        if(this._startedAt) {
            return this._context.currentTime - this._startedAt;
        }
        return 0;
    }
});

Object.defineProperty(MicrophoneSource.prototype, 'duration', {
    get: function() {
        return 0;
    }
});

Object.defineProperty(MicrophoneSource.prototype, 'ended', {
    get: function() {
        return this._ended;
    }
});

Object.defineProperty(MicrophoneSource.prototype, 'paused', {
    get: function() {
        return this._paused;
    }
});

Object.defineProperty(MicrophoneSource.prototype, 'playing', {
    get: function() {
        return this._playing;
    }
});

Object.defineProperty(MicrophoneSource.prototype, 'progress', {
  get: function() {
    return 0;
  }
});

Object.defineProperty(MicrophoneSource.prototype, 'sourceNode', {
    get: function() {
        if(!this._sourceNode) {
            this._sourceNode = this._context.createMediaStreamSource(this._stream);
            // HACK: stops moz garbage collection killing the stream
            // see https://support.mozilla.org/en-US/questions/984179
            if(navigator.mozGetUserMedia) {
                window.mozHack = this._sourceNode;
            }
        }
        return this._sourceNode;
    }
});


/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = MicrophoneSource;
}

},{}],15:[function(require,module,exports){
'use strict';

function OscillatorSource(type, context) {
    this.id = '';
    this._context = context;
    this._ended = false;
    this._paused = false;
    this._pausedAt = 0;
    this._playing = false;
    this._sourceNode = null; // OscillatorSourceNode
    this._startedAt = 0;
    this._type = type;
    this._frequency = 200;
}

/*
 * Controls
 */

OscillatorSource.prototype.play = function(delay) {
    if(delay === undefined) { delay = 0; }
    if(delay > 0) { delay = this._context.currentTime + delay; }

    this.sourceNode.start(delay);

    if(this._pausedAt) {
        this._startedAt = this._context.currentTime - this._pausedAt;
    }
    else {
        this._startedAt = this._context.currentTime;
    }

    this._ended = false;
    this._playing = true;
    this._paused = false;
    this._pausedAt = 0;
};

OscillatorSource.prototype.pause = function() {
    var elapsed = this._context.currentTime - this._startedAt;
    this.stop();
    this._pausedAt = elapsed;
    this._playing = false;
    this._paused = true;
};

OscillatorSource.prototype.stop = function() {
    if(this._sourceNode) {
        try {
            this._sourceNode.stop(0);
        } catch(e) {}
        this._sourceNode = null;
    }
    this._ended = true;
    this._paused = false;
    this._pausedAt = 0;
    this._playing = false;
    this._startedAt = 0;
};

/*
 * Getters & Setters
 */

Object.defineProperty(OscillatorSource.prototype, 'frequency', {
    get: function() {
        return this._frequency;
    },
    set: function(value) {
        this._frequency = value;
        if(this._sourceNode) {
            this._sourceNode.frequency.value = value;
        }
    }
});

Object.defineProperty(OscillatorSource.prototype, 'currentTime', {
    get: function() {
        if(this._pausedAt) {
            return this._pausedAt;
        }
        if(this._startedAt) {
            return this._context.currentTime - this._startedAt;
        }
        return 0;
    }
});

Object.defineProperty(OscillatorSource.prototype, 'duration', {
    get: function() {
        return 0;
    }
});

Object.defineProperty(OscillatorSource.prototype, 'ended', {
    get: function() {
        return this._ended;
    }
});

Object.defineProperty(OscillatorSource.prototype, 'paused', {
    get: function() {
        return this._paused;
    }
});

Object.defineProperty(OscillatorSource.prototype, 'playing', {
    get: function() {
        return this._playing;
    }
});

Object.defineProperty(OscillatorSource.prototype, 'progress', {
  get: function() {
    return 0;
  }
});

Object.defineProperty(OscillatorSource.prototype, 'sourceNode', {
    get: function() {
        if(!this._sourceNode && this._context) {
            this._sourceNode = this._context.createOscillator();
            this._sourceNode.type = this._type;
            this._sourceNode.frequency.value = this._frequency;
        }
        return this._sourceNode;
    }
});

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = OscillatorSource;
}

},{}],16:[function(require,module,exports){
'use strict';

function ScriptSource(data, context) {
    this.id = '';
    this._bufferSize = data.bufferSize || 1024;
    this._channels = data.channels || 1;
    this._context = context;
    this._ended = false;
    this._onProcess = data.callback.bind(data.thisArg || this);
    this._paused = false;
    this._pausedAt = 0;
    this._playing = false;
    this._sourceNode = null; // ScriptSourceNode
    this._startedAt = 0;
}

/*
 * Controls
 */

ScriptSource.prototype.play = function(delay) {
    if(delay === undefined) { delay = 0; }
    if(delay > 0) { delay = this._context.currentTime + delay; }

    this.sourceNode.onaudioprocess = this._onProcess;

    if(this._pausedAt) {
        this._startedAt = this._context.currentTime - this._pausedAt;
    }
    else {
        this._startedAt = this._context.currentTime;
    }

    this._ended = false;
    this._paused = false;
    this._pausedAt = 0;
    this._playing = true;
};

ScriptSource.prototype.pause = function() {
    var elapsed = this._context.currentTime - this._startedAt;
    this.stop();
    this._pausedAt = elapsed;
    this._playing = false;
    this._paused = true;
};

ScriptSource.prototype.stop = function() {
    if(this._sourceNode) {
        this._sourceNode.onaudioprocess = this._onPaused;
    }
    this._ended = true;
    this._paused = false;
    this._pausedAt = 0;
    this._playing = false;
    this._startedAt = 0;
};

ScriptSource.prototype._onPaused = function(event) {
    var buffer = event.outputBuffer;
    for (var i = 0, l = buffer.numberOfChannels; i < l; i++) {
        var channel = buffer.getChannelData(i);
        for (var j = 0, len = channel.length; j < len; j++) {
            channel[j] = 0;
        }
    }
};

/*
 * Getters & Setters
 */

Object.defineProperty(ScriptSource.prototype, 'currentTime', {
    get: function() {
        if(this._pausedAt) {
            return this._pausedAt;
        }
        if(this._startedAt) {
            return this._context.currentTime - this._startedAt;
        }
        return 0;
    }
});

Object.defineProperty(ScriptSource.prototype, 'duration', {
    get: function() {
        return 0;
    }
});

Object.defineProperty(ScriptSource.prototype, 'ended', {
    get: function() {
        return this._ended;
    }
});

Object.defineProperty(ScriptSource.prototype, 'paused', {
    get: function() {
        return this._paused;
    }
});

Object.defineProperty(ScriptSource.prototype, 'playing', {
    get: function() {
        return this._playing;
    }
});

Object.defineProperty(ScriptSource.prototype, 'progress', {
  get: function() {
    return 0;
  }
});

Object.defineProperty(ScriptSource.prototype, 'sourceNode', {
    get: function() {
        if(!this._sourceNode) {
            this._sourceNode = this._context.createScriptProcessor(this._bufferSize, 0, this._channels);
        }
        return this._sourceNode;
    }
});

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = ScriptSource;
}

},{}],17:[function(require,module,exports){
'use strict';

function Support() {
    this._init();
}

Support.prototype._init = function() {
    var el = document.createElement('audio');
    if(!el) { return []; }

    var tests = [
        { ext: 'ogg', type: 'audio/ogg; codecs="vorbis"' },
        { ext: 'mp3', type: 'audio/mpeg;' },
        { ext: 'opus', type: 'audio/ogg; codecs="opus"' },
        { ext: 'wav', type: 'audio/wav; codecs="1"' },
        { ext: 'm4a', type: 'audio/x-m4a;' },
        { ext: 'm4a', type: 'audio/aac;' }
    ];

    this._extensions = [];
    this._canPlay = {};

    for (var i = 0; i < tests.length; i++) {
        var test = tests[i];
        var canPlayType = !!el.canPlayType(test.type);
        if(canPlayType) {
            this._extensions.push(test.ext);
        }
        this._canPlay[test.ext] = canPlayType;
    }
};

Support.prototype.getFileExtension = function(url) {
    url = url.split('?')[0];
    url = url.substr(url.lastIndexOf('/') + 1);

    var a = url.split('.');
    if(a.length === 1 || (a[0] === '' && a.length === 2)) {
        return '';
    }
    return a.pop().toLowerCase();
};

Support.prototype.getSupportedFile = function(fileNames) {
    // if array get the first one that works
    if(fileNames instanceof Array) {
        for (var i = 0; i < fileNames.length; i++) {
            var ext = this.getFileExtension(fileNames[i]);
            var ind = this._extensions.indexOf(ext);
            if(ind > -1) {
                return fileNames[i];
            }
        }
    }
    // if not array and is object
    else if(fileNames instanceof Object) {
        for(var key in fileNames) {
            var extension = this.getFileExtension(fileNames[key]);
            var index = this._extensions.indexOf(extension);
            if(index > -1) {
                return fileNames[key];
            }
        }
    }
    // if string just return
    return fileNames;
};

/*
 * Getters & Setters
 */

Object.defineProperty(Support.prototype, 'extensions', {
    get: function() {
        return this._extensions;
    }
});

Object.defineProperty(Support.prototype, 'canPlay', {
    get: function() {
        return this._canPlay;
    }
});

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = Support;
}

},{}],18:[function(require,module,exports){
'use strict';

var Utils = {};

Utils.setContext = function(context) {
    this._context = context;
};

Utils.crossFade = function(fromSound, toSound, duration) {
    fromSound.gain.gain.linearRampToValueAtTime(0, this._context.currentTime + duration);
    toSound.gain.gain.linearRampToValueAtTime(1, this._context.currentTime + duration);
};

Utils.fadeFrom = function(sound, value, duration) {
    var toValue = sound.gain.gain.value;
    sound.gain.gain.value = value;
    sound.gain.gain.linearRampToValueAtTime(toValue, this._context.currentTime + duration);
};

Utils.fadeTo = function(sound, value, duration) {
    sound.gain.gain.linearRampToValueAtTime(value, this._context.currentTime + duration);
};

Utils.getFrequency = function(value) {
    // get frequency by passing number from 0 to 1
    // Clamp the frequency between the minimum value (40 Hz) and half of the
    // sampling rate.
    var minValue = 40;
    var maxValue = this._context.sampleRate / 2;
    // Logarithm (base 2) to compute how many octaves fall in the range.
    var numberOfOctaves = Math.log(maxValue / minValue) / Math.LN2;
    // Compute a multiplier from 0 to 1 based on an exponential scale.
    var multiplier = Math.pow(2, numberOfOctaves * (value - 1.0));
    // Get back to the frequency value between min and max.
    return maxValue * multiplier;
};

Utils.isAudioBuffer = function(data) {
    return !!(data &&
              window.AudioBuffer &&
              data instanceof window.AudioBuffer);
};

Utils.isMediaElement = function(data) {
    return !!(data &&
              window.HTMLMediaElement &&
              data instanceof window.HTMLMediaElement);
};

Utils.isMediaStream = function(data) {
    return !!(data &&
              typeof data.getAudioTracks === 'function' &&
              data.getAudioTracks().length &&
              window.MediaStreamTrack &&
              data.getAudioTracks()[0] instanceof window.MediaStreamTrack);
};

Utils.isOscillatorType = function(data) {
    return !!(data && typeof data === 'string' &&
             (data === 'sine' || data === 'square' ||
              data === 'sawtooth' || data === 'triangle'));
};

Utils.isScriptConfig = function(data) {
    return !!(data && typeof data === 'object' &&
              data.bufferSize && data.channels && data.callback);
};

Utils.isFile = function(data) {
    return !!(data && (data instanceof Array ||
              (typeof data === 'string' && data.indexOf('.') > -1)));
};

Utils.microphone = function(connected, denied, error, thisArg) {
    return new Utils.Microphone(connected, denied, error, thisArg);
};

/*Utils.pan = function(panner) {
    console.log('pan', this._context);
    return new Utils.Pan(this._context, panner);
};*/

Utils.timeCode = function(seconds, delim) {
    if(delim === undefined) { delim = ':'; }
    var h = Math.floor(seconds / 3600);
    var m = Math.floor((seconds % 3600) / 60);
    var s = Math.floor((seconds % 3600) % 60);
    var hr = (h === 0 ? '' : (h < 10 ? '0' + h + delim : h + delim));
    var mn = (m < 10 ? '0' + m : m) + delim;
    var sc = (s < 10 ? '0' + s : s);
    return hr + mn + sc;
};

Utils.waveform = function(buffer, length) {
    return new Utils.Waveform(buffer, length);
};

/*
 * Waveform
 */

Utils.Waveform = function(buffer, length) {
    this.data = this.getData(buffer, length);
};

Utils.Waveform.prototype = {
    getData: function(buffer, length) {
        if(!window.Float32Array || !Utils.isAudioBuffer(buffer)) {
            return [];
        }
        console.log('-------------------');
        console.time('waveformData');
        var waveform = new Float32Array(length),
            chunk = Math.floor(buffer.length / length),
            //chunk = buffer.length / length,
            resolution = 5, // 10
            incr = Math.floor(chunk / resolution),
            greatest = 0;

        if(incr < 1) { incr = 1; }

        for (var i = 0, chnls = buffer.numberOfChannels; i < chnls; i++) {
            // check each channel
            var channel = buffer.getChannelData(i);
            //for (var j = length - 1; j >= 0; j--) {
            for (var j = 0; j < length; j++) {
                // get highest value within the chunk
                //var ch = j * chunk;
                //for (var k = ch + chunk - 1; k >= ch; k -= incr) {
                for (var k = j * chunk, l = k + chunk; k < l; k += incr) {
                    // select highest value from channels
                    var a = channel[k];
                    if(a < 0) { a = -a; }
                    if (a > waveform[j]) {
                        waveform[j] = a;
                    }
                    // update highest overall for scaling
                    if(a > greatest) {
                        greatest = a;
                    }
                }
            }
        }
        // scale up?
        var scale = 1 / greatest,
            len = waveform.length;
        for (i = 0; i < len; i++) {
            waveform[i] *= scale;
        }
        console.timeEnd('waveformData');
        return waveform;
    },
    getCanvas: function(height, color, bgColor, canvasEl) {
    //waveform: function(arr, width, height, color, bgColor, canvasEl) {
        //var arr = this.waveformData(buffer, width);
        var canvas = canvasEl || document.createElement('canvas');
        var width = canvas.width = this.data.length;
        canvas.height = height;
        var context = canvas.getContext('2d');
        context.strokeStyle = color;
        context.fillStyle = bgColor;
        context.fillRect(0, 0, width, height);
        var x, y;
        //console.time('waveformCanvas');
        context.beginPath();
        for (var i = 0, l = this.data.length; i < l; i++) {
            x = i + 0.5;
            y = height - Math.round(height * this.data[i]);
            context.moveTo(x, y);
            context.lineTo(x, height);
        }
        context.stroke();
        //console.timeEnd('waveformCanvas');
        return canvas;
    }
};


/*
 * Microphone
 */

Utils.Microphone = function(connected, denied, error, thisArg) {
    navigator.getUserMedia_ = (navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia);
    this._isSupported = !!navigator.getUserMedia_;
    this._stream = null;

    this._onConnected = connected.bind(thisArg || this);
    this._onDenied = denied ? denied.bind(thisArg || this) : function() {};
    this._onError = error ? error.bind(thisArg || this) : function() {};
};

Utils.Microphone.prototype.connect = function() {
    if(!this._isSupported) { return; }
    var self = this;
    navigator.getUserMedia_( {audio:true}, function(stream) {
        self._stream = stream;
        self._onConnected(stream);
    }, function(e) {
        if(e.name === 'PermissionDeniedError' || e === 'PERMISSION_DENIED') {
            console.log('Permission denied. You can undo this by clicking the camera icon with the red cross in the address bar');
            self._onDenied();
        }
        else {
            self._onError(e.message || e);
        }
    });
    return this;
};

Utils.Microphone.prototype.disconnect = function() {
    if(this._stream) {
        this._stream.stop();
        this._stream = null;
    }
    return this;
};

Object.defineProperty(Utils.Microphone.prototype, 'stream', {
    get: function() {
        return this._stream;
    }
});

Object.defineProperty(Utils.Microphone.prototype, 'isSupported', {
    get: function() {
        return this._isSupported;
    }
});

/*
 * Exports
 */

if (typeof module === 'object' && module.exports) {
    module.exports = Utils;
}

},{}]},{},[1])(1)
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi9Vc2Vycy9pYW5tY2dyZWdvci9Ecm9wYm94L3dvcmtzcGFjZS9zb25vL25vZGVfbW9kdWxlcy9icm93c2VyaWZ5L25vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCIuL3NyYy9zb25vLmpzIiwiL1VzZXJzL2lhbm1jZ3JlZ29yL0Ryb3Bib3gvd29ya3NwYWNlL3Nvbm8vbm9kZV9tb2R1bGVzL3NpZ25hbHMvZGlzdC9zaWduYWxzLmpzIiwiL1VzZXJzL2lhbm1jZ3JlZ29yL0Ryb3Bib3gvd29ya3NwYWNlL3Nvbm8vc3JjL2xpYi9sb2FkZXIuanMiLCIvVXNlcnMvaWFubWNncmVnb3IvRHJvcGJveC93b3Jrc3BhY2Uvc29uby9zcmMvbGliL25vZGUtbWFuYWdlci5qcyIsIi9Vc2Vycy9pYW5tY2dyZWdvci9Ecm9wYm94L3dvcmtzcGFjZS9zb25vL3NyYy9saWIvbm9kZS9hbmFseXNlci5qcyIsIi9Vc2Vycy9pYW5tY2dyZWdvci9Ecm9wYm94L3dvcmtzcGFjZS9zb25vL3NyYy9saWIvbm9kZS9kaXN0b3J0aW9uLmpzIiwiL1VzZXJzL2lhbm1jZ3JlZ29yL0Ryb3Bib3gvd29ya3NwYWNlL3Nvbm8vc3JjL2xpYi9ub2RlL2VjaG8uanMiLCIvVXNlcnMvaWFubWNncmVnb3IvRHJvcGJveC93b3Jrc3BhY2Uvc29uby9zcmMvbGliL25vZGUvZmlsdGVyLmpzIiwiL1VzZXJzL2lhbm1jZ3JlZ29yL0Ryb3Bib3gvd29ya3NwYWNlL3Nvbm8vc3JjL2xpYi9ub2RlL3Bhbm5lci5qcyIsIi9Vc2Vycy9pYW5tY2dyZWdvci9Ecm9wYm94L3dvcmtzcGFjZS9zb25vL3NyYy9saWIvbm9kZS9yZXZlcmIuanMiLCIvVXNlcnMvaWFubWNncmVnb3IvRHJvcGJveC93b3Jrc3BhY2Uvc29uby9zcmMvbGliL3NvdW5kLmpzIiwiL1VzZXJzL2lhbm1jZ3JlZ29yL0Ryb3Bib3gvd29ya3NwYWNlL3Nvbm8vc3JjL2xpYi9zb3VyY2UvYnVmZmVyLXNvdXJjZS5qcyIsIi9Vc2Vycy9pYW5tY2dyZWdvci9Ecm9wYm94L3dvcmtzcGFjZS9zb25vL3NyYy9saWIvc291cmNlL21lZGlhLXNvdXJjZS5qcyIsIi9Vc2Vycy9pYW5tY2dyZWdvci9Ecm9wYm94L3dvcmtzcGFjZS9zb25vL3NyYy9saWIvc291cmNlL21pY3JvcGhvbmUtc291cmNlLmpzIiwiL1VzZXJzL2lhbm1jZ3JlZ29yL0Ryb3Bib3gvd29ya3NwYWNlL3Nvbm8vc3JjL2xpYi9zb3VyY2Uvb3NjaWxsYXRvci1zb3VyY2UuanMiLCIvVXNlcnMvaWFubWNncmVnb3IvRHJvcGJveC93b3Jrc3BhY2Uvc29uby9zcmMvbGliL3NvdXJjZS9zY3JpcHQtc291cmNlLmpzIiwiL1VzZXJzL2lhbm1jZ3JlZ29yL0Ryb3Bib3gvd29ya3NwYWNlL3Nvbm8vc3JjL2xpYi9zdXBwb3J0LmpzIiwiL1VzZXJzL2lhbm1jZ3JlZ29yL0Ryb3Bib3gvd29ya3NwYWNlL3Nvbm8vc3JjL2xpYi91dGlscy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDdFpBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDN2JBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3S0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM1WkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoRUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDMUZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM3RUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ25GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNyTkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9GQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hPQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzFKQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQy9IQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ3hJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQ2xJQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzNGQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uIGUodCxuLHIpe2Z1bmN0aW9uIHMobyx1KXtpZighbltvXSl7aWYoIXRbb10pe3ZhciBhPXR5cGVvZiByZXF1aXJlPT1cImZ1bmN0aW9uXCImJnJlcXVpcmU7aWYoIXUmJmEpcmV0dXJuIGEobywhMCk7aWYoaSlyZXR1cm4gaShvLCEwKTt2YXIgZj1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK28rXCInXCIpO3Rocm93IGYuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixmfXZhciBsPW5bb109e2V4cG9ydHM6e319O3Rbb11bMF0uY2FsbChsLmV4cG9ydHMsZnVuY3Rpb24oZSl7dmFyIG49dFtvXVsxXVtlXTtyZXR1cm4gcyhuP246ZSl9LGwsbC5leHBvcnRzLGUsdCxuLHIpfXJldHVybiBuW29dLmV4cG9ydHN9dmFyIGk9dHlwZW9mIHJlcXVpcmU9PVwiZnVuY3Rpb25cIiYmcmVxdWlyZTtmb3IodmFyIG89MDtvPHIubGVuZ3RoO28rKylzKHJbb10pO3JldHVybiBzfSkiLCIndXNlIHN0cmljdCc7XG5cbnZhciBMb2FkZXIgPSByZXF1aXJlKCcuL2xpYi9sb2FkZXIuanMnKSxcbiAgICBOb2RlTWFuYWdlciA9IHJlcXVpcmUoJy4vbGliL25vZGUtbWFuYWdlci5qcycpLFxuICAgIFNvdW5kID0gcmVxdWlyZSgnLi9saWIvc291bmQuanMnKSxcbiAgICBTdXBwb3J0ID0gcmVxdWlyZSgnLi9saWIvc3VwcG9ydC5qcycpLFxuICAgIFV0aWxzID0gcmVxdWlyZSgnLi9saWIvdXRpbHMuanMnKTtcblxuZnVuY3Rpb24gU29ubygpIHtcbiAgICB0aGlzLlZFUlNJT04gPSAnMC4wLjAnO1xuXG4gICAgd2luZG93LkF1ZGlvQ29udGV4dCA9IHdpbmRvdy5BdWRpb0NvbnRleHQgfHwgd2luZG93LndlYmtpdEF1ZGlvQ29udGV4dDtcbiAgICB0aGlzLl9jb250ZXh0ID0gd2luZG93LkF1ZGlvQ29udGV4dCA/IG5ldyB3aW5kb3cuQXVkaW9Db250ZXh0KCkgOiBudWxsO1xuICAgIFV0aWxzLnNldENvbnRleHQodGhpcy5fY29udGV4dCk7XG5cbiAgICB0aGlzLl9ub2RlID0gbmV3IE5vZGVNYW5hZ2VyKHRoaXMuX2NvbnRleHQpO1xuICAgIHRoaXMuX21hc3RlckdhaW4gPSB0aGlzLl9ub2RlLmdhaW4oKTtcbiAgICBpZih0aGlzLl9jb250ZXh0KSB7XG4gICAgICAgIHRoaXMuX25vZGUuc2V0U291cmNlKHRoaXMuX21hc3RlckdhaW4pO1xuICAgICAgICB0aGlzLl9ub2RlLnNldERlc3RpbmF0aW9uKHRoaXMuX2NvbnRleHQuZGVzdGluYXRpb24pO1xuICAgIH1cblxuICAgIHRoaXMuX3NvdW5kcyA9IFtdO1xuICAgIHRoaXMuX3N1cHBvcnQgPSBuZXcgU3VwcG9ydCgpO1xuXG4gICAgdGhpcy5faGFuZGxlVG91Y2hsb2NrKCk7XG4gICAgdGhpcy5faGFuZGxlVmlzaWJpbGl0eSgpO1xuICAgIC8vdGhpcy5sb2coKTtcbn1cblxuLypcbiAqIENyZWF0ZVxuICpcbiAqIEFjY2VwdGVkIHZhbHVlcyBmb3IgcGFyYW0gZGF0YTpcbiAqXG4gKiBBcnJheUJ1ZmZlclxuICogSFRNTE1lZGlhRWxlbWVudFxuICogQXJyYXkgKG9mIGZpbGVzIGUuZy4gWydmb28ub2dnJywgJ2Zvby5tcDMnXSlcbiAqIFN0cmluZyAoZmlsZW5hbWUgZS5nLiAnZm9vLm9nZycpXG4gKiBTdHJpbmcgKE9zY2lsbGF0b3IgdHlwZSBpLmUuICdzaW5lJywgJ3NxdWFyZScsICdzYXd0b290aCcsICd0cmlhbmdsZScpXG4gKiBPYmplY3QgKFNjcmlwdFByb2Nlc3NvciBjb25maWc6IHsgYnVmZmVyU2l6ZTogMTAyNCwgY2hhbm5lbHM6IDEsIGNhbGxiYWNrOiBmbiwgdGhpc0FyZzogc2VsZiB9KVxuICovXG5cblNvbm8ucHJvdG90eXBlLmNyZWF0ZVNvdW5kID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIC8vIHRyeSB0byBsb2FkIGlmIGRhdGEgaXMgQXJyYXkgb3IgZmlsZSBzdHJpbmdcbiAgICBpZihVdGlscy5pc0ZpbGUoZGF0YSkpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMubG9hZChkYXRhKTtcbiAgICB9XG4gICAgLy8gb3RoZXJ3aXNlIGp1c3QgcmV0dXJuIGEgbmV3IHNvdW5kIG9iamVjdFxuICAgIHZhciBzb3VuZCA9IG5ldyBTb3VuZCh0aGlzLl9jb250ZXh0LCBkYXRhLCB0aGlzLl9tYXN0ZXJHYWluKTtcbiAgICB0aGlzLl9zb3VuZHMucHVzaChzb3VuZCk7XG5cbiAgICByZXR1cm4gc291bmQ7XG59O1xuXG4vKlxuICogRGVzdHJveVxuICovXG5cblNvbm8ucHJvdG90eXBlLmRlc3Ryb3kgPSBmdW5jdGlvbihzb3VuZE9ySWQpIHtcbiAgICB2YXIgc291bmQ7XG4gICAgZm9yICh2YXIgaSA9IDAsIGwgPSB0aGlzLl9zb3VuZHMubGVuZ3RoOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIHNvdW5kID0gdGhpcy5fc291bmRzW2ldO1xuICAgICAgICBpZihzb3VuZCA9PT0gc291bmRPcklkIHx8IHNvdW5kLmlkID09PSBzb3VuZE9ySWQpIHtcbiAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICB9XG4gICAgfVxuICAgIGlmKHNvdW5kICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgdGhpcy5fc291bmRzLnNwbGljZShpLCAxKTtcblxuICAgICAgICBpZihzb3VuZC5sb2FkZXIpIHtcbiAgICAgICAgICAgIHNvdW5kLmxvYWRlci5jYW5jZWwoKTtcbiAgICAgICAgfVxuICAgICAgICB0cnkge1xuICAgICAgICAgICAgc291bmQuc3RvcCgpO1xuICAgICAgICB9IGNhdGNoKGUpIHt9XG4gICAgfVxufTtcblxuLypcbiAqIEdldCBTb3VuZCBieSBpZFxuICovXG5cblNvbm8ucHJvdG90eXBlLmdldEJ5SWQgPSBmdW5jdGlvbihpZCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gdGhpcy5fc291bmRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZih0aGlzLl9zb3VuZHNbaV0uaWQgPT09IGlkKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fc291bmRzW2ldO1xuICAgICAgICB9XG4gICAgfVxuICAgIHJldHVybiBudWxsO1xufTtcblxuLypcbiAqIExvYWRpbmdcbiAqL1xuXG5Tb25vLnByb3RvdHlwZS5sb2FkID0gZnVuY3Rpb24odXJsLCBjb21wbGV0ZSwgcHJvZ3Jlc3MsIHRoaXNBcmcsIGFzTWVkaWFFbGVtZW50KSB7XG4gICAgLy8gbXVsdGlwbGVcbiAgICBpZih1cmwgaW5zdGFuY2VvZiBBcnJheSAmJiB1cmwubGVuZ3RoICYmIHR5cGVvZiB1cmxbMF0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgIHRoaXMuX2xvYWRNdWx0aXBsZSh1cmwsIGNvbXBsZXRlLCBwcm9ncmVzcywgdGhpc0FyZywgYXNNZWRpYUVsZW1lbnQpO1xuICAgICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgdmFyIHNvdW5kID0gdGhpcy5fcXVldWUodXJsLCBhc01lZGlhRWxlbWVudCk7XG5cbiAgICBpZihwcm9ncmVzcykge1xuICAgICAgICBzb3VuZC5sb2FkZXIub25Qcm9ncmVzcy5hZGQocHJvZ3Jlc3MsIHRoaXNBcmcgfHwgdGhpcyk7XG4gICAgfVxuICAgIGlmKGNvbXBsZXRlKSB7XG4gICAgICAgIHNvdW5kLmxvYWRlci5vbkNvbXBsZXRlLmFkZE9uY2UoZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBjb21wbGV0ZS5jYWxsKHRoaXNBcmcgfHwgdGhpcywgc291bmQpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgc291bmQubG9hZGVyLnN0YXJ0KCk7XG5cbiAgICByZXR1cm4gc291bmQ7XG59O1xuXG5Tb25vLnByb3RvdHlwZS5fbG9hZE11bHRpcGxlID0gZnVuY3Rpb24oY29uZmlnLCBjb21wbGV0ZSwgcHJvZ3Jlc3MsIHRoaXNBcmcsIGFzTWVkaWFFbGVtZW50KSB7XG4gICAgdmFyIHNvdW5kcyA9IFtdO1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gY29uZmlnLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICB2YXIgZmlsZSA9IGNvbmZpZ1tpXTtcbiAgICAgICAgdmFyIHNvdW5kID0gdGhpcy5fcXVldWUoZmlsZS51cmwsIGFzTWVkaWFFbGVtZW50KTtcbiAgICAgICAgaWYoZmlsZS5pZCkgeyBzb3VuZC5pZCA9IGZpbGUuaWQ7IH1cbiAgICAgICAgc291bmQubG9vcCA9ICEhZmlsZS5sb29wO1xuICAgICAgICBzb3VuZC52b2x1bWUgPSBmaWxlLnZvbHVtZTtcbiAgICAgICAgc291bmRzLnB1c2goc291bmQpO1xuICAgIH1cbiAgICBpZihwcm9ncmVzcykge1xuICAgICAgICB0aGlzLl9sb2FkZXIub25Qcm9ncmVzcy5hZGQoZnVuY3Rpb24ocCkge1xuICAgICAgICAgICAgcHJvZ3Jlc3MuY2FsbCh0aGlzQXJnIHx8IHRoaXMsIHApO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgaWYoY29tcGxldGUpIHtcbiAgICAgICAgdGhpcy5fbG9hZGVyLm9uQ29tcGxldGUuYWRkT25jZShmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIGNvbXBsZXRlLmNhbGwodGhpc0FyZyB8fCB0aGlzLCBzb3VuZHMpO1xuICAgICAgICB9KTtcbiAgICB9XG4gICAgdGhpcy5fbG9hZGVyLnN0YXJ0KCk7XG59O1xuXG5Tb25vLnByb3RvdHlwZS5faW5pdExvYWRlciA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX2xvYWRlciA9IG5ldyBMb2FkZXIoKTtcbiAgICB0aGlzLl9sb2FkZXIudG91Y2hMb2NrZWQgPSB0aGlzLl9pc1RvdWNoTG9ja2VkO1xuICAgIHRoaXMuX2xvYWRlci53ZWJBdWRpb0NvbnRleHQgPSB0aGlzLl9jb250ZXh0O1xuICAgIHRoaXMuX2xvYWRlci5jcm9zc09yaWdpbiA9IHRydWU7XG59O1xuXG5Tb25vLnByb3RvdHlwZS5fcXVldWUgPSBmdW5jdGlvbih1cmwsIGFzTWVkaWFFbGVtZW50KSB7XG4gICAgaWYoIXRoaXMuX2xvYWRlcikge1xuICAgICAgICB0aGlzLl9pbml0TG9hZGVyKCk7XG4gICAgfVxuXG4gICAgdXJsID0gdGhpcy5fc3VwcG9ydC5nZXRTdXBwb3J0ZWRGaWxlKHVybCk7XG5cbiAgICB2YXIgc291bmQgPSB0aGlzLmNyZWF0ZVNvdW5kKCk7XG5cbiAgICBzb3VuZC5sb2FkZXIgPSB0aGlzLl9sb2FkZXIuYWRkKHVybCk7XG4gICAgc291bmQubG9hZGVyLm9uQmVmb3JlQ29tcGxldGUuYWRkT25jZShmdW5jdGlvbihidWZmZXIpIHtcbiAgICAgICAgc291bmQuc2V0RGF0YShidWZmZXIpO1xuICAgIH0pO1xuXG4gICAgaWYoYXNNZWRpYUVsZW1lbnQpIHtcbiAgICAgICAgc291bmQubG9hZGVyLndlYkF1ZGlvQ29udGV4dCA9IG51bGw7XG4gICAgfVxuXG4gICAgcmV0dXJuIHNvdW5kO1xufTtcblxuLypcbiAqIENvbnRyb2xzXG4gKi9cblxuU29uby5wcm90b3R5cGUubXV0ZSA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX3ByZU11dGVWb2x1bWUgPSB0aGlzLnZvbHVtZTtcbiAgICB0aGlzLnZvbHVtZSA9IDA7XG59O1xuXG5Tb25vLnByb3RvdHlwZS51bk11dGUgPSBmdW5jdGlvbigpIHtcbiAgICB0aGlzLnZvbHVtZSA9IHRoaXMuX3ByZU11dGVWb2x1bWUgfHwgMTtcbn07XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb25vLnByb3RvdHlwZSwgJ3ZvbHVtZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbWFzdGVyR2Fpbi5nYWluLnZhbHVlO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICBpZihpc05hTih2YWx1ZSkpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgdGhpcy5fbWFzdGVyR2Fpbi5nYWluLnZhbHVlID0gdmFsdWU7XG5cbiAgICAgICAgaWYoIXRoaXMuaGFzV2ViQXVkaW8pIHtcbiAgICAgICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gdGhpcy5fc291bmRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgICAgIHRoaXMuX3NvdW5kc1tpXS52b2x1bWUgPSB2YWx1ZTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG5Tb25vLnByb3RvdHlwZS5wYXVzZUFsbCA9IGZ1bmN0aW9uKCkge1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gdGhpcy5fc291bmRzLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICBpZih0aGlzLl9zb3VuZHNbaV0ucGxheWluZykge1xuICAgICAgICAgICAgdGhpcy5fc291bmRzW2ldLnBhdXNlKCk7XG4gICAgICAgIH1cbiAgICB9XG59O1xuXG5Tb25vLnByb3RvdHlwZS5yZXN1bWVBbGwgPSBmdW5jdGlvbigpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IHRoaXMuX3NvdW5kcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgaWYodGhpcy5fc291bmRzW2ldLnBhdXNlZCkge1xuICAgICAgICAgICAgdGhpcy5fc291bmRzW2ldLnBsYXkoKTtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cblNvbm8ucHJvdG90eXBlLnN0b3BBbGwgPSBmdW5jdGlvbigpIHtcbiAgICBmb3IgKHZhciBpID0gMCwgbCA9IHRoaXMuX3NvdW5kcy5sZW5ndGg7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdGhpcy5fc291bmRzW2ldLnN0b3AoKTtcbiAgICB9XG59O1xuXG5Tb25vLnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24oaWQsIGRlbGF5LCBvZmZzZXQpIHtcbiAgICB0aGlzLmdldEJ5SWQoaWQpLnBsYXkoZGVsYXksIG9mZnNldCk7XG59O1xuXG5Tb25vLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKGlkKSB7XG4gICAgdGhpcy5nZXRCeUlkKGlkKS5wYXVzZSgpO1xufTtcblxuU29uby5wcm90b3R5cGUuc3RvcCA9IGZ1bmN0aW9uKGlkKSB7XG4gICAgdGhpcy5nZXRCeUlkKGlkKS5zdG9wKCk7XG59O1xuXG4vKlxuICogTW9iaWxlIHRvdWNoIGxvY2tcbiAqL1xuXG5Tb25vLnByb3RvdHlwZS5faGFuZGxlVG91Y2hsb2NrID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHVhID0gbmF2aWdhdG9yLnVzZXJBZ2VudCxcbiAgICAgICAgbG9ja2VkID0gISF1YS5tYXRjaCgvQW5kcm9pZHx3ZWJPU3xpUGhvbmV8aVBhZHxpUG9kfEJsYWNrQmVycnl8SUVNb2JpbGV8T3BlcmEgTWluaS9pKSxcbiAgICAgICAgc2VsZiA9IHRoaXM7XG5cbiAgICB2YXIgdW5sb2NrID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkucmVtb3ZlRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIHVubG9jayk7XG4gICAgICAgIHNlbGYuX2lzVG91Y2hMb2NrZWQgPSBmYWxzZTtcbiAgICAgICAgaWYoc2VsZi5fbG9hZGVyKSB7XG4gICAgICAgICAgICBzZWxmLl9sb2FkZXIudG91Y2hMb2NrZWQgPSBmYWxzZTtcbiAgICAgICAgfVxuICAgICAgICBpZihzZWxmLmNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciBidWZmZXIgPSBzZWxmLmNvbnRleHQuY3JlYXRlQnVmZmVyKDEsIDEsIDIyMDUwKTtcbiAgICAgICAgICAgIHZhciB1bmxvY2tTb3VyY2UgPSBzZWxmLmNvbnRleHQuY3JlYXRlQnVmZmVyU291cmNlKCk7XG4gICAgICAgICAgICB1bmxvY2tTb3VyY2UuYnVmZmVyID0gYnVmZmVyO1xuICAgICAgICAgICAgdW5sb2NrU291cmNlLmNvbm5lY3Qoc2VsZi5jb250ZXh0LmRlc3RpbmF0aW9uKTtcbiAgICAgICAgICAgIHVubG9ja1NvdXJjZS5zdGFydCgwKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgaWYobG9ja2VkKSB7XG4gICAgICAgIGRvY3VtZW50LmJvZHkuYWRkRXZlbnRMaXN0ZW5lcigndG91Y2hzdGFydCcsIHVubG9jaywgZmFsc2UpO1xuICAgIH1cbiAgICB0aGlzLl9pc1RvdWNoTG9ja2VkID0gbG9ja2VkO1xufTtcblxuLypcbiAqIFBhZ2UgdmlzaWJpbGl0eSBldmVudHNcbiAqL1xuXG5Tb25vLnByb3RvdHlwZS5faGFuZGxlVmlzaWJpbGl0eSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBwYWdlSGlkZGVuUGF1c2VkID0gW10sXG4gICAgICAgIHNvdW5kcyA9IHRoaXMuX3NvdW5kcyxcbiAgICAgICAgaGlkZGVuLFxuICAgICAgICB2aXNpYmlsaXR5Q2hhbmdlO1xuXG4gICAgaWYgKHR5cGVvZiBkb2N1bWVudC5oaWRkZW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGhpZGRlbiA9ICdoaWRkZW4nO1xuICAgICAgICB2aXNpYmlsaXR5Q2hhbmdlID0gJ3Zpc2liaWxpdHljaGFuZ2UnO1xuICAgIH1cbiAgICBlbHNlIGlmICh0eXBlb2YgZG9jdW1lbnQubW96SGlkZGVuICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBoaWRkZW4gPSAnbW96SGlkZGVuJztcbiAgICAgICAgdmlzaWJpbGl0eUNoYW5nZSA9ICdtb3p2aXNpYmlsaXR5Y2hhbmdlJztcbiAgICB9XG4gICAgZWxzZSBpZiAodHlwZW9mIGRvY3VtZW50Lm1zSGlkZGVuICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICBoaWRkZW4gPSAnbXNIaWRkZW4nO1xuICAgICAgICB2aXNpYmlsaXR5Q2hhbmdlID0gJ21zdmlzaWJpbGl0eWNoYW5nZSc7XG4gICAgfVxuICAgIGVsc2UgaWYgKHR5cGVvZiBkb2N1bWVudC53ZWJraXRIaWRkZW4gIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGhpZGRlbiA9ICd3ZWJraXRIaWRkZW4nO1xuICAgICAgICB2aXNpYmlsaXR5Q2hhbmdlID0gJ3dlYmtpdHZpc2liaWxpdHljaGFuZ2UnO1xuICAgIH1cblxuICAgIC8vIHBhdXNlIGN1cnJlbnRseSBwbGF5aW5nIHNvdW5kcyBhbmQgc3RvcmUgcmVmc1xuICAgIGZ1bmN0aW9uIG9uSGlkZGVuKCkge1xuICAgICAgICB2YXIgbCA9IHNvdW5kcy5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgc291bmQgPSBzb3VuZHNbaV07XG4gICAgICAgICAgICBpZihzb3VuZC5wbGF5aW5nKSB7XG4gICAgICAgICAgICAgICAgc291bmQucGF1c2UoKTtcbiAgICAgICAgICAgICAgICBwYWdlSGlkZGVuUGF1c2VkLnB1c2goc291bmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLy8gcGxheSBzb3VuZHMgdGhhdCBnb3QgcGF1c2VkIHdoZW4gcGFnZSB3YXMgaGlkZGVuXG4gICAgZnVuY3Rpb24gb25TaG93bigpIHtcbiAgICAgICAgd2hpbGUocGFnZUhpZGRlblBhdXNlZC5sZW5ndGgpIHtcbiAgICAgICAgICAgIHBhZ2VIaWRkZW5QYXVzZWQucG9wKCkucGxheSgpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgZnVuY3Rpb24gb25DaGFuZ2UoKSB7XG4gICAgICAgIGlmIChkb2N1bWVudFtoaWRkZW5dKSB7XG4gICAgICAgICAgICBvbkhpZGRlbigpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgb25TaG93bigpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgaWYodmlzaWJpbGl0eUNoYW5nZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGRvY3VtZW50LmFkZEV2ZW50TGlzdGVuZXIodmlzaWJpbGl0eUNoYW5nZSwgb25DaGFuZ2UsIGZhbHNlKTtcbiAgICB9XG59O1xuXG4vKlxuICogTG9nIHZlcnNpb24gJiBkZXZpY2Ugc3VwcG9ydCBpbmZvXG4gKi9cblxuU29uby5wcm90b3R5cGUubG9nID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHRpdGxlID0gJ1Nvbm8gJyArIHRoaXMuVkVSU0lPTixcbiAgICAgICAgaW5mbyA9ICdTdXBwb3J0ZWQ6JyArIHRoaXMuaXNTdXBwb3J0ZWQgK1xuICAgICAgICAgICAgICAgJyBXZWJBdWRpb0FQSTonICsgdGhpcy5oYXNXZWJBdWRpbyArXG4gICAgICAgICAgICAgICAnIFRvdWNoTG9ja2VkOicgKyB0aGlzLl9pc1RvdWNoTG9ja2VkICtcbiAgICAgICAgICAgICAgICcgRXh0ZW5zaW9uczonICsgdGhpcy5fc3VwcG9ydC5leHRlbnNpb25zO1xuXG4gICAgaWYobmF2aWdhdG9yLnVzZXJBZ2VudC5pbmRleE9mKCdDaHJvbWUnKSA+IC0xKSB7XG4gICAgICAgIHZhciBhcmdzID0gW1xuICAgICAgICAgICAgICAgICclYyDimasgJyArIHRpdGxlICtcbiAgICAgICAgICAgICAgICAnIOKZqyAlYyAnICsgaW5mbyArICcgJyxcbiAgICAgICAgICAgICAgICAnY29sb3I6ICNGRkZGRkY7IGJhY2tncm91bmQ6ICMzNzlGN0EnLFxuICAgICAgICAgICAgICAgICdjb2xvcjogIzFGMUMwRDsgYmFja2dyb3VuZDogI0UwRkJBQydcbiAgICAgICAgICAgIF07XG4gICAgICAgIGNvbnNvbGUubG9nLmFwcGx5KGNvbnNvbGUsIGFyZ3MpO1xuICAgIH1cbiAgICBlbHNlIGlmICh3aW5kb3cuY29uc29sZSAmJiB3aW5kb3cuY29uc29sZS5sb2cuY2FsbCkge1xuICAgICAgICBjb25zb2xlLmxvZy5jYWxsKGNvbnNvbGUsIHRpdGxlICsgJyAnICsgaW5mbyk7XG4gICAgfVxufTtcblxuLypcbiAqIEdldHRlcnMgJiBTZXR0ZXJzXG4gKi9cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvbm8ucHJvdG90eXBlLCAnY2FuUGxheScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc3VwcG9ydC5jYW5QbGF5O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU29uby5wcm90b3R5cGUsICdjb250ZXh0Jywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb250ZXh0O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU29uby5wcm90b3R5cGUsICdoYXNXZWJBdWRpbycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gISF0aGlzLl9jb250ZXh0O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU29uby5wcm90b3R5cGUsICdpc1N1cHBvcnRlZCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc3VwcG9ydC5leHRlbnNpb25zLmxlbmd0aCA+IDA7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb25vLnByb3RvdHlwZSwgJ21hc3RlckdhaW4nLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX21hc3RlckdhaW47XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb25vLnByb3RvdHlwZSwgJ25vZGUnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX25vZGU7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb25vLnByb3RvdHlwZSwgJ3NvdW5kcycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc291bmRzO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU29uby5wcm90b3R5cGUsICd1dGlscycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gVXRpbHM7XG4gICAgfVxufSk7XG5cbi8qXG4gKiBFeHBvcnRzXG4gKi9cblxuaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBuZXcgU29ubygpO1xufVxuIiwiLypqc2xpbnQgb25ldmFyOnRydWUsIHVuZGVmOnRydWUsIG5ld2NhcDp0cnVlLCByZWdleHA6dHJ1ZSwgYml0d2lzZTp0cnVlLCBtYXhlcnI6NTAsIGluZGVudDo0LCB3aGl0ZTpmYWxzZSwgbm9tZW46ZmFsc2UsIHBsdXNwbHVzOmZhbHNlICovXG4vKmdsb2JhbCBkZWZpbmU6ZmFsc2UsIHJlcXVpcmU6ZmFsc2UsIGV4cG9ydHM6ZmFsc2UsIG1vZHVsZTpmYWxzZSwgc2lnbmFsczpmYWxzZSAqL1xuXG4vKiogQGxpY2Vuc2VcbiAqIEpTIFNpZ25hbHMgPGh0dHA6Ly9taWxsZXJtZWRlaXJvcy5naXRodWIuY29tL2pzLXNpZ25hbHMvPlxuICogUmVsZWFzZWQgdW5kZXIgdGhlIE1JVCBsaWNlbnNlXG4gKiBBdXRob3I6IE1pbGxlciBNZWRlaXJvc1xuICogVmVyc2lvbjogMS4wLjAgLSBCdWlsZDogMjY4ICgyMDEyLzExLzI5IDA1OjQ4IFBNKVxuICovXG5cbihmdW5jdGlvbihnbG9iYWwpe1xuXG4gICAgLy8gU2lnbmFsQmluZGluZyAtLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICAvKipcbiAgICAgKiBPYmplY3QgdGhhdCByZXByZXNlbnRzIGEgYmluZGluZyBiZXR3ZWVuIGEgU2lnbmFsIGFuZCBhIGxpc3RlbmVyIGZ1bmN0aW9uLlxuICAgICAqIDxiciAvPi0gPHN0cm9uZz5UaGlzIGlzIGFuIGludGVybmFsIGNvbnN0cnVjdG9yIGFuZCBzaG91bGRuJ3QgYmUgY2FsbGVkIGJ5IHJlZ3VsYXIgdXNlcnMuPC9zdHJvbmc+XG4gICAgICogPGJyIC8+LSBpbnNwaXJlZCBieSBKb2EgRWJlcnQgQVMzIFNpZ25hbEJpbmRpbmcgYW5kIFJvYmVydCBQZW5uZXIncyBTbG90IGNsYXNzZXMuXG4gICAgICogQGF1dGhvciBNaWxsZXIgTWVkZWlyb3NcbiAgICAgKiBAY29uc3RydWN0b3JcbiAgICAgKiBAaW50ZXJuYWxcbiAgICAgKiBAbmFtZSBTaWduYWxCaW5kaW5nXG4gICAgICogQHBhcmFtIHtTaWduYWx9IHNpZ25hbCBSZWZlcmVuY2UgdG8gU2lnbmFsIG9iamVjdCB0aGF0IGxpc3RlbmVyIGlzIGN1cnJlbnRseSBib3VuZCB0by5cbiAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBIYW5kbGVyIGZ1bmN0aW9uIGJvdW5kIHRvIHRoZSBzaWduYWwuXG4gICAgICogQHBhcmFtIHtib29sZWFufSBpc09uY2UgSWYgYmluZGluZyBzaG91bGQgYmUgZXhlY3V0ZWQganVzdCBvbmNlLlxuICAgICAqIEBwYXJhbSB7T2JqZWN0fSBbbGlzdGVuZXJDb250ZXh0XSBDb250ZXh0IG9uIHdoaWNoIGxpc3RlbmVyIHdpbGwgYmUgZXhlY3V0ZWQgKG9iamVjdCB0aGF0IHNob3VsZCByZXByZXNlbnQgdGhlIGB0aGlzYCB2YXJpYWJsZSBpbnNpZGUgbGlzdGVuZXIgZnVuY3Rpb24pLlxuICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldIFRoZSBwcmlvcml0eSBsZXZlbCBvZiB0aGUgZXZlbnQgbGlzdGVuZXIuIChkZWZhdWx0ID0gMCkuXG4gICAgICovXG4gICAgZnVuY3Rpb24gU2lnbmFsQmluZGluZyhzaWduYWwsIGxpc3RlbmVyLCBpc09uY2UsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcblxuICAgICAgICAvKipcbiAgICAgICAgICogSGFuZGxlciBmdW5jdGlvbiBib3VuZCB0byB0aGUgc2lnbmFsLlxuICAgICAgICAgKiBAdHlwZSBGdW5jdGlvblxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fbGlzdGVuZXIgPSBsaXN0ZW5lcjtcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgYmluZGluZyBzaG91bGQgYmUgZXhlY3V0ZWQganVzdCBvbmNlLlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9pc09uY2UgPSBpc09uY2U7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICAgICAqIEBtZW1iZXJPZiBTaWduYWxCaW5kaW5nLnByb3RvdHlwZVxuICAgICAgICAgKiBAbmFtZSBjb250ZXh0XG4gICAgICAgICAqIEB0eXBlIE9iamVjdHx1bmRlZmluZWR8bnVsbFxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5jb250ZXh0ID0gbGlzdGVuZXJDb250ZXh0O1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZWZlcmVuY2UgdG8gU2lnbmFsIG9iamVjdCB0aGF0IGxpc3RlbmVyIGlzIGN1cnJlbnRseSBib3VuZCB0by5cbiAgICAgICAgICogQHR5cGUgU2lnbmFsXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9zaWduYWwgPSBzaWduYWw7XG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIExpc3RlbmVyIHByaW9yaXR5XG4gICAgICAgICAqIEB0eXBlIE51bWJlclxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgdGhpcy5fcHJpb3JpdHkgPSBwcmlvcml0eSB8fCAwO1xuICAgIH1cblxuICAgIFNpZ25hbEJpbmRpbmcucHJvdG90eXBlID0ge1xuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBJZiBiaW5kaW5nIGlzIGFjdGl2ZSBhbmQgc2hvdWxkIGJlIGV4ZWN1dGVkLlxuICAgICAgICAgKiBAdHlwZSBib29sZWFuXG4gICAgICAgICAqL1xuICAgICAgICBhY3RpdmUgOiB0cnVlLFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBEZWZhdWx0IHBhcmFtZXRlcnMgcGFzc2VkIHRvIGxpc3RlbmVyIGR1cmluZyBgU2lnbmFsLmRpc3BhdGNoYCBhbmQgYFNpZ25hbEJpbmRpbmcuZXhlY3V0ZWAuIChjdXJyaWVkIHBhcmFtZXRlcnMpXG4gICAgICAgICAqIEB0eXBlIEFycmF5fG51bGxcbiAgICAgICAgICovXG4gICAgICAgIHBhcmFtcyA6IG51bGwsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIENhbGwgbGlzdGVuZXIgcGFzc2luZyBhcmJpdHJhcnkgcGFyYW1ldGVycy5cbiAgICAgICAgICogPHA+SWYgYmluZGluZyB3YXMgYWRkZWQgdXNpbmcgYFNpZ25hbC5hZGRPbmNlKClgIGl0IHdpbGwgYmUgYXV0b21hdGljYWxseSByZW1vdmVkIGZyb20gc2lnbmFsIGRpc3BhdGNoIHF1ZXVlLCB0aGlzIG1ldGhvZCBpcyB1c2VkIGludGVybmFsbHkgZm9yIHRoZSBzaWduYWwgZGlzcGF0Y2guPC9wPlxuICAgICAgICAgKiBAcGFyYW0ge0FycmF5fSBbcGFyYW1zQXJyXSBBcnJheSBvZiBwYXJhbWV0ZXJzIHRoYXQgc2hvdWxkIGJlIHBhc3NlZCB0byB0aGUgbGlzdGVuZXJcbiAgICAgICAgICogQHJldHVybiB7Kn0gVmFsdWUgcmV0dXJuZWQgYnkgdGhlIGxpc3RlbmVyLlxuICAgICAgICAgKi9cbiAgICAgICAgZXhlY3V0ZSA6IGZ1bmN0aW9uIChwYXJhbXNBcnIpIHtcbiAgICAgICAgICAgIHZhciBoYW5kbGVyUmV0dXJuLCBwYXJhbXM7XG4gICAgICAgICAgICBpZiAodGhpcy5hY3RpdmUgJiYgISF0aGlzLl9saXN0ZW5lcikge1xuICAgICAgICAgICAgICAgIHBhcmFtcyA9IHRoaXMucGFyYW1zPyB0aGlzLnBhcmFtcy5jb25jYXQocGFyYW1zQXJyKSA6IHBhcmFtc0FycjtcbiAgICAgICAgICAgICAgICBoYW5kbGVyUmV0dXJuID0gdGhpcy5fbGlzdGVuZXIuYXBwbHkodGhpcy5jb250ZXh0LCBwYXJhbXMpO1xuICAgICAgICAgICAgICAgIGlmICh0aGlzLl9pc09uY2UpIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5kZXRhY2goKTtcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gaGFuZGxlclJldHVybjtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogRGV0YWNoIGJpbmRpbmcgZnJvbSBzaWduYWwuXG4gICAgICAgICAqIC0gYWxpYXMgdG86IG15U2lnbmFsLnJlbW92ZShteUJpbmRpbmcuZ2V0TGlzdGVuZXIoKSk7XG4gICAgICAgICAqIEByZXR1cm4ge0Z1bmN0aW9ufG51bGx9IEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbCBvciBgbnVsbGAgaWYgYmluZGluZyB3YXMgcHJldmlvdXNseSBkZXRhY2hlZC5cbiAgICAgICAgICovXG4gICAgICAgIGRldGFjaCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLmlzQm91bmQoKT8gdGhpcy5fc2lnbmFsLnJlbW92ZSh0aGlzLl9saXN0ZW5lciwgdGhpcy5jb250ZXh0KSA6IG51bGw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEByZXR1cm4ge0Jvb2xlYW59IGB0cnVlYCBpZiBiaW5kaW5nIGlzIHN0aWxsIGJvdW5kIHRvIHRoZSBzaWduYWwgYW5kIGhhdmUgYSBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGlzQm91bmQgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gKCEhdGhpcy5fc2lnbmFsICYmICEhdGhpcy5fbGlzdGVuZXIpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtib29sZWFufSBJZiBTaWduYWxCaW5kaW5nIHdpbGwgb25seSBiZSBleGVjdXRlZCBvbmNlLlxuICAgICAgICAgKi9cbiAgICAgICAgaXNPbmNlIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2lzT25jZTtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7RnVuY3Rpb259IEhhbmRsZXIgZnVuY3Rpb24gYm91bmQgdG8gdGhlIHNpZ25hbC5cbiAgICAgICAgICovXG4gICAgICAgIGdldExpc3RlbmVyIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2xpc3RlbmVyO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWx9IFNpZ25hbCB0aGF0IGxpc3RlbmVyIGlzIGN1cnJlbnRseSBib3VuZCB0by5cbiAgICAgICAgICovXG4gICAgICAgIGdldFNpZ25hbCA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9zaWduYWw7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERlbGV0ZSBpbnN0YW5jZSBwcm9wZXJ0aWVzXG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfZGVzdHJveSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIGRlbGV0ZSB0aGlzLl9zaWduYWw7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fbGlzdGVuZXI7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5jb250ZXh0O1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcmV0dXJuIHtzdHJpbmd9IFN0cmluZyByZXByZXNlbnRhdGlvbiBvZiB0aGUgb2JqZWN0LlxuICAgICAgICAgKi9cbiAgICAgICAgdG9TdHJpbmcgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gJ1tTaWduYWxCaW5kaW5nIGlzT25jZTonICsgdGhpcy5faXNPbmNlICsnLCBpc0JvdW5kOicrIHRoaXMuaXNCb3VuZCgpICsnLCBhY3RpdmU6JyArIHRoaXMuYWN0aXZlICsgJ10nO1xuICAgICAgICB9XG5cbiAgICB9O1xuXG5cbi8qZ2xvYmFsIFNpZ25hbEJpbmRpbmc6ZmFsc2UqL1xuXG4gICAgLy8gU2lnbmFsIC0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tXG4gICAgLy89PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09XG5cbiAgICBmdW5jdGlvbiB2YWxpZGF0ZUxpc3RlbmVyKGxpc3RlbmVyLCBmbk5hbWUpIHtcbiAgICAgICAgaWYgKHR5cGVvZiBsaXN0ZW5lciAhPT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IEVycm9yKCAnbGlzdGVuZXIgaXMgYSByZXF1aXJlZCBwYXJhbSBvZiB7Zm59KCkgYW5kIHNob3VsZCBiZSBhIEZ1bmN0aW9uLicucmVwbGFjZSgne2ZufScsIGZuTmFtZSkgKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKlxuICAgICAqIEN1c3RvbSBldmVudCBicm9hZGNhc3RlclxuICAgICAqIDxiciAvPi0gaW5zcGlyZWQgYnkgUm9iZXJ0IFBlbm5lcidzIEFTMyBTaWduYWxzLlxuICAgICAqIEBuYW1lIFNpZ25hbFxuICAgICAqIEBhdXRob3IgTWlsbGVyIE1lZGVpcm9zXG4gICAgICogQGNvbnN0cnVjdG9yXG4gICAgICovXG4gICAgZnVuY3Rpb24gU2lnbmFsKCkge1xuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUgQXJyYXkuPFNpZ25hbEJpbmRpbmc+XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICB0aGlzLl9iaW5kaW5ncyA9IFtdO1xuICAgICAgICB0aGlzLl9wcmV2UGFyYW1zID0gbnVsbDtcblxuICAgICAgICAvLyBlbmZvcmNlIGRpc3BhdGNoIHRvIGF3YXlzIHdvcmsgb24gc2FtZSBjb250ZXh0ICgjNDcpXG4gICAgICAgIHZhciBzZWxmID0gdGhpcztcbiAgICAgICAgdGhpcy5kaXNwYXRjaCA9IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICBTaWduYWwucHJvdG90eXBlLmRpc3BhdGNoLmFwcGx5KHNlbGYsIGFyZ3VtZW50cyk7XG4gICAgICAgIH07XG4gICAgfVxuXG4gICAgU2lnbmFsLnByb3RvdHlwZSA9IHtcblxuICAgICAgICAvKipcbiAgICAgICAgICogU2lnbmFscyBWZXJzaW9uIE51bWJlclxuICAgICAgICAgKiBAdHlwZSBTdHJpbmdcbiAgICAgICAgICogQGNvbnN0XG4gICAgICAgICAqL1xuICAgICAgICBWRVJTSU9OIDogJzEuMC4wJyxcblxuICAgICAgICAvKipcbiAgICAgICAgICogSWYgU2lnbmFsIHNob3VsZCBrZWVwIHJlY29yZCBvZiBwcmV2aW91c2x5IGRpc3BhdGNoZWQgcGFyYW1ldGVycyBhbmRcbiAgICAgICAgICogYXV0b21hdGljYWxseSBleGVjdXRlIGxpc3RlbmVyIGR1cmluZyBgYWRkKClgL2BhZGRPbmNlKClgIGlmIFNpZ25hbCB3YXNcbiAgICAgICAgICogYWxyZWFkeSBkaXNwYXRjaGVkIGJlZm9yZS5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKi9cbiAgICAgICAgbWVtb3JpemUgOiBmYWxzZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKiBAcHJpdmF0ZVxuICAgICAgICAgKi9cbiAgICAgICAgX3Nob3VsZFByb3BhZ2F0ZSA6IHRydWUsXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIElmIFNpZ25hbCBpcyBhY3RpdmUgYW5kIHNob3VsZCBicm9hZGNhc3QgZXZlbnRzLlxuICAgICAgICAgKiA8cD48c3Ryb25nPklNUE9SVEFOVDo8L3N0cm9uZz4gU2V0dGluZyB0aGlzIHByb3BlcnR5IGR1cmluZyBhIGRpc3BhdGNoIHdpbGwgb25seSBhZmZlY3QgdGhlIG5leHQgZGlzcGF0Y2gsIGlmIHlvdSB3YW50IHRvIHN0b3AgdGhlIHByb3BhZ2F0aW9uIG9mIGEgc2lnbmFsIHVzZSBgaGFsdCgpYCBpbnN0ZWFkLjwvcD5cbiAgICAgICAgICogQHR5cGUgYm9vbGVhblxuICAgICAgICAgKi9cbiAgICAgICAgYWN0aXZlIDogdHJ1ZSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXJcbiAgICAgICAgICogQHBhcmFtIHtib29sZWFufSBpc09uY2VcbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdXG4gICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbEJpbmRpbmd9XG4gICAgICAgICAqIEBwcml2YXRlXG4gICAgICAgICAqL1xuICAgICAgICBfcmVnaXN0ZXJMaXN0ZW5lciA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgaXNPbmNlLCBsaXN0ZW5lckNvbnRleHQsIHByaW9yaXR5KSB7XG5cbiAgICAgICAgICAgIHZhciBwcmV2SW5kZXggPSB0aGlzLl9pbmRleE9mTGlzdGVuZXIobGlzdGVuZXIsIGxpc3RlbmVyQ29udGV4dCksXG4gICAgICAgICAgICAgICAgYmluZGluZztcblxuICAgICAgICAgICAgaWYgKHByZXZJbmRleCAhPT0gLTEpIHtcbiAgICAgICAgICAgICAgICBiaW5kaW5nID0gdGhpcy5fYmluZGluZ3NbcHJldkluZGV4XTtcbiAgICAgICAgICAgICAgICBpZiAoYmluZGluZy5pc09uY2UoKSAhPT0gaXNPbmNlKSB7XG4gICAgICAgICAgICAgICAgICAgIHRocm93IG5ldyBFcnJvcignWW91IGNhbm5vdCBhZGQnKyAoaXNPbmNlPyAnJyA6ICdPbmNlJykgKycoKSB0aGVuIGFkZCcrICghaXNPbmNlPyAnJyA6ICdPbmNlJykgKycoKSB0aGUgc2FtZSBsaXN0ZW5lciB3aXRob3V0IHJlbW92aW5nIHRoZSByZWxhdGlvbnNoaXAgZmlyc3QuJyk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgICAgICBiaW5kaW5nID0gbmV3IFNpZ25hbEJpbmRpbmcodGhpcywgbGlzdGVuZXIsIGlzT25jZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSk7XG4gICAgICAgICAgICAgICAgdGhpcy5fYWRkQmluZGluZyhiaW5kaW5nKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgaWYodGhpcy5tZW1vcml6ZSAmJiB0aGlzLl9wcmV2UGFyYW1zKXtcbiAgICAgICAgICAgICAgICBiaW5kaW5nLmV4ZWN1dGUodGhpcy5fcHJldlBhcmFtcyk7XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHJldHVybiBiaW5kaW5nO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBAcGFyYW0ge1NpZ25hbEJpbmRpbmd9IGJpbmRpbmdcbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9hZGRCaW5kaW5nIDogZnVuY3Rpb24gKGJpbmRpbmcpIHtcbiAgICAgICAgICAgIC8vc2ltcGxpZmllZCBpbnNlcnRpb24gc29ydFxuICAgICAgICAgICAgdmFyIG4gPSB0aGlzLl9iaW5kaW5ncy5sZW5ndGg7XG4gICAgICAgICAgICBkbyB7IC0tbjsgfSB3aGlsZSAodGhpcy5fYmluZGluZ3Nbbl0gJiYgYmluZGluZy5fcHJpb3JpdHkgPD0gdGhpcy5fYmluZGluZ3Nbbl0uX3ByaW9yaXR5KTtcbiAgICAgICAgICAgIHRoaXMuX2JpbmRpbmdzLnNwbGljZShuICsgMSwgMCwgYmluZGluZyk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyXG4gICAgICAgICAqIEByZXR1cm4ge251bWJlcn1cbiAgICAgICAgICogQHByaXZhdGVcbiAgICAgICAgICovXG4gICAgICAgIF9pbmRleE9mTGlzdGVuZXIgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhciBuID0gdGhpcy5fYmluZGluZ3MubGVuZ3RoLFxuICAgICAgICAgICAgICAgIGN1cjtcbiAgICAgICAgICAgIHdoaWxlIChuLS0pIHtcbiAgICAgICAgICAgICAgICBjdXIgPSB0aGlzLl9iaW5kaW5nc1tuXTtcbiAgICAgICAgICAgICAgICBpZiAoY3VyLl9saXN0ZW5lciA9PT0gbGlzdGVuZXIgJiYgY3VyLmNvbnRleHQgPT09IGNvbnRleHQpIHtcbiAgICAgICAgICAgICAgICAgICAgcmV0dXJuIG47XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIC0xO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBDaGVjayBpZiBsaXN0ZW5lciB3YXMgYXR0YWNoZWQgdG8gU2lnbmFsLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lclxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2NvbnRleHRdXG4gICAgICAgICAqIEByZXR1cm4ge2Jvb2xlYW59IGlmIFNpZ25hbCBoYXMgdGhlIHNwZWNpZmllZCBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGhhcyA6IGZ1bmN0aW9uIChsaXN0ZW5lciwgY29udGV4dCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2luZGV4T2ZMaXN0ZW5lcihsaXN0ZW5lciwgY29udGV4dCkgIT09IC0xO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBBZGQgYSBsaXN0ZW5lciB0byB0aGUgc2lnbmFsLlxuICAgICAgICAgKiBAcGFyYW0ge0Z1bmN0aW9ufSBsaXN0ZW5lciBTaWduYWwgaGFuZGxlciBmdW5jdGlvbi5cbiAgICAgICAgICogQHBhcmFtIHtPYmplY3R9IFtsaXN0ZW5lckNvbnRleHRdIENvbnRleHQgb24gd2hpY2ggbGlzdGVuZXIgd2lsbCBiZSBleGVjdXRlZCAob2JqZWN0IHRoYXQgc2hvdWxkIHJlcHJlc2VudCB0aGUgYHRoaXNgIHZhcmlhYmxlIGluc2lkZSBsaXN0ZW5lciBmdW5jdGlvbikuXG4gICAgICAgICAqIEBwYXJhbSB7TnVtYmVyfSBbcHJpb3JpdHldIFRoZSBwcmlvcml0eSBsZXZlbCBvZiB0aGUgZXZlbnQgbGlzdGVuZXIuIExpc3RlbmVycyB3aXRoIGhpZ2hlciBwcmlvcml0eSB3aWxsIGJlIGV4ZWN1dGVkIGJlZm9yZSBsaXN0ZW5lcnMgd2l0aCBsb3dlciBwcmlvcml0eS4gTGlzdGVuZXJzIHdpdGggc2FtZSBwcmlvcml0eSBsZXZlbCB3aWxsIGJlIGV4ZWN1dGVkIGF0IHRoZSBzYW1lIG9yZGVyIGFzIHRoZXkgd2VyZSBhZGRlZC4gKGRlZmF1bHQgPSAwKVxuICAgICAgICAgKiBAcmV0dXJuIHtTaWduYWxCaW5kaW5nfSBBbiBPYmplY3QgcmVwcmVzZW50aW5nIHRoZSBiaW5kaW5nIGJldHdlZW4gdGhlIFNpZ25hbCBhbmQgbGlzdGVuZXIuXG4gICAgICAgICAqL1xuICAgICAgICBhZGQgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsICdhZGQnKTtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9yZWdpc3Rlckxpc3RlbmVyKGxpc3RlbmVyLCBmYWxzZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIEFkZCBsaXN0ZW5lciB0byB0aGUgc2lnbmFsIHRoYXQgc2hvdWxkIGJlIHJlbW92ZWQgYWZ0ZXIgZmlyc3QgZXhlY3V0aW9uICh3aWxsIGJlIGV4ZWN1dGVkIG9ubHkgb25jZSkuXG4gICAgICAgICAqIEBwYXJhbSB7RnVuY3Rpb259IGxpc3RlbmVyIFNpZ25hbCBoYW5kbGVyIGZ1bmN0aW9uLlxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2xpc3RlbmVyQ29udGV4dF0gQ29udGV4dCBvbiB3aGljaCBsaXN0ZW5lciB3aWxsIGJlIGV4ZWN1dGVkIChvYmplY3QgdGhhdCBzaG91bGQgcmVwcmVzZW50IHRoZSBgdGhpc2AgdmFyaWFibGUgaW5zaWRlIGxpc3RlbmVyIGZ1bmN0aW9uKS5cbiAgICAgICAgICogQHBhcmFtIHtOdW1iZXJ9IFtwcmlvcml0eV0gVGhlIHByaW9yaXR5IGxldmVsIG9mIHRoZSBldmVudCBsaXN0ZW5lci4gTGlzdGVuZXJzIHdpdGggaGlnaGVyIHByaW9yaXR5IHdpbGwgYmUgZXhlY3V0ZWQgYmVmb3JlIGxpc3RlbmVycyB3aXRoIGxvd2VyIHByaW9yaXR5LiBMaXN0ZW5lcnMgd2l0aCBzYW1lIHByaW9yaXR5IGxldmVsIHdpbGwgYmUgZXhlY3V0ZWQgYXQgdGhlIHNhbWUgb3JkZXIgYXMgdGhleSB3ZXJlIGFkZGVkLiAoZGVmYXVsdCA9IDApXG4gICAgICAgICAqIEByZXR1cm4ge1NpZ25hbEJpbmRpbmd9IEFuIE9iamVjdCByZXByZXNlbnRpbmcgdGhlIGJpbmRpbmcgYmV0d2VlbiB0aGUgU2lnbmFsIGFuZCBsaXN0ZW5lci5cbiAgICAgICAgICovXG4gICAgICAgIGFkZE9uY2UgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGxpc3RlbmVyQ29udGV4dCwgcHJpb3JpdHkpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsICdhZGRPbmNlJyk7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcmVnaXN0ZXJMaXN0ZW5lcihsaXN0ZW5lciwgdHJ1ZSwgbGlzdGVuZXJDb250ZXh0LCBwcmlvcml0eSk7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIFJlbW92ZSBhIHNpbmdsZSBsaXN0ZW5lciBmcm9tIHRoZSBkaXNwYXRjaCBxdWV1ZS5cbiAgICAgICAgICogQHBhcmFtIHtGdW5jdGlvbn0gbGlzdGVuZXIgSGFuZGxlciBmdW5jdGlvbiB0aGF0IHNob3VsZCBiZSByZW1vdmVkLlxuICAgICAgICAgKiBAcGFyYW0ge09iamVjdH0gW2NvbnRleHRdIEV4ZWN1dGlvbiBjb250ZXh0IChzaW5jZSB5b3UgY2FuIGFkZCB0aGUgc2FtZSBoYW5kbGVyIG11bHRpcGxlIHRpbWVzIGlmIGV4ZWN1dGluZyBpbiBhIGRpZmZlcmVudCBjb250ZXh0KS5cbiAgICAgICAgICogQHJldHVybiB7RnVuY3Rpb259IExpc3RlbmVyIGhhbmRsZXIgZnVuY3Rpb24uXG4gICAgICAgICAqL1xuICAgICAgICByZW1vdmUgOiBmdW5jdGlvbiAobGlzdGVuZXIsIGNvbnRleHQpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlTGlzdGVuZXIobGlzdGVuZXIsICdyZW1vdmUnKTtcblxuICAgICAgICAgICAgdmFyIGkgPSB0aGlzLl9pbmRleE9mTGlzdGVuZXIobGlzdGVuZXIsIGNvbnRleHQpO1xuICAgICAgICAgICAgaWYgKGkgIT09IC0xKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5fYmluZGluZ3NbaV0uX2Rlc3Ryb3koKTsgLy9ubyByZWFzb24gdG8gYSBTaWduYWxCaW5kaW5nIGV4aXN0IGlmIGl0IGlzbid0IGF0dGFjaGVkIHRvIGEgc2lnbmFsXG4gICAgICAgICAgICAgICAgdGhpcy5fYmluZGluZ3Muc3BsaWNlKGksIDEpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGxpc3RlbmVyO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBSZW1vdmUgYWxsIGxpc3RlbmVycyBmcm9tIHRoZSBTaWduYWwuXG4gICAgICAgICAqL1xuICAgICAgICByZW1vdmVBbGwgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICB2YXIgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aDtcbiAgICAgICAgICAgIHdoaWxlIChuLS0pIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9iaW5kaW5nc1tuXS5fZGVzdHJveSgpO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgdGhpcy5fYmluZGluZ3MubGVuZ3RoID0gMDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7bnVtYmVyfSBOdW1iZXIgb2YgbGlzdGVuZXJzIGF0dGFjaGVkIHRvIHRoZSBTaWduYWwuXG4gICAgICAgICAqL1xuICAgICAgICBnZXROdW1MaXN0ZW5lcnMgOiBmdW5jdGlvbiAoKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fYmluZGluZ3MubGVuZ3RoO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBTdG9wIHByb3BhZ2F0aW9uIG9mIHRoZSBldmVudCwgYmxvY2tpbmcgdGhlIGRpc3BhdGNoIHRvIG5leHQgbGlzdGVuZXJzIG9uIHRoZSBxdWV1ZS5cbiAgICAgICAgICogPHA+PHN0cm9uZz5JTVBPUlRBTlQ6PC9zdHJvbmc+IHNob3VsZCBiZSBjYWxsZWQgb25seSBkdXJpbmcgc2lnbmFsIGRpc3BhdGNoLCBjYWxsaW5nIGl0IGJlZm9yZS9hZnRlciBkaXNwYXRjaCB3b24ndCBhZmZlY3Qgc2lnbmFsIGJyb2FkY2FzdC48L3A+XG4gICAgICAgICAqIEBzZWUgU2lnbmFsLnByb3RvdHlwZS5kaXNhYmxlXG4gICAgICAgICAqL1xuICAgICAgICBoYWx0IDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgdGhpcy5fc2hvdWxkUHJvcGFnYXRlID0gZmFsc2U7XG4gICAgICAgIH0sXG5cbiAgICAgICAgLyoqXG4gICAgICAgICAqIERpc3BhdGNoL0Jyb2FkY2FzdCBTaWduYWwgdG8gYWxsIGxpc3RlbmVycyBhZGRlZCB0byB0aGUgcXVldWUuXG4gICAgICAgICAqIEBwYXJhbSB7Li4uKn0gW3BhcmFtc10gUGFyYW1ldGVycyB0aGF0IHNob3VsZCBiZSBwYXNzZWQgdG8gZWFjaCBoYW5kbGVyLlxuICAgICAgICAgKi9cbiAgICAgICAgZGlzcGF0Y2ggOiBmdW5jdGlvbiAocGFyYW1zKSB7XG4gICAgICAgICAgICBpZiAoISB0aGlzLmFjdGl2ZSkge1xuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdmFyIHBhcmFtc0FyciA9IEFycmF5LnByb3RvdHlwZS5zbGljZS5jYWxsKGFyZ3VtZW50cyksXG4gICAgICAgICAgICAgICAgbiA9IHRoaXMuX2JpbmRpbmdzLmxlbmd0aCxcbiAgICAgICAgICAgICAgICBiaW5kaW5ncztcblxuICAgICAgICAgICAgaWYgKHRoaXMubWVtb3JpemUpIHtcbiAgICAgICAgICAgICAgICB0aGlzLl9wcmV2UGFyYW1zID0gcGFyYW1zQXJyO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICBpZiAoISBuKSB7XG4gICAgICAgICAgICAgICAgLy9zaG91bGQgY29tZSBhZnRlciBtZW1vcml6ZVxuICAgICAgICAgICAgICAgIHJldHVybjtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgYmluZGluZ3MgPSB0aGlzLl9iaW5kaW5ncy5zbGljZSgpOyAvL2Nsb25lIGFycmF5IGluIGNhc2UgYWRkL3JlbW92ZSBpdGVtcyBkdXJpbmcgZGlzcGF0Y2hcbiAgICAgICAgICAgIHRoaXMuX3Nob3VsZFByb3BhZ2F0ZSA9IHRydWU7IC8vaW4gY2FzZSBgaGFsdGAgd2FzIGNhbGxlZCBiZWZvcmUgZGlzcGF0Y2ggb3IgZHVyaW5nIHRoZSBwcmV2aW91cyBkaXNwYXRjaC5cblxuICAgICAgICAgICAgLy9leGVjdXRlIGFsbCBjYWxsYmFja3MgdW50aWwgZW5kIG9mIHRoZSBsaXN0IG9yIHVudGlsIGEgY2FsbGJhY2sgcmV0dXJucyBgZmFsc2VgIG9yIHN0b3BzIHByb3BhZ2F0aW9uXG4gICAgICAgICAgICAvL3JldmVyc2UgbG9vcCBzaW5jZSBsaXN0ZW5lcnMgd2l0aCBoaWdoZXIgcHJpb3JpdHkgd2lsbCBiZSBhZGRlZCBhdCB0aGUgZW5kIG9mIHRoZSBsaXN0XG4gICAgICAgICAgICBkbyB7IG4tLTsgfSB3aGlsZSAoYmluZGluZ3Nbbl0gJiYgdGhpcy5fc2hvdWxkUHJvcGFnYXRlICYmIGJpbmRpbmdzW25dLmV4ZWN1dGUocGFyYW1zQXJyKSAhPT0gZmFsc2UpO1xuICAgICAgICB9LFxuXG4gICAgICAgIC8qKlxuICAgICAgICAgKiBGb3JnZXQgbWVtb3JpemVkIGFyZ3VtZW50cy5cbiAgICAgICAgICogQHNlZSBTaWduYWwubWVtb3JpemVcbiAgICAgICAgICovXG4gICAgICAgIGZvcmdldCA6IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICB0aGlzLl9wcmV2UGFyYW1zID0gbnVsbDtcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogUmVtb3ZlIGFsbCBiaW5kaW5ncyBmcm9tIHNpZ25hbCBhbmQgZGVzdHJveSBhbnkgcmVmZXJlbmNlIHRvIGV4dGVybmFsIG9iamVjdHMgKGRlc3Ryb3kgU2lnbmFsIG9iamVjdCkuXG4gICAgICAgICAqIDxwPjxzdHJvbmc+SU1QT1JUQU5UOjwvc3Ryb25nPiBjYWxsaW5nIGFueSBtZXRob2Qgb24gdGhlIHNpZ25hbCBpbnN0YW5jZSBhZnRlciBjYWxsaW5nIGRpc3Bvc2Ugd2lsbCB0aHJvdyBlcnJvcnMuPC9wPlxuICAgICAgICAgKi9cbiAgICAgICAgZGlzcG9zZSA6IGZ1bmN0aW9uICgpIHtcbiAgICAgICAgICAgIHRoaXMucmVtb3ZlQWxsKCk7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fYmluZGluZ3M7XG4gICAgICAgICAgICBkZWxldGUgdGhpcy5fcHJldlBhcmFtcztcbiAgICAgICAgfSxcblxuICAgICAgICAvKipcbiAgICAgICAgICogQHJldHVybiB7c3RyaW5nfSBTdHJpbmcgcmVwcmVzZW50YXRpb24gb2YgdGhlIG9iamVjdC5cbiAgICAgICAgICovXG4gICAgICAgIHRvU3RyaW5nIDogZnVuY3Rpb24gKCkge1xuICAgICAgICAgICAgcmV0dXJuICdbU2lnbmFsIGFjdGl2ZTonKyB0aGlzLmFjdGl2ZSArJyBudW1MaXN0ZW5lcnM6JysgdGhpcy5nZXROdW1MaXN0ZW5lcnMoKSArJ10nO1xuICAgICAgICB9XG5cbiAgICB9O1xuXG5cbiAgICAvLyBOYW1lc3BhY2UgLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS0tLS1cbiAgICAvLz09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT1cblxuICAgIC8qKlxuICAgICAqIFNpZ25hbHMgbmFtZXNwYWNlXG4gICAgICogQG5hbWVzcGFjZVxuICAgICAqIEBuYW1lIHNpZ25hbHNcbiAgICAgKi9cbiAgICB2YXIgc2lnbmFscyA9IFNpZ25hbDtcblxuICAgIC8qKlxuICAgICAqIEN1c3RvbSBldmVudCBicm9hZGNhc3RlclxuICAgICAqIEBzZWUgU2lnbmFsXG4gICAgICovXG4gICAgLy8gYWxpYXMgZm9yIGJhY2t3YXJkcyBjb21wYXRpYmlsaXR5IChzZWUgI2doLTQ0KVxuICAgIHNpZ25hbHMuU2lnbmFsID0gU2lnbmFsO1xuXG5cblxuICAgIC8vZXhwb3J0cyB0byBtdWx0aXBsZSBlbnZpcm9ubWVudHNcbiAgICBpZih0eXBlb2YgZGVmaW5lID09PSAnZnVuY3Rpb24nICYmIGRlZmluZS5hbWQpeyAvL0FNRFxuICAgICAgICBkZWZpbmUoZnVuY3Rpb24gKCkgeyByZXR1cm4gc2lnbmFsczsgfSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgbW9kdWxlICE9PSAndW5kZWZpbmVkJyAmJiBtb2R1bGUuZXhwb3J0cyl7IC8vbm9kZVxuICAgICAgICBtb2R1bGUuZXhwb3J0cyA9IHNpZ25hbHM7XG4gICAgfSBlbHNlIHsgLy9icm93c2VyXG4gICAgICAgIC8vdXNlIHN0cmluZyBiZWNhdXNlIG9mIEdvb2dsZSBjbG9zdXJlIGNvbXBpbGVyIEFEVkFOQ0VEX01PREVcbiAgICAgICAgLypqc2xpbnQgc3ViOnRydWUgKi9cbiAgICAgICAgZ2xvYmFsWydzaWduYWxzJ10gPSBzaWduYWxzO1xuICAgIH1cblxufSh0aGlzKSk7XG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBzaWduYWxzID0gcmVxdWlyZSgnc2lnbmFscycpO1xuXG5mdW5jdGlvbiBMb2FkZXIoKSB7XG4gICAgdGhpcy5vbkNoaWxkQ29tcGxldGUgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICB0aGlzLm9uQ29tcGxldGUgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICB0aGlzLm9uUHJvZ3Jlc3MgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICB0aGlzLm9uRXJyb3IgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcblxuICAgIHRoaXMuY3Jvc3NPcmlnaW4gPSBmYWxzZTtcbiAgICB0aGlzLmxvYWRlZCA9IGZhbHNlO1xuICAgIHRoaXMubG9hZGVycyA9IHt9O1xuICAgIHRoaXMubG9hZGluZyA9IGZhbHNlO1xuICAgIHRoaXMubnVtTG9hZGVkID0gMDtcbiAgICB0aGlzLm51bVRvdGFsID0gMDtcbiAgICB0aGlzLnF1ZXVlID0gW107XG4gICAgdGhpcy50b3VjaExvY2tlZCA9IGZhbHNlO1xuICAgIHRoaXMud2ViQXVkaW9Db250ZXh0ID0gbnVsbDtcbn1cblxuTG9hZGVyLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbih1cmwpIHtcbiAgICB2YXIgbG9hZGVyID0gbmV3IExvYWRlci5GaWxlKHVybCk7XG4gICAgbG9hZGVyLndlYkF1ZGlvQ29udGV4dCA9IHRoaXMud2ViQXVkaW9Db250ZXh0O1xuICAgIGxvYWRlci5jcm9zc09yaWdpbiA9IHRoaXMuY3Jvc3NPcmlnaW47XG4gICAgbG9hZGVyLnRvdWNoTG9ja2VkID0gdGhpcy50b3VjaExvY2tlZDtcbiAgICB0aGlzLnF1ZXVlLnB1c2gobG9hZGVyKTtcbiAgICB0aGlzLmxvYWRlcnNbbG9hZGVyLnVybF0gPSBsb2FkZXI7XG4gICAgdGhpcy5udW1Ub3RhbCsrO1xuICAgIHJldHVybiBsb2FkZXI7XG59O1xuXG5Mb2FkZXIucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5udW1Ub3RhbCA9IHRoaXMucXVldWUubGVuZ3RoO1xuICAgIGlmKCF0aGlzLmxvYWRpbmcpIHtcbiAgICAgICAgdGhpcy5sb2FkaW5nID0gdHJ1ZTtcbiAgICAgICAgdGhpcy5uZXh0KCk7XG4gICAgfVxufTtcblxuTG9hZGVyLnByb3RvdHlwZS5uZXh0ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYodGhpcy5xdWV1ZS5sZW5ndGggPT09IDApIHtcbiAgICAgICAgdGhpcy5sb2FkZWQgPSB0cnVlO1xuICAgICAgICB0aGlzLmxvYWRpbmcgPSBmYWxzZTtcbiAgICAgICAgdGhpcy5vbkNvbXBsZXRlLmRpc3BhdGNoKHRoaXMubG9hZGVycyk7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgdmFyIGxvYWRlciA9IHRoaXMucXVldWUucG9wKCk7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHZhciBwcm9ncmVzc0hhbmRsZXIgPSBmdW5jdGlvbihwcm9ncmVzcykge1xuICAgICAgICB2YXIgbnVtTG9hZGVkID0gc2VsZi5udW1Mb2FkZWQgKyBwcm9ncmVzcztcbiAgICAgICAgaWYoc2VsZi5vblByb2dyZXNzLmdldE51bUxpc3RlbmVycygpID4gMCkge1xuICAgICAgICAgICAgc2VsZi5vblByb2dyZXNzLmRpc3BhdGNoKG51bUxvYWRlZC9zZWxmLm51bVRvdGFsKTtcbiAgICAgICAgfVxuICAgIH07XG4gICAgbG9hZGVyLm9uUHJvZ3Jlc3MuYWRkKHByb2dyZXNzSGFuZGxlcik7XG4gICAgdmFyIGNvbXBsZXRlSGFuZGxlciA9IGZ1bmN0aW9uKCl7XG4gICAgICAgIGxvYWRlci5vblByb2dyZXNzLnJlbW92ZShwcm9ncmVzc0hhbmRsZXIpO1xuICAgICAgICBzZWxmLm51bUxvYWRlZCsrO1xuICAgICAgICBpZihzZWxmLm9uUHJvZ3Jlc3MuZ2V0TnVtTGlzdGVuZXJzKCkgPiAwKSB7XG4gICAgICAgICAgICBzZWxmLm9uUHJvZ3Jlc3MuZGlzcGF0Y2goc2VsZi5udW1Mb2FkZWQvc2VsZi5udW1Ub3RhbCk7XG4gICAgICAgIH1cbiAgICAgICAgc2VsZi5vbkNoaWxkQ29tcGxldGUuZGlzcGF0Y2gobG9hZGVyKTtcbiAgICAgICAgc2VsZi5uZXh0KCk7XG4gICAgfTtcbiAgICBsb2FkZXIub25CZWZvcmVDb21wbGV0ZS5hZGRPbmNlKGNvbXBsZXRlSGFuZGxlcik7XG4gICAgdmFyIGVycm9ySGFuZGxlciA9IGZ1bmN0aW9uKCl7XG4gICAgICAgIHNlbGYub25FcnJvci5kaXNwYXRjaChsb2FkZXIpO1xuICAgICAgICBzZWxmLm5leHQoKTtcbiAgICB9O1xuICAgIGxvYWRlci5vbkVycm9yLmFkZE9uY2UoZXJyb3JIYW5kbGVyKTtcbiAgICBsb2FkZXIuc3RhcnQoKTtcbn07XG5cbi8qTG9hZGVyLnByb3RvdHlwZS5hZGRNdWx0aXBsZSA9IGZ1bmN0aW9uKGFycmF5KSB7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBhcnJheS5sZW5ndGg7IGkrKykge1xuICAgICAgICB0aGlzLmFkZChhcnJheVtpXSk7XG4gICAgfVxufTtcblxuTG9hZGVyLnByb3RvdHlwZS5nZXQgPSBmdW5jdGlvbih1cmwpIHtcbiAgICByZXR1cm4gdGhpcy5sb2FkZXJzW3VybF07XG59OyovXG5cbkxvYWRlci5GaWxlID0gZnVuY3Rpb24odXJsKSB7XG4gICAgdGhpcy51cmwgPSB1cmw7XG5cbiAgICB0aGlzLm9uUHJvZ3Jlc3MgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICB0aGlzLm9uQmVmb3JlQ29tcGxldGUgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICB0aGlzLm9uQ29tcGxldGUgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcbiAgICB0aGlzLm9uRXJyb3IgPSBuZXcgc2lnbmFscy5TaWduYWwoKTtcblxuICAgIHRoaXMud2ViQXVkaW9Db250ZXh0ID0gbnVsbDtcbiAgICB0aGlzLmNyb3NzT3JpZ2luID0gZmFsc2U7XG4gICAgdGhpcy50b3VjaExvY2tlZCA9IGZhbHNlO1xuICAgIHRoaXMucHJvZ3Jlc3MgPSAwO1xufTtcblxuTG9hZGVyLkZpbGUucHJvdG90eXBlLnN0YXJ0ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYodGhpcy53ZWJBdWRpb0NvbnRleHQpIHtcbiAgICAgICAgdGhpcy5sb2FkQXJyYXlCdWZmZXIodGhpcy53ZWJBdWRpb0NvbnRleHQpO1xuICAgIH0gZWxzZSB7XG4gICAgICAgIHRoaXMubG9hZEF1ZGlvRWxlbWVudCh0aGlzLnRvdWNoTG9ja2VkKTtcbiAgICB9XG59O1xuXG5Mb2FkZXIuRmlsZS5wcm90b3R5cGUubG9hZEFycmF5QnVmZmVyID0gZnVuY3Rpb24od2ViQXVkaW9Db250ZXh0KSB7XG4gICAgdmFyIHJlcXVlc3QgPSBuZXcgWE1MSHR0cFJlcXVlc3QoKTtcbiAgICByZXF1ZXN0Lm9wZW4oJ0dFVCcsIHRoaXMudXJsLCB0cnVlKTtcbiAgICByZXF1ZXN0LnJlc3BvbnNlVHlwZSA9ICdhcnJheWJ1ZmZlcic7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJlcXVlc3Qub25wcm9ncmVzcyA9IGZ1bmN0aW9uKGV2ZW50KSB7XG4gICAgICAgIGlmIChldmVudC5sZW5ndGhDb21wdXRhYmxlKSB7XG4gICAgICAgICAgICBzZWxmLnByb2dyZXNzID0gZXZlbnQubG9hZGVkIC8gZXZlbnQudG90YWw7XG4gICAgICAgICAgICBzZWxmLm9uUHJvZ3Jlc3MuZGlzcGF0Y2goc2VsZi5wcm9ncmVzcyk7XG4gICAgICAgIH1cbiAgICB9O1xuICAgIHJlcXVlc3Qub25sb2FkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIHdlYkF1ZGlvQ29udGV4dC5kZWNvZGVBdWRpb0RhdGEocmVxdWVzdC5yZXNwb25zZSwgZnVuY3Rpb24oYnVmZmVyKSB7XG4gICAgICAgICAgICBzZWxmLmRhdGEgPSBidWZmZXI7XG4gICAgICAgICAgICBzZWxmLnByb2dyZXNzID0gMTtcbiAgICAgICAgICAgIHNlbGYub25Qcm9ncmVzcy5kaXNwYXRjaCgxKTtcbiAgICAgICAgICAgIHNlbGYub25CZWZvcmVDb21wbGV0ZS5kaXNwYXRjaChidWZmZXIpO1xuICAgICAgICAgICAgc2VsZi5vbkNvbXBsZXRlLmRpc3BhdGNoKGJ1ZmZlcik7XG4gICAgICAgIH0sIGZ1bmN0aW9uKCkge1xuICAgICAgICAgICAgc2VsZi5vbkVycm9yLmRpc3BhdGNoKCk7XG4gICAgICAgIH0pO1xuICAgIH07XG4gICAgcmVxdWVzdC5vbmVycm9yID0gZnVuY3Rpb24oZSkge1xuICAgICAgICBzZWxmLm9uRXJyb3IuZGlzcGF0Y2goZSk7XG4gICAgfTtcbiAgICByZXF1ZXN0LnNlbmQoKTtcbiAgICB0aGlzLnJlcXVlc3QgPSByZXF1ZXN0O1xufTtcblxuTG9hZGVyLkZpbGUucHJvdG90eXBlLmxvYWRBdWRpb0VsZW1lbnQgPSBmdW5jdGlvbih0b3VjaExvY2tlZCkge1xuICAgIHZhciByZXF1ZXN0ID0gbmV3IEF1ZGlvKCk7XG4gICAgdGhpcy5kYXRhID0gcmVxdWVzdDtcbiAgICByZXF1ZXN0Lm5hbWUgPSB0aGlzLnVybDtcbiAgICByZXF1ZXN0LnByZWxvYWQgPSAnYXV0byc7XG4gICAgdmFyIHNlbGYgPSB0aGlzO1xuICAgIHJlcXVlc3Quc3JjID0gdGhpcy51cmw7XG4gICAgaWYgKCEhdG91Y2hMb2NrZWQpIHtcbiAgICAgICAgdGhpcy5vblByb2dyZXNzLmRpc3BhdGNoKDEpO1xuICAgICAgICB0aGlzLm9uQ29tcGxldGUuZGlzcGF0Y2godGhpcy5kYXRhKTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHZhciByZWFkeSA9IGZ1bmN0aW9uKCl7XG4gICAgICAgICAgICByZXF1ZXN0LnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2NhbnBsYXl0aHJvdWdoJywgcmVhZHkpO1xuICAgICAgICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgICAgICAgc2VsZi5wcm9ncmVzcyA9IDE7XG4gICAgICAgICAgICBzZWxmLm9uUHJvZ3Jlc3MuZGlzcGF0Y2goMSk7XG4gICAgICAgICAgICBzZWxmLm9uQmVmb3JlQ29tcGxldGUuZGlzcGF0Y2goc2VsZi5kYXRhKTtcbiAgICAgICAgICAgIHNlbGYub25Db21wbGV0ZS5kaXNwYXRjaChzZWxmLmRhdGEpO1xuICAgICAgICB9O1xuICAgICAgICAvLyB0aW1lb3V0IGJlY2F1c2Ugc29tZXRpbWVzIGNhbnBsYXl0aHJvdWdoIGRvZXNuJ3QgZmlyZVxuICAgICAgICB2YXIgdGltZW91dCA9IHNldFRpbWVvdXQocmVhZHksIDIwMDApO1xuICAgICAgICByZXF1ZXN0LmFkZEV2ZW50TGlzdGVuZXIoJ2NhbnBsYXl0aHJvdWdoJywgcmVhZHksIGZhbHNlKTtcbiAgICAgICAgcmVxdWVzdC5vbmVycm9yID0gZnVuY3Rpb24oKSB7XG4gICAgICAgICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICAgICAgICBzZWxmLm9uRXJyb3IuZGlzcGF0Y2goKTtcbiAgICAgICAgfTtcbiAgICAgICAgcmVxdWVzdC5sb2FkKCk7XG4gICAgfVxufTtcblxuTG9hZGVyLkZpbGUucHJvdG90eXBlLmNhbmNlbCA9IGZ1bmN0aW9uKCkge1xuICBpZih0aGlzLnJlcXVlc3QgJiYgdGhpcy5yZXF1ZXN0LnJlYWR5U3RhdGUgIT09IDQpIHtcbiAgICAgIHRoaXMucmVxdWVzdC5hYm9ydCgpO1xuICB9XG59O1xuXG5tb2R1bGUuZXhwb3J0cyA9IExvYWRlcjtcbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIEFuYWx5c2VyID0gcmVxdWlyZSgnLi9ub2RlL2FuYWx5c2VyLmpzJyksXG4gICAgRGlzdG9ydGlvbiA9IHJlcXVpcmUoJy4vbm9kZS9kaXN0b3J0aW9uLmpzJyksXG4gICAgRWNobyA9IHJlcXVpcmUoJy4vbm9kZS9lY2hvLmpzJyksXG4gICAgRmlsdGVyID0gcmVxdWlyZSgnLi9ub2RlL2ZpbHRlci5qcycpLFxuICAgIFBhbm5lciA9IHJlcXVpcmUoJy4vbm9kZS9wYW5uZXIuanMnKSxcbiAgICBSZXZlcmIgPSByZXF1aXJlKCcuL25vZGUvcmV2ZXJiLmpzJyk7XG5cbmZ1bmN0aW9uIE5vZGVNYW5hZ2VyKGNvbnRleHQpIHtcbiAgICB0aGlzLl9jb250ZXh0ID0gY29udGV4dCB8fCB0aGlzLmNyZWF0ZUZha2VDb250ZXh0KCk7XG4gICAgdGhpcy5fZGVzdGluYXRpb24gPSBudWxsO1xuICAgIHRoaXMuX25vZGVMaXN0ID0gW107XG4gICAgdGhpcy5fc291cmNlTm9kZSA9IG51bGw7XG59XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5hZGQgPSBmdW5jdGlvbihub2RlKSB7XG4gICAgY29uc29sZS5sb2coJ05vZGVNYW5hZ2VyLmFkZDonLCBub2RlKTtcbiAgICB0aGlzLl9ub2RlTGlzdC5wdXNoKG5vZGUpO1xuICAgIHRoaXMuX3VwZGF0ZUNvbm5lY3Rpb25zKCk7XG4gICAgcmV0dXJuIG5vZGU7XG59O1xuXG5Ob2RlTWFuYWdlci5wcm90b3R5cGUucmVtb3ZlID0gZnVuY3Rpb24obm9kZSkge1xuICAgIHZhciBsID0gdGhpcy5fbm9kZUxpc3QubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGlmKG5vZGUgPT09IHRoaXMuX25vZGVMaXN0W2ldKSB7XG4gICAgICAgICAgICB0aGlzLl9ub2RlTGlzdC5zcGxpY2UoaSwgMSk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgbm9kZS5kaXNjb25uZWN0KCk7XG4gICAgdGhpcy5fdXBkYXRlQ29ubmVjdGlvbnMoKTtcbiAgICByZXR1cm4gbm9kZTtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5yZW1vdmVBbGwgPSBmdW5jdGlvbigpIHtcbiAgICB3aGlsZSh0aGlzLl9ub2RlTGlzdC5sZW5ndGgpIHtcbiAgICAgICAgdGhpcy5fbm9kZUxpc3QucG9wKCkuZGlzY29ubmVjdCgpO1xuICAgIH1cbiAgICB0aGlzLl91cGRhdGVDb25uZWN0aW9ucygpO1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuTm9kZU1hbmFnZXIucHJvdG90eXBlLl9jb25uZWN0VG8gPSBmdW5jdGlvbihub2RlKSB7XG4gICAgdmFyIGwgPSB0aGlzLl9ub2RlTGlzdC5sZW5ndGg7XG4gICAgaWYobCA+IDApIHtcbiAgICAgICAgdmFyIG4gPSB0aGlzLl9ub2RlTGlzdFtsIC0gMV07XG4gICAgICAgIGNvbnNvbGUubG9nKCdjb25uZWN0OicsIG4sICd0bycsIG5vZGUpO1xuICAgICAgICBuLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgbi5jb25uZWN0KG5vZGUpO1xuICAgICAgICBpZih0eXBlb2Ygbi5jb25uZWN0ZWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgICAgIG4uY29ubmVjdGVkKCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgZWxzZSBpZih0aGlzLl9zb3VyY2VOb2RlKSB7XG4gICAgICAgIC8vY29uc29sZS5sb2coJyB4IGNvbm5lY3Qgc291cmNlIHRvIG5vZGU6Jywgbm9kZSk7XG4gICAgICAgIHRoaXMuX3NvdXJjZU5vZGUuZGlzY29ubmVjdCgpO1xuICAgICAgICB0aGlzLl9zb3VyY2VOb2RlLmNvbm5lY3Qobm9kZSk7XG4gICAgfVxuICAgIHRoaXMuX2Rlc3RpbmF0aW9uID0gbm9kZTtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5fdXBkYXRlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgICBpZighdGhpcy5fc291cmNlTm9kZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIC8vY29uc29sZS5sb2coJ191cGRhdGVDb25uZWN0aW9ucycpO1xuICAgIHZhciBsID0gdGhpcy5fbm9kZUxpc3QubGVuZ3RoLFxuICAgICAgICBuO1xuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIG4gPSB0aGlzLl9ub2RlTGlzdFtpXTtcbiAgICAgICAgaWYoaSA9PT0gMCkge1xuICAgICAgICAgICAgY29uc29sZS5sb2coJyAtIGNvbm5lY3Qgc291cmNlIHRvIG5vZGU6Jywgbik7XG4gICAgICAgICAgICB0aGlzLl9zb3VyY2VOb2RlLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgICAgIHRoaXMuX3NvdXJjZU5vZGUuY29ubmVjdChuLm5vZGUgfHwgbik7XG4gICAgICAgIH1cbiAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICB2YXIgcHJldiA9IHRoaXMuX25vZGVMaXN0W2ktMV07XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnY29ubmVjdDonLCBwcmV2LCAndG8nLCBuKTtcbiAgICAgICAgICAgIHByZXYuZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgcHJldi5jb25uZWN0KG4ubm9kZSB8fCBuKTtcbiAgICAgICAgICAgIGlmKHR5cGVvZiBwcmV2LmNvbm5lY3RlZCA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICAgICAgICAgIHByZXYuY29ubmVjdGVkKCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy9jb25zb2xlLmxvZyh0aGlzLl9kZXN0aW5hdGlvbilcbiAgICBpZih0aGlzLl9kZXN0aW5hdGlvbikge1xuICAgICAgICB0aGlzLl9jb25uZWN0VG8odGhpcy5fZGVzdGluYXRpb24pO1xuICAgIH1cbiAgICAvKmVsc2Uge1xuICAgICAgICB0aGlzLl9jb25uZWN0VG8odGhpcy5fZ2Fpbik7XG4gICAgfSovXG59O1xuXG4vLyBvciBzZXR0ZXIgZm9yIGRlc3RpbmF0aW9uP1xuLypOb2RlTWFuYWdlci5wcm90b3R5cGUuX2Nvbm5lY3RUbyA9IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICB2YXIgbCA9IHRoaXMuX25vZGVMaXN0Lmxlbmd0aDtcbiAgICBpZihsID4gMCkge1xuICAgICAgY29uc29sZS5sb2coJ2Nvbm5lY3Q6JywgdGhpcy5fbm9kZUxpc3RbbCAtIDFdLCAndG8nLCBub2RlKTtcbiAgICAgICAgdGhpcy5fbm9kZUxpc3RbbCAtIDFdLmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgdGhpcy5fbm9kZUxpc3RbbCAtIDFdLmNvbm5lY3Qobm9kZSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICBjb25zb2xlLmxvZygnIHggY29ubmVjdCBzb3VyY2UgdG8gbm9kZTonLCBub2RlKTtcbiAgICAgICAgdGhpcy5fZ2Fpbi5kaXNjb25uZWN0KCk7XG4gICAgICAgIHRoaXMuX2dhaW4uY29ubmVjdChub2RlKTtcbiAgICB9XG4gICAgdGhpcy5fZGVzdGluYXRpb24gPSBub2RlO1xufTsqL1xuXG4vLyBzaG91bGQgc291cmNlIGJlIGl0ZW0gMCBpbiBub2RlbGlzdCBhbmQgZGVzaW5hdGlvbiBsYXN0XG4vLyBwcm9iIGlzIGFkZE5vZGUgbmVlZHMgdG8gYWRkIGJlZm9yZSBkZXN0aW5hdGlvblxuLy8gKyBzaG91bGQgaXQgYmUgY2FsbGVkIGNoYWluIG9yIHNvbWV0aGluZyBuaWNlcj9cbi8vIGZlZWxzIGxpa2Ugbm9kZSBsaXN0IGNvdWxkIGJlIGEgbGlua2VkIGxpc3Q/P1xuLy8gaWYgbGlzdC5sYXN0IGlzIGRlc3RpbmF0aW9uIGFkZGJlZm9yZVxuXG4vKk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5fdXBkYXRlQ29ubmVjdGlvbnMgPSBmdW5jdGlvbigpIHtcbiAgICBpZighdGhpcy5fc291cmNlTm9kZSkge1xuICAgICAgICByZXR1cm47XG4gICAgfVxuICAgIHZhciBsID0gdGhpcy5fbm9kZUxpc3QubGVuZ3RoO1xuICAgIGZvciAodmFyIGkgPSAxOyBpIDwgbDsgaSsrKSB7XG4gICAgICB0aGlzLl9ub2RlTGlzdFtpLTFdLmNvbm5lY3QodGhpcy5fbm9kZUxpc3RbaV0pO1xuICAgIH1cbn07Ki9cbi8qTm9kZU1hbmFnZXIucHJvdG90eXBlLl91cGRhdGVDb25uZWN0aW9ucyA9IGZ1bmN0aW9uKCkge1xuICAgIGlmKCF0aGlzLl9zb3VyY2VOb2RlKSB7XG4gICAgICAgIHJldHVybjtcbiAgICB9XG4gICAgY29uc29sZS5sb2coJ191cGRhdGVDb25uZWN0aW9ucycpO1xuICAgIHRoaXMuX3NvdXJjZU5vZGUuZGlzY29ubmVjdCgpO1xuICAgIHRoaXMuX3NvdXJjZU5vZGUuY29ubmVjdCh0aGlzLl9nYWluKTtcbiAgICB2YXIgbCA9IHRoaXMuX25vZGVMaXN0Lmxlbmd0aDtcblxuICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgIGlmKGkgPT09IDApIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCcgLSBjb25uZWN0IHNvdXJjZSB0byBub2RlOicsIHRoaXMuX25vZGVMaXN0W2ldKTtcbiAgICAgICAgICAgIHRoaXMuX2dhaW4uZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgdGhpcy5fZ2Fpbi5jb25uZWN0KHRoaXMuX25vZGVMaXN0W2ldKTtcbiAgICAgICAgfVxuICAgICAgICBlbHNlIHtcbiAgICAgICAgICAgIGNvbnNvbGUubG9nKCdjb25uZWN0OicsIHRoaXMuX25vZGVMaXN0W2ktMV0sICd0bycsIHRoaXMuX25vZGVMaXN0W2ldKTtcbiAgICAgICAgICAgIHRoaXMuX25vZGVMaXN0W2ktMV0uZGlzY29ubmVjdCgpO1xuICAgICAgICAgICAgdGhpcy5fbm9kZUxpc3RbaS0xXS5jb25uZWN0KHRoaXMuX25vZGVMaXN0W2ldKTtcbiAgICAgICAgfVxuICAgIH1cbiAgICB0aGlzLl9jb25uZWN0VG8odGhpcy5fY29udGV4dC5kZXN0aW5hdGlvbik7XG59OyovXG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5hbmFseXNlciA9IGZ1bmN0aW9uKGZmdFNpemUsIHNtb290aGluZywgbWluRGVjaWJlbHMsIG1heERlY2liZWxzKSB7XG4gICAgdmFyIGFuYWx5c2VyID0gbmV3IEFuYWx5c2VyKHRoaXMuX2NvbnRleHQsIGZmdFNpemUsIHNtb290aGluZywgbWluRGVjaWJlbHMsIG1heERlY2liZWxzKTtcbiAgICByZXR1cm4gdGhpcy5hZGQoYW5hbHlzZXIpO1xufTtcblxuTm9kZU1hbmFnZXIucHJvdG90eXBlLmNvbXByZXNzb3IgPSBmdW5jdGlvbigpIHtcbiAgICAvLyBsb3dlcnMgdGhlIHZvbHVtZSBvZiB0aGUgbG91ZGVzdCBwYXJ0cyBvZiB0aGUgc2lnbmFsIGFuZCByYWlzZXMgdGhlIHZvbHVtZSBvZiB0aGUgc29mdGVzdCBwYXJ0c1xuICAgIHZhciBub2RlID0gdGhpcy5fY29udGV4dC5jcmVhdGVEeW5hbWljc0NvbXByZXNzb3IoKTtcbiAgICAvLyBtaW4gZGVjaWJlbHMgdG8gc3RhcnQgY29tcHJlc3NpbmcgYXQgZnJvbSAtMTAwIHRvIDBcbiAgICBub2RlLnRocmVzaG9sZC52YWx1ZSA9IC0yNDtcbiAgICAvLyBkZWNpYmVsIHZhbHVlIHRvIHN0YXJ0IGN1cnZlIHRvIGNvbXByZXNzZWQgdmFsdWUgZnJvbSAwIHRvIDQwXG4gICAgbm9kZS5rbmVlLnZhbHVlID0gMzA7XG4gICAgLy8gYW1vdW50IG9mIGNoYW5nZSBwZXIgZGVjaWJlbCBmcm9tIDEgdG8gMjBcbiAgICBub2RlLnJhdGlvLnZhbHVlID0gMTI7XG4gICAgLy8gZ2FpbiByZWR1Y3Rpb24gY3VycmVudGx5IGFwcGxpZWQgYnkgY29tcHJlc3NvciBmcm9tIC0yMCB0byAwXG4gICAgLy8gbm9kZS5yZWR1Y3Rpb24udmFsdWVcbiAgICAvLyBzZWNvbmRzIHRvIHJlZHVjZSBnYWluIGJ5IDEwZGIgZnJvbSAwIHRvIDEgLSBob3cgcXVpY2tseSBzaWduYWwgYWRhcHRlZCB3aGVuIHZvbHVtZSBpbmNyZWFzZWRcbiAgICBub2RlLmF0dGFjay52YWx1ZSA9IDAuMDAwMztcbiAgICAvLyBzZWNvbmRzIHRvIGluY3JlYXNlIGdhaW4gYnkgMTBkYiBmcm9tIDAgdG8gMSAtIGhvdyBxdWlja2x5IHNpZ25hbCBhZGFwdGVkIHdoZW4gdm9sdW1lIHJlZGN1Y2VkXG4gICAgbm9kZS5yZWxlYXNlLnZhbHVlID0gMC4yNTtcbiAgICByZXR1cm4gdGhpcy5hZGQobm9kZSk7XG59O1xuXG5Ob2RlTWFuYWdlci5wcm90b3R5cGUuY29udm9sdmVyID0gZnVuY3Rpb24oaW1wdWxzZVJlc3BvbnNlKSB7XG4gICAgLy8gaW1wdWxzZVJlc3BvbnNlIGlzIGFuIGF1ZGlvIGZpbGUgYnVmZmVyXG4gICAgdmFyIG5vZGUgPSB0aGlzLl9jb250ZXh0LmNyZWF0ZUNvbnZvbHZlcigpO1xuICAgIG5vZGUuYnVmZmVyID0gaW1wdWxzZVJlc3BvbnNlO1xuICAgIHJldHVybiB0aGlzLmFkZChub2RlKTtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5kZWxheSA9IGZ1bmN0aW9uKHRpbWUpIHtcbiAgICB2YXIgbm9kZSA9IHRoaXMuX2NvbnRleHQuY3JlYXRlRGVsYXkoKTtcbiAgICBpZih0aW1lICE9PSB1bmRlZmluZWQpIHsgbm9kZS5kZWxheVRpbWUudmFsdWUgPSB0aW1lOyB9XG4gICAgcmV0dXJuIHRoaXMuYWRkKG5vZGUpO1xufTtcblxuTm9kZU1hbmFnZXIucHJvdG90eXBlLmVjaG8gPSBmdW5jdGlvbih0aW1lLCBnYWluKSB7XG4gICAgdmFyIGVjaG8gPSBuZXcgRWNobyh0aGlzLl9jb250ZXh0LCB0aW1lLCBnYWluKTtcbiAgICB0aGlzLmFkZChlY2hvKTtcbiAgICByZXR1cm4gZWNobztcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5kaXN0b3J0aW9uID0gZnVuY3Rpb24oYW1vdW50KSB7XG4gICAgdmFyIG5vZGUgPSBuZXcgRGlzdG9ydGlvbih0aGlzLl9jb250ZXh0LCBhbW91bnQpO1xuICAgIC8vIEZsb2F0MzJBcnJheSBkZWZpbmluZyBjdXJ2ZSAodmFsdWVzIGFyZSBpbnRlcnBvbGF0ZWQpXG4gICAgLy9ub2RlLmN1cnZlXG4gICAgLy8gdXAtc2FtcGxlIGJlZm9yZSBhcHBseWluZyBjdXJ2ZSBmb3IgYmV0dGVyIHJlc29sdXRpb24gcmVzdWx0ICdub25lJywgJzJ4JyBvciAnNHgnXG4gICAgLy9ub2RlLm92ZXJzYW1wbGUgPSAnMngnO1xuICAgIHJldHVybiB0aGlzLmFkZChub2RlKTtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5maWx0ZXIgPSBmdW5jdGlvbih0eXBlLCBmcmVxdWVuY3ksIHF1YWxpdHksIGdhaW4pIHtcbiAgICB2YXIgZmlsdGVyID0gbmV3IEZpbHRlcih0aGlzLl9jb250ZXh0LCB0eXBlLCBmcmVxdWVuY3ksIHF1YWxpdHksIGdhaW4pO1xuICAgIHJldHVybiB0aGlzLmFkZChmaWx0ZXIpO1xufTtcblxuTm9kZU1hbmFnZXIucHJvdG90eXBlLmxvd3Bhc3MgPSBmdW5jdGlvbihmcmVxdWVuY3ksIHF1YWxpdHksIGdhaW4pIHtcbiAgICByZXR1cm4gdGhpcy5maWx0ZXIoJ2xvd3Bhc3MnLCBmcmVxdWVuY3ksIHF1YWxpdHksIGdhaW4pO1xufTtcblxuTm9kZU1hbmFnZXIucHJvdG90eXBlLmhpZ2hwYXNzID0gZnVuY3Rpb24oZnJlcXVlbmN5LCBxdWFsaXR5LCBnYWluKSB7XG4gICAgcmV0dXJuIHRoaXMuZmlsdGVyKCdoaWdocGFzcycsIGZyZXF1ZW5jeSwgcXVhbGl0eSwgZ2Fpbik7XG59O1xuXG5Ob2RlTWFuYWdlci5wcm90b3R5cGUuYmFuZHBhc3MgPSBmdW5jdGlvbihmcmVxdWVuY3ksIHF1YWxpdHksIGdhaW4pIHtcbiAgICByZXR1cm4gdGhpcy5maWx0ZXIoJ2JhbmRwYXNzJywgZnJlcXVlbmN5LCBxdWFsaXR5LCBnYWluKTtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5sb3dzaGVsZiA9IGZ1bmN0aW9uKGZyZXF1ZW5jeSwgcXVhbGl0eSwgZ2Fpbikge1xuICAgIHJldHVybiB0aGlzLmZpbHRlcignbG93c2hlbGYnLCBmcmVxdWVuY3ksIHF1YWxpdHksIGdhaW4pO1xufTtcblxuTm9kZU1hbmFnZXIucHJvdG90eXBlLmhpZ2hzaGVsZiA9IGZ1bmN0aW9uKGZyZXF1ZW5jeSwgcXVhbGl0eSwgZ2Fpbikge1xuICAgIHJldHVybiB0aGlzLmZpbHRlcignaGlnaHNoZWxmJywgZnJlcXVlbmN5LCBxdWFsaXR5LCBnYWluKTtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5wZWFraW5nID0gZnVuY3Rpb24oZnJlcXVlbmN5LCBxdWFsaXR5LCBnYWluKSB7XG4gICAgcmV0dXJuIHRoaXMuZmlsdGVyKCdwZWFraW5nJywgZnJlcXVlbmN5LCBxdWFsaXR5LCBnYWluKTtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5ub3RjaCA9IGZ1bmN0aW9uKGZyZXF1ZW5jeSwgcXVhbGl0eSwgZ2Fpbikge1xuICAgIHJldHVybiB0aGlzLmZpbHRlcignbm90Y2gnLCBmcmVxdWVuY3ksIHF1YWxpdHksIGdhaW4pO1xufTtcblxuTm9kZU1hbmFnZXIucHJvdG90eXBlLmFsbHBhc3MgPSBmdW5jdGlvbihmcmVxdWVuY3ksIHF1YWxpdHksIGdhaW4pIHtcbiAgICByZXR1cm4gdGhpcy5maWx0ZXIoJ2FsbHBhc3MnLCBmcmVxdWVuY3ksIHF1YWxpdHksIGdhaW4pO1xufTtcblxuTm9kZU1hbmFnZXIucHJvdG90eXBlLmdhaW4gPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIHZhciBub2RlID0gdGhpcy5fY29udGV4dC5jcmVhdGVHYWluKCk7XG4gICAgaWYodmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBub2RlLmdhaW4udmFsdWUgPSB2YWx1ZTtcbiAgICB9XG4gICAgcmV0dXJuIG5vZGU7XG59O1xuXG5Ob2RlTWFuYWdlci5wcm90b3R5cGUucGFubmVyID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIHBhbm5lciA9IG5ldyBQYW5uZXIodGhpcy5fY29udGV4dCk7XG4gICAgdGhpcy5hZGQocGFubmVyKTtcbiAgICByZXR1cm4gcGFubmVyO1xufTtcblxuTm9kZU1hbmFnZXIucHJvdG90eXBlLnJldmVyYiA9IGZ1bmN0aW9uKHNlY29uZHMsIGRlY2F5LCByZXZlcnNlKSB7XG4gICAgdmFyIHJldmVyYiA9IG5ldyBSZXZlcmIodGhpcy5fY29udGV4dCwgc2Vjb25kcywgZGVjYXksIHJldmVyc2UpO1xuICAgIHRoaXMuYWRkKHJldmVyYik7XG4gICAgcmV0dXJuIHJldmVyYjtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5zY3JpcHRQcm9jZXNzb3IgPSBmdW5jdGlvbihidWZmZXJTaXplLCBpbnB1dENoYW5uZWxzLCBvdXRwdXRDaGFubmVscywgY2FsbGJhY2ssIHRoaXNBcmcpIHtcbiAgICAvLyBidWZmZXJTaXplIDI1NiAtIDE2Mzg0IChwb3cgMilcbiAgICBidWZmZXJTaXplID0gYnVmZmVyU2l6ZSB8fCAxMDI0O1xuICAgIGlucHV0Q2hhbm5lbHMgPSBpbnB1dENoYW5uZWxzID09PSB1bmRlZmluZWQgPyAwIDogaW5wdXRDaGFubmVscztcbiAgICBvdXRwdXRDaGFubmVscyA9IG91dHB1dENoYW5uZWxzID09PSB1bmRlZmluZWQgPyAxIDogb3V0cHV0Q2hhbm5lbHM7XG4gICAgdmFyIG5vZGUgPSB0aGlzLl9jb250ZXh0LmNyZWF0ZVNjcmlwdFByb2Nlc3NvcihidWZmZXJTaXplLCBpbnB1dENoYW5uZWxzLCBvdXRwdXRDaGFubmVscyk7XG4gICAgLy9ub2RlLm9uYXVkaW9wcm9jZXNzID0gY2FsbGJhY2suYmluZChjYWxsYmFja0NvbnRleHR8fCBub2RlKTtcbiAgICBub2RlLm9uYXVkaW9wcm9jZXNzID0gZnVuY3Rpb24gKGV2ZW50KSB7XG4gICAgICAgIC8vIGF2YWlsYWJsZSBwcm9wczpcbiAgICAgICAgLypcbiAgICAgICAgZXZlbnQuaW5wdXRCdWZmZXJcbiAgICAgICAgZXZlbnQub3V0cHV0QnVmZmVyXG4gICAgICAgIGV2ZW50LnBsYXliYWNrVGltZVxuICAgICAgICAqL1xuICAgICAgICAvLyBFeGFtcGxlOiBnZW5lcmF0ZSBub2lzZVxuICAgICAgICAvKlxuICAgICAgICB2YXIgb3V0cHV0ID0gZXZlbnQub3V0cHV0QnVmZmVyLmdldENoYW5uZWxEYXRhKDApO1xuICAgICAgICB2YXIgbCA9IG91dHB1dC5sZW5ndGg7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbDsgaSsrKSB7XG4gICAgICAgICAgICBvdXRwdXRbaV0gPSBNYXRoLnJhbmRvbSgpO1xuICAgICAgICB9XG4gICAgICAgICovXG4gICAgICAgIGNhbGxiYWNrLmNhbGwodGhpc0FyZyB8fCB0aGlzLCBldmVudCk7XG4gICAgfTtcbiAgICByZXR1cm4gdGhpcy5hZGQobm9kZSk7XG59O1xuXG5Ob2RlTWFuYWdlci5wcm90b3R5cGUuY3JlYXRlRmFrZUNvbnRleHQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgZm4gPSBmdW5jdGlvbigpe307XG4gICAgdmFyIHBhcmFtID0ge1xuICAgICAgICB2YWx1ZTogMSxcbiAgICAgICAgZGVmYXVsdFZhbHVlOiAxLFxuICAgICAgICBsaW5lYXJSYW1wVG9WYWx1ZUF0VGltZTogZm4sXG4gICAgICAgIHNldFZhbHVlQXRUaW1lOiBmbixcbiAgICAgICAgZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZTogZm4sXG4gICAgICAgIHNldFRhcmdldEF0VGltZTogZm4sXG4gICAgICAgIHNldFZhbHVlQ3VydmVBdFRpbWU6IGZuLFxuICAgICAgICBjYW5jZWxTY2hlZHVsZWRWYWx1ZXM6IGZuXG4gICAgfTtcbiAgICB2YXIgZmFrZU5vZGUgPSB7XG4gICAgICAgIGNvbm5lY3Q6Zm4sXG4gICAgICAgIGRpc2Nvbm5lY3Q6Zm4sXG4gICAgICAgIC8vIGdhaW5cbiAgICAgICAgZ2Fpbjp7dmFsdWU6IDF9LFxuICAgICAgICAvLyBwYW5uZXJcbiAgICAgICAgcGFubmluZ01vZGVsOiAwLFxuICAgICAgICBzZXRQb3NpdGlvbjogZm4sXG4gICAgICAgIHNldE9yaWVudGF0aW9uOiBmbixcbiAgICAgICAgc2V0VmVsb2NpdHk6IGZuLFxuICAgICAgICBkaXN0YW5jZU1vZGVsOiAwLFxuICAgICAgICByZWZEaXN0YW5jZTogMCxcbiAgICAgICAgbWF4RGlzdGFuY2U6IDAsXG4gICAgICAgIHJvbGxvZmZGYWN0b3I6IDAsXG4gICAgICAgIGNvbmVJbm5lckFuZ2xlOiAzNjAsXG4gICAgICAgIGNvbmVPdXRlckFuZ2xlOiAzNjAsXG4gICAgICAgIGNvbmVPdXRlckdhaW46IDAsXG4gICAgICAgIC8vIGZpbHRlcjpcbiAgICAgICAgdHlwZTowLFxuICAgICAgICBmcmVxdWVuY3k6IHBhcmFtLFxuICAgICAgICAvLyBkZWxheVxuICAgICAgICBkZWxheVRpbWU6IHBhcmFtLFxuICAgICAgICAvLyBjb252b2x2ZXJcbiAgICAgICAgYnVmZmVyOiAwLFxuICAgICAgICAvLyBhbmFseXNlclxuICAgICAgICBzbW9vdGhpbmdUaW1lQ29uc3RhbnQ6IDAsXG4gICAgICAgIGZmdFNpemU6IDAsXG4gICAgICAgIG1pbkRlY2liZWxzOiAwLFxuICAgICAgICBtYXhEZWNpYmVsczogMCxcbiAgICAgICAgLy8gY29tcHJlc3NvclxuICAgICAgICB0aHJlc2hvbGQ6IHBhcmFtLFxuICAgICAgICBrbmVlOiBwYXJhbSxcbiAgICAgICAgcmF0aW86IHBhcmFtLFxuICAgICAgICBhdHRhY2s6IHBhcmFtLFxuICAgICAgICByZWxlYXNlOiBwYXJhbSxcbiAgICAgICAgLy8gZGlzdG9ydGlvblxuICAgICAgICBvdmVyc2FtcGxlOiAwLFxuICAgICAgICBjdXJ2ZTogMCxcbiAgICAgICAgLy8gYnVmZmVyXG4gICAgICAgIHNhbXBsZVJhdGU6IDEsXG4gICAgICAgIGxlbmd0aDogMCxcbiAgICAgICAgZHVyYXRpb246IDAsXG4gICAgICAgIG51bWJlck9mQ2hhbm5lbHM6IDAsXG4gICAgICAgIGdldENoYW5uZWxEYXRhOiBmdW5jdGlvbigpIHsgcmV0dXJuIFtdOyB9LFxuICAgICAgICBjb3B5RnJvbUNoYW5uZWw6IGZuLFxuICAgICAgICBjb3B5VG9DaGFubmVsOiBmblxuICAgIH07XG4gICAgdmFyIHJldHVybkZha2VOb2RlID0gZnVuY3Rpb24oKXsgcmV0dXJuIGZha2VOb2RlOyB9O1xuICAgIHJldHVybiB7XG4gICAgICAgIGNyZWF0ZUFuYWx5c2VyOiByZXR1cm5GYWtlTm9kZSxcbiAgICAgICAgY3JlYXRlQnVmZmVyOiByZXR1cm5GYWtlTm9kZSxcbiAgICAgICAgY3JlYXRlQmlxdWFkRmlsdGVyOiByZXR1cm5GYWtlTm9kZSxcbiAgICAgICAgY3JlYXRlRHluYW1pY3NDb21wcmVzc29yOiByZXR1cm5GYWtlTm9kZSxcbiAgICAgICAgY3JlYXRlQ29udm9sdmVyOiByZXR1cm5GYWtlTm9kZSxcbiAgICAgICAgY3JlYXRlRGVsYXk6IHJldHVybkZha2VOb2RlLFxuICAgICAgICBjcmVhdGVHYWluOiBmdW5jdGlvbigpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgICAgZ2Fpbjoge1xuICAgICAgICAgICAgICAgICAgICB2YWx1ZTogMSxcbiAgICAgICAgICAgICAgICAgICAgZGVmYXVsdFZhbHVlOiAxLFxuICAgICAgICAgICAgICAgICAgICBsaW5lYXJSYW1wVG9WYWx1ZUF0VGltZTogZm4sXG4gICAgICAgICAgICAgICAgICAgIHNldFZhbHVlQXRUaW1lOiBmbixcbiAgICAgICAgICAgICAgICAgICAgZXhwb25lbnRpYWxSYW1wVG9WYWx1ZUF0VGltZTogZm4sXG4gICAgICAgICAgICAgICAgICAgIHNldFRhcmdldEF0VGltZTogZm4sXG4gICAgICAgICAgICAgICAgICAgIHNldFZhbHVlQ3VydmVBdFRpbWU6IGZuLFxuICAgICAgICAgICAgICAgICAgICBjYW5jZWxTY2hlZHVsZWRWYWx1ZXM6IGZuXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBjb25uZWN0OmZuLFxuICAgICAgICAgICAgICAgIGRpc2Nvbm5lY3Q6Zm5cbiAgICAgICAgICAgIH07XG4gICAgICAgIH0sXG4gICAgICAgIGNyZWF0ZVBhbm5lcjogcmV0dXJuRmFrZU5vZGUsXG4gICAgICAgIGNyZWF0ZVNjcmlwdFByb2Nlc3NvcjogcmV0dXJuRmFrZU5vZGUsXG4gICAgICAgIGNyZWF0ZVdhdmVTaGFwZXI6IHJldHVybkZha2VOb2RlXG4gICAgfTtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5zZXRTb3VyY2UgPSBmdW5jdGlvbihub2RlKSB7XG4gICAgdGhpcy5fc291cmNlTm9kZSA9IG5vZGU7XG4gICAgdGhpcy5fdXBkYXRlQ29ubmVjdGlvbnMoKTtcbiAgICByZXR1cm4gbm9kZTtcbn07XG5cbk5vZGVNYW5hZ2VyLnByb3RvdHlwZS5zZXREZXN0aW5hdGlvbiA9IGZ1bmN0aW9uKG5vZGUpIHtcbiAgICB0aGlzLl9jb25uZWN0VG8obm9kZSk7XG4gICAgcmV0dXJuIG5vZGU7XG59O1xuXG5cbi8qXG5mdW5jdGlvbiBFY2hvTm9kZShjb250ZXh0LCBkZWxheVRpbWUsIGZlZWRiYWNrVm9sdW1lKXtcbiAgdGhpcy5kZWxheVRpbWUudmFsdWUgPSBkZWxheVRpbWU7XG4gIHRoaXMuZ2Fpbk5vZGUgPSBjb250ZXh0LmNyZWF0ZUdhaW5Ob2RlKCk7XG4gIHRoaXMuZ2Fpbk5vZGUuZ2Fpbi52YWx1ZSA9IGZlZWRiYWNrVm9sdW1lO1xuICB0aGlzLmNvbm5lY3QodGhpcy5nYWluTm9kZSk7XG4gIHRoaXMuZ2Fpbk5vZGUuY29ubmVjdCh0aGlzKTtcbn1cblxuZnVuY3Rpb24gY3JlYXRlRWNobyhjb250ZXh0LCBkZWxheVRpbWUsIGZlZWRiYWNrKXtcbiAgdmFyIGRlbGF5ID0gY29udGV4dC5jcmVhdGVEZWxheU5vZGUoZGVsYXlUaW1lICsgMSk7XG4gIEZlZWRiYWNrRGVsYXlOb2RlLmNhbGwoZGVsYXksIGNvbnRleHQsIGRlbGF5VGltZSwgZmVlZGJhY2spO1xuICByZXR1cm4gZGVsYXk7XG59XG4qL1xuXG4vL2h0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMTM3MDI3MzMvY3JlYXRpbmctYS1jdXN0b20tZWNoby1ub2RlLXdpdGgtd2ViLWF1ZGlvXG4vL2h0dHA6Ly9zdGFja292ZXJmbG93LmNvbS9xdWVzdGlvbnMvMTk4OTU0NDIvaW1wbGVtZW50aW5nLWEtamF2YXNjcmlwdC1hdWRpb25vZGVcblxuLypcbiAqIEV4cG9ydHNcbiAqL1xuXG5pZiAodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IE5vZGVNYW5hZ2VyO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBBbmFseXNlcihjb250ZXh0LCBmZnRTaXplLCBzbW9vdGhpbmcsIG1pbkRlY2liZWxzLCBtYXhEZWNpYmVscykge1xuICAgIHZhciBub2RlID0gY29udGV4dC5jcmVhdGVBbmFseXNlcigpO1xuICAgIG5vZGUuZmZ0U2l6ZSA9IGZmdFNpemU7IC8vIGZyZXF1ZW5jeUJpbkNvdW50IHdpbGwgYmUgaGFsZiB0aGlzIHZhbHVlXG5cbiAgICBpZihzbW9vdGhpbmcgIT09IHVuZGVmaW5lZCkgeyBub2RlLnNtb290aGluZ1RpbWVDb25zdGFudCA9IHNtb290aGluZzsgfVxuICAgIGlmKG1pbkRlY2liZWxzICE9PSB1bmRlZmluZWQpIHsgbm9kZS5taW5EZWNpYmVscyA9IG1pbkRlY2liZWxzOyB9XG4gICAgaWYobWF4RGVjaWJlbHMgIT09IHVuZGVmaW5lZCkgeyBub2RlLm1heERlY2liZWxzID0gbWF4RGVjaWJlbHM7IH1cblxuICAgIHZhciBtZXRob2QgPSBmdW5jdGlvbigpIHtcbiAgICAgICAgXG4gICAgfTtcblxuICAgIC8vIHB1YmxpYyBtZXRob2RzXG4gICAgdmFyIGV4cG9ydHMgPSB7XG4gICAgICAgIG5vZGU6IG5vZGUsXG4gICAgICAgIG1ldGhvZDogbWV0aG9kLFxuICAgICAgICAvLyBtYXAgbmF0aXZlIG1ldGhvZHMgb2YgQW5hbHlzZXJOb2RlXG4gICAgICAgIGdldEJ5dGVGcmVxdWVuY3lEYXRhOiBub2RlLmdldEJ5dGVGcmVxdWVuY3lEYXRhLmJpbmQobm9kZSksXG4gICAgICAgIGdldEJ5dGVUaW1lRG9tYWluRGF0YTogbm9kZS5nZXRCeXRlVGltZURvbWFpbkRhdGEuYmluZChub2RlKSxcbiAgICAgICAgLy8gbWFwIG5hdGl2ZSBtZXRob2RzIG9mIEF1ZGlvTm9kZVxuICAgICAgICBjb25uZWN0OiBub2RlLmNvbm5lY3QuYmluZChub2RlKSxcbiAgICAgICAgZGlzY29ubmVjdDogbm9kZS5kaXNjb25uZWN0LmJpbmQobm9kZSlcbiAgICB9O1xuXG4gICAgLy8gbWFwIG5hdGl2ZSBwcm9wZXJ0aWVzIG9mIEFuYWx5c2VyTm9kZVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKGV4cG9ydHMsIHtcbiAgICAgICAgJ2ZmdFNpemUnOiB7XG4gICAgICAgICAgICAvLyAzMiB0byAyMDQ4IChtdXN0IGJlIHBvdyAyKVxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG5vZGUuZmZ0U2l6ZTsgfSxcbiAgICAgICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHsgbm9kZS5mZnRTaXplID0gdmFsdWU7IH1cbiAgICAgICAgfSxcbiAgICAgICAgJ3Ntb290aGluZyc6IHtcbiAgICAgICAgICAgIC8vIDAgdG8gMVxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG5vZGUuc21vb3RoaW5nVGltZUNvbnN0YW50OyB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkgeyBub2RlLnNtb290aGluZ1RpbWVDb25zdGFudCA9IHZhbHVlOyB9XG4gICAgICAgIH0sXG4gICAgICAgICdtaW5EZWNpYmVscyc6IHtcbiAgICAgICAgICAgIC8vIDAgdG8gMVxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG5vZGUubWluRGVjaWJlbHM7IH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7IG5vZGUubWluRGVjaWJlbHMgPSB2YWx1ZTsgfVxuICAgICAgICB9LFxuICAgICAgICAnbWF4RGVjaWJlbHMnOiB7XG4gICAgICAgICAgICAvLyAwIHRvIDEgKG1ha2VzIHRoZSB0cmFuc2l0aW9uIGJldHdlZW4gdmFsdWVzIG92ZXIgdGltZSBzbW9vdGhlcilcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLm1heERlY2liZWxzOyB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkgeyBub2RlLm1heERlY2liZWxzID0gdmFsdWU7IH1cbiAgICAgICAgfSxcbiAgICAgICAgJ2ZyZXF1ZW5jeUJpbkNvdW50Jzoge1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG5vZGUuZnJlcXVlbmN5QmluQ291bnQ7IH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUoZXhwb3J0cyk7XG59XG5cbi8qXG4gKiBFeHBvcnRzXG4gKi9cblxuaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBBbmFseXNlcjtcbn1cblxuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKmZ1bmN0aW9uIERpc3RvcnRpb24oY29udGV4dCwgZGVsYXlUaW1lLCBnYWluVmFsdWUpIHtcbiAgICB2YXIgZGVsYXkgPSBjb250ZXh0LmNyZWF0ZURlbGF5KCk7XG4gICAgdmFyIGdhaW4gPSBjb250ZXh0LmNyZWF0ZUdhaW4oKTtcblxuICAgIGdhaW4uZ2Fpbi52YWx1ZSA9IGdhaW5WYWx1ZSB8fCAwLjU7XG4gICAgaWYoZGVsYXlUaW1lICE9PSB1bmRlZmluZWQpIHsgZGVsYXkuZGVsYXlUaW1lLnZhbHVlID0gZGVsYXlUaW1lOyB9XG5cblxuICAgIHZhciBjb25uZWN0ID0gZnVuY3Rpb24obm9kZSkge1xuICAgICAgICBkaXNjb25uZWN0KCk7XG4gICAgICAgIGRlbGF5LmNvbm5lY3QoZ2Fpbik7XG4gICAgICAgIGdhaW4uY29ubmVjdChkZWxheSk7XG4gICAgICAgIGRlbGF5LmNvbm5lY3Qobm9kZSk7XG4gICAgfTtcblxuICAgIHZhciBkaXNjb25uZWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlbGF5LmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgZ2Fpbi5kaXNjb25uZWN0KCk7XG4gICAgfTtcblxuICAgIC8vIHB1YmxpYyBtZXRob2RzXG4gICAgdmFyIGV4cG9ydHMgPSB7XG4gICAgICAgIG5vZGU6IGRlbGF5LFxuICAgICAgICAvLyBtYXAgbmF0aXZlIG1ldGhvZHMgb2YgRGlzdG9ydGlvbk5vZGVcbiAgICAgICAgXG4gICAgICAgIC8vIG1hcCBuYXRpdmUgbWV0aG9kcyBvZiBBdWRpb05vZGVcbiAgICAgICAgY29ubmVjdDogY29ubmVjdCxcbiAgICAgICAgZGlzY29ubmVjdDogZGlzY29ubmVjdFxuICAgIH07XG5cbiAgICAvLyBtYXAgbmF0aXZlIHByb3BlcnRpZXMgb2YgRGlzdG9ydGlvbk5vZGVcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhleHBvcnRzLCB7XG4gICAgICAgICdkZWxheVRpbWUnOiB7XG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gZGVsYXkuZGVsYXlUaW1lLnZhbHVlOyB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkgeyBkZWxheS5kZWxheVRpbWUudmFsdWUgPSB2YWx1ZTsgfVxuICAgICAgICB9LFxuICAgICAgICAnZ2FpblZhbHVlJzoge1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIGdhaW4uZ2Fpbi52YWx1ZTsgfSxcbiAgICAgICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHsgZ2Fpbi5nYWluLnZhbHVlID0gdmFsdWU7IH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUoZXhwb3J0cyk7XG59Ki9cblxuZnVuY3Rpb24gRGlzdG9ydGlvbihjb250ZXh0LCBhbW91bnQpIHtcbiAgICB2YXIgbm9kZSA9IGNvbnRleHQuY3JlYXRlV2F2ZVNoYXBlcigpO1xuXG4gICAgLy8gY3JlYXRlIHdhdmVTaGFwZXIgZGlzdG9ydGlvbiBjdXJ2ZSBmcm9tIDAgdG8gMVxuICAgIG5vZGUudXBkYXRlID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgYW1vdW50ID0gdmFsdWU7XG4gICAgICAgIHZhciBrID0gdmFsdWUgKiAxMDAsXG4gICAgICAgICAgICBuID0gMjIwNTAsXG4gICAgICAgICAgICBjdXJ2ZSA9IG5ldyBGbG9hdDMyQXJyYXkobiksXG4gICAgICAgICAgICBkZWcgPSBNYXRoLlBJIC8gMTgwO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbjsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgeCA9IGkgKiAyIC8gbiAtIDE7XG4gICAgICAgICAgICBjdXJ2ZVtpXSA9ICgzICsgaykgKiB4ICogMjAgKiBkZWcgLyAoTWF0aC5QSSArIGsgKiBNYXRoLmFicyh4KSk7XG4gICAgICAgIH1cblxuICAgICAgICB0aGlzLmN1cnZlID0gY3VydmU7XG4gICAgfTtcblxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKG5vZGUsIHtcbiAgICAgICAgJ2Ftb3VudCc6IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBhbW91bnQ7IH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7IFxuICAgICAgICAgICAgICAgIGNvbnNvbGUubG9nKCdoaScpO1xuICAgICAgICAgICAgICAgIHRoaXMudXBkYXRlKHZhbHVlKTsgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICBpZihhbW91bnQgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICBub2RlLnVwZGF0ZShhbW91bnQpO1xuICAgIH1cblxuICAgIHJldHVybiBub2RlO1xufVxuXG4vKlxuICogRXhwb3J0c1xuICovXG5cbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gRGlzdG9ydGlvbjtcbn1cblxuIiwiJ3VzZSBzdHJpY3QnO1xuXG4vKmZ1bmN0aW9uIEVjaG8oY29udGV4dCwgZGVsYXlUaW1lLCBnYWluVmFsdWUpIHtcbiAgICB2YXIgZGVsYXkgPSBjb250ZXh0LmNyZWF0ZURlbGF5KCk7XG4gICAgdmFyIGdhaW4gPSBjb250ZXh0LmNyZWF0ZUdhaW4oKTtcblxuICAgIGdhaW4uZ2Fpbi52YWx1ZSA9IGdhaW5WYWx1ZSB8fCAwLjU7XG4gICAgaWYoZGVsYXlUaW1lICE9PSB1bmRlZmluZWQpIHsgZGVsYXkuZGVsYXlUaW1lLnZhbHVlID0gZGVsYXlUaW1lOyB9XG5cblxuICAgIHZhciBjb25uZWN0ID0gZnVuY3Rpb24obm9kZSkge1xuICAgICAgICBkaXNjb25uZWN0KCk7XG4gICAgICAgIGRlbGF5LmNvbm5lY3QoZ2Fpbik7XG4gICAgICAgIGdhaW4uY29ubmVjdChkZWxheSk7XG4gICAgICAgIGRlbGF5LmNvbm5lY3Qobm9kZSk7XG4gICAgfTtcblxuICAgIHZhciBkaXNjb25uZWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlbGF5LmRpc2Nvbm5lY3QoKTtcbiAgICAgICAgZ2Fpbi5kaXNjb25uZWN0KCk7XG4gICAgfTtcblxuICAgIC8vIHB1YmxpYyBtZXRob2RzXG4gICAgdmFyIGV4cG9ydHMgPSB7XG4gICAgICAgIG5vZGU6IGRlbGF5LFxuICAgICAgICAvLyBtYXAgbmF0aXZlIG1ldGhvZHMgb2YgRWNob05vZGVcbiAgICAgICAgXG4gICAgICAgIC8vIG1hcCBuYXRpdmUgbWV0aG9kcyBvZiBBdWRpb05vZGVcbiAgICAgICAgY29ubmVjdDogY29ubmVjdCxcbiAgICAgICAgZGlzY29ubmVjdDogZGlzY29ubmVjdFxuICAgIH07XG5cbiAgICAvLyBtYXAgbmF0aXZlIHByb3BlcnRpZXMgb2YgRWNob05vZGVcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhleHBvcnRzLCB7XG4gICAgICAgICdkZWxheVRpbWUnOiB7XG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gZGVsYXkuZGVsYXlUaW1lLnZhbHVlOyB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkgeyBkZWxheS5kZWxheVRpbWUudmFsdWUgPSB2YWx1ZTsgfVxuICAgICAgICB9LFxuICAgICAgICAnZ2FpblZhbHVlJzoge1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIGdhaW4uZ2Fpbi52YWx1ZTsgfSxcbiAgICAgICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHsgZ2Fpbi5nYWluLnZhbHVlID0gdmFsdWU7IH1cbiAgICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIE9iamVjdC5mcmVlemUoZXhwb3J0cyk7XG59Ki9cblxuLypcbiAqIFRoaXMgd2F5IGlzIG1vcmUgY29uY2lzZSBidXQgcmVxdWlyZXMgJ2Nvbm5lY3RlZCcgdG8gYmUgY2FsbGVkIGluIG5vZGUgbWFuYWdlclxuICovXG5cbmZ1bmN0aW9uIEVjaG8oY29udGV4dCwgZGVsYXlUaW1lLCBnYWluVmFsdWUpIHtcbiAgICB2YXIgZGVsYXkgPSBjb250ZXh0LmNyZWF0ZURlbGF5KCk7XG4gICAgdmFyIGdhaW4gPSBjb250ZXh0LmNyZWF0ZUdhaW4oKTtcblxuICAgIGdhaW4uZ2Fpbi52YWx1ZSA9IGdhaW5WYWx1ZSB8fCAwLjU7XG4gICAgaWYoZGVsYXlUaW1lICE9PSB1bmRlZmluZWQpIHsgZGVsYXkuZGVsYXlUaW1lLnZhbHVlID0gZGVsYXlUaW1lOyB9XG5cbiAgICAvL2RlbGF5LmNvbm5lY3QoZ2Fpbik7XG4gICAgLy9nYWluLmNvbm5lY3QoZGVsYXkpO1xuXG4gICAgZGVsYXkuY29ubmVjdGVkID0gZnVuY3Rpb24oKSB7XG4gICAgICAgIGRlbGF5LmNvbm5lY3QoZ2Fpbik7XG4gICAgICAgIGdhaW4uY29ubmVjdChkZWxheSk7XG4gICAgfTtcblxuICAgIHJldHVybiBkZWxheTtcbn1cblxuLypcbiAqIEV4cG9ydHNcbiAqL1xuXG5pZiAodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEVjaG87XG59XG5cbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gRmlsdGVyKGNvbnRleHQsIHR5cGUsIGZyZXF1ZW5jeSwgcXVhbGl0eSwgZ2Fpbikge1xuICAgIC8vIEZyZXF1ZW5jeSBiZXR3ZWVuIDQwSHogYW5kIGhhbGYgb2YgdGhlIHNhbXBsaW5nIHJhdGVcbiAgICB2YXIgbWluRnJlcXVlbmN5ID0gNDA7XG4gICAgdmFyIG1heEZyZXF1ZW5jeSA9IGNvbnRleHQuc2FtcGxlUmF0ZSAvIDI7XG5cbiAgICBjb25zb2xlLmxvZygnbWF4RnJlcXVlbmN5OicsIG1heEZyZXF1ZW5jeSk7XG5cbiAgICB2YXIgbm9kZSA9IGNvbnRleHQuY3JlYXRlQmlxdWFkRmlsdGVyKCk7XG4gICAgbm9kZS50eXBlID0gdHlwZTtcblxuICAgIGlmKGZyZXF1ZW5jeSAhPT0gdW5kZWZpbmVkKSB7IG5vZGUuZnJlcXVlbmN5LnZhbHVlID0gZnJlcXVlbmN5OyB9XG4gICAgaWYocXVhbGl0eSAhPT0gdW5kZWZpbmVkKSB7IG5vZGUuUS52YWx1ZSA9IHF1YWxpdHk7IH1cbiAgICBpZihnYWluICE9PSB1bmRlZmluZWQpIHsgbm9kZS5nYWluLnZhbHVlID0gZ2FpbjsgfVxuXG5cbiAgICB2YXIgZ2V0RnJlcXVlbmN5ID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgLy8gTG9nYXJpdGhtIChiYXNlIDIpIHRvIGNvbXB1dGUgaG93IG1hbnkgb2N0YXZlcyBmYWxsIGluIHRoZSByYW5nZS5cbiAgICAgICAgdmFyIG51bWJlck9mT2N0YXZlcyA9IE1hdGgubG9nKG1heEZyZXF1ZW5jeSAvIG1pbkZyZXF1ZW5jeSkgLyBNYXRoLkxOMjtcbiAgICAgICAgLy8gQ29tcHV0ZSBhIG11bHRpcGxpZXIgZnJvbSAwIHRvIDEgYmFzZWQgb24gYW4gZXhwb25lbnRpYWwgc2NhbGUuXG4gICAgICAgIHZhciBtdWx0aXBsaWVyID0gTWF0aC5wb3coMiwgbnVtYmVyT2ZPY3RhdmVzICogKHZhbHVlIC0gMS4wKSk7XG4gICAgICAgIC8vIEdldCBiYWNrIHRvIHRoZSBmcmVxdWVuY3kgdmFsdWUgYmV0d2VlbiBtaW4gYW5kIG1heC5cbiAgICAgICAgcmV0dXJuIG1heEZyZXF1ZW5jeSAqIG11bHRpcGxpZXI7XG4gICAgfTtcblxuICAgIHZhciBzZXRCeVBlcmNlbnQgPSBmdW5jdGlvbihwZXJjZW50LCBxdWFsaXR5LCBnYWluKSB7XG4gICAgICAgIC8vIHNldCBmaWx0ZXIgZnJlcXVlbmN5IGJhc2VkIG9uIHZhbHVlIGZyb20gMCB0byAxXG4gICAgICAgIG5vZGUuZnJlcXVlbmN5LnZhbHVlID0gZ2V0RnJlcXVlbmN5KHBlcmNlbnQpO1xuICAgICAgICBpZihxdWFsaXR5ICE9PSB1bmRlZmluZWQpIHsgbm9kZS5RLnZhbHVlID0gcXVhbGl0eTsgfVxuICAgICAgICBpZihnYWluICE9PSB1bmRlZmluZWQpIHsgbm9kZS5nYWluLnZhbHVlID0gZ2FpbjsgfVxuICAgIH07XG5cbiAgICAvLyBwdWJsaWMgbWV0aG9kc1xuICAgIHZhciBleHBvcnRzID0ge1xuICAgICAgICBub2RlOiBub2RlLFxuICAgICAgICBzZXRCeVBlcmNlbnQ6IHNldEJ5UGVyY2VudCxcbiAgICAgICAgLy8gbWFwIG5hdGl2ZSBtZXRob2RzIG9mIEJpcXVhZEZpbHRlck5vZGVcbiAgICAgICAgZ2V0RnJlcXVlbmN5UmVzcG9uc2U6IG5vZGUuZ2V0RnJlcXVlbmN5UmVzcG9uc2UsXG4gICAgICAgIHNldE9yaWVudGF0aW9uOiBub2RlLnNldE9yaWVudGF0aW9uLFxuICAgICAgICBjb25lT3V0ZXJHYWluOiBub2RlLmNvbmVPdXRlckdhaW4sXG4gICAgICAgIC8vIG1hcCBuYXRpdmUgbWV0aG9kcyBvZiBBdWRpb05vZGVcbiAgICAgICAgY29ubmVjdDogbm9kZS5jb25uZWN0LFxuICAgICAgICBkaXNjb25uZWN0OiBub2RlLmRpc2Nvbm5lY3RcbiAgICB9O1xuXG4gICAgLy8gbWFwIG5hdGl2ZSBwcm9wZXJ0aWVzIG9mIEJpcXVhZEZpbHRlck5vZGVcbiAgICBPYmplY3QuZGVmaW5lUHJvcGVydGllcyhleHBvcnRzLCB7XG4gICAgICAgICd0eXBlJzoge1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG5vZGUudHlwZTsgfSxcbiAgICAgICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHsgbm9kZS50eXBlID0gdmFsdWU7IH1cbiAgICAgICAgfSxcbiAgICAgICAgJ2ZyZXF1ZW5jeSc6IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLmZyZXF1ZW5jeS52YWx1ZTsgfSxcbiAgICAgICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHsgbm9kZS5mcmVxdWVuY3kudmFsdWUgPSB2YWx1ZTsgfVxuICAgICAgICB9LFxuICAgICAgICAnZGV0dW5lJzoge1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG5vZGUuZGV0dW5lLnZhbHVlOyB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkgeyBub2RlLmRldHVuZS52YWx1ZSA9IHZhbHVlOyB9XG4gICAgICAgIH0sXG4gICAgICAgICdxdWFsaXR5Jzoge1xuICAgICAgICAgICAgLy8gMC4wMDAxIHRvIDEwMDBcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLlEudmFsdWU7IH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7IG5vZGUuUS52YWx1ZSA9IHZhbHVlOyB9XG4gICAgICAgIH0sXG4gICAgICAgICdnYWluJzoge1xuICAgICAgICAgICAgLy8gLTQwIHRvIDQwXG4gICAgICAgICAgICBnZXQ6IGZ1bmN0aW9uKCkgeyByZXR1cm4gbm9kZS5nYWluLnZhbHVlOyB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkgeyBub2RlLmdhaW4udmFsdWUgPSB2YWx1ZTsgfVxuICAgICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gT2JqZWN0LmZyZWV6ZShleHBvcnRzKTtcbn1cblxuLypcbiAqIEV4cG9ydHNcbiAqL1xuXG5pZiAodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IEZpbHRlcjtcbn1cblxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBQYW5uZXIoY29udGV4dCkge1xuICAgIHZhciBub2RlID0gY29udGV4dC5jcmVhdGVQYW5uZXIoKTtcbiAgICAvLyBEZWZhdWx0IGZvciBzdGVyZW8gaXMgSFJURlxuICAgIG5vZGUucGFubmluZ01vZGVsID0gJ0hSVEYnOyAvLyAnZXF1YWxwb3dlcidcblxuICAgIC8vIERpc3RhbmNlIG1vZGVsIGFuZCBhdHRyaWJ1dGVzXG4gICAgbm9kZS5kaXN0YW5jZU1vZGVsID0gJ2xpbmVhcic7IC8vICdsaW5lYXInICdpbnZlcnNlJyAnZXhwb25lbnRpYWwnXG4gICAgbm9kZS5yZWZEaXN0YW5jZSA9IDE7XG4gICAgbm9kZS5tYXhEaXN0YW5jZSA9IDEwMDA7XG4gICAgbm9kZS5yb2xsb2ZmRmFjdG9yID0gMTtcbiAgICBub2RlLmNvbmVJbm5lckFuZ2xlID0gMzYwO1xuICAgIG5vZGUuY29uZU91dGVyQW5nbGUgPSAwO1xuICAgIG5vZGUuY29uZU91dGVyR2FpbiA9IDA7XG4gICAgXG4gICAgLy8gc2ltcGxlIHZlYzMgb2JqZWN0IHBvb2xcbiAgICB2YXIgVmVjUG9vbCA9IHtcbiAgICAgICAgcG9vbDogW10sXG4gICAgICAgIGdldDogZnVuY3Rpb24oeCwgeSwgeikge1xuICAgICAgICAgICAgdmFyIHYgPSB0aGlzLnBvb2wubGVuZ3RoID8gdGhpcy5wb29sLnBvcCgpIDogeyB4OiAwLCB5OiAwLCB6OiAwIH07XG4gICAgICAgICAgICAvLyBjaGVjayBpZiBhIHZlY3RvciBoYXMgYmVlbiBwYXNzZWQgaW5cbiAgICAgICAgICAgIGlmKHggIT09IHVuZGVmaW5lZCAmJiBpc05hTih4KSAmJiAneCcgaW4geCAmJiAneScgaW4geCAmJiAneicgaW4geCkge1xuICAgICAgICAgICAgICAgIHYueCA9IHgueCB8fCAwO1xuICAgICAgICAgICAgICAgIHYueSA9IHgueSB8fCAwO1xuICAgICAgICAgICAgICAgIHYueiA9IHgueiB8fCAwO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgdi54ID0geCB8fCAwO1xuICAgICAgICAgICAgICAgIHYueSA9IHkgfHwgMDtcbiAgICAgICAgICAgICAgICB2LnogPSB6IHx8IDA7ICAgIFxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIHY7XG4gICAgICAgIH0sXG4gICAgICAgIGRpc3Bvc2U6IGZ1bmN0aW9uKGluc3RhbmNlKSB7XG4gICAgICAgICAgICB0aGlzLnBvb2wucHVzaChpbnN0YW5jZSk7XG4gICAgICAgIH1cbiAgICB9O1xuXG4gICAgdmFyIGdsb2JhbFVwID0gVmVjUG9vbC5nZXQoMCwgMSwgMCk7XG5cbiAgICB2YXIgc2V0T3JpZW50YXRpb24gPSBmdW5jdGlvbihub2RlLCBmdykge1xuICAgICAgICAvLyBzZXQgdGhlIG9yaWVudGF0aW9uIG9mIHRoZSBzb3VyY2UgKHdoZXJlIHRoZSBhdWRpbyBpcyBjb21pbmcgZnJvbSlcblxuICAgICAgICAvLyBjYWxjdWxhdGUgdXAgdmVjICggdXAgPSAoZm9yd2FyZCBjcm9zcyAoMCwgMSwgMCkpIGNyb3NzIGZvcndhcmQgKVxuICAgICAgICB2YXIgdXAgPSBWZWNQb29sLmdldChmdy54LCBmdy55LCBmdy56KTtcbiAgICAgICAgY3Jvc3ModXAsIGdsb2JhbFVwKTtcbiAgICAgICAgY3Jvc3ModXAsIGZ3KTtcbiAgICAgICAgbm9ybWFsaXplKHVwKTtcbiAgICAgICAgbm9ybWFsaXplKGZ3KTtcblxuICAgICAgICAvLyBzZXQgdGhlIGF1ZGlvIGNvbnRleHQncyBsaXN0ZW5lciBwb3NpdGlvbiB0byBtYXRjaCB0aGUgY2FtZXJhIHBvc2l0aW9uXG4gICAgICAgIG5vZGUuc2V0T3JpZW50YXRpb24oZncueCwgZncueSwgZncueiwgdXAueCwgdXAueSwgdXAueik7XG5cbiAgICAgICAgLy8gcmV0dXJuIHRoZSB2ZWNzIHRvIHRoZSBwb29sXG4gICAgICAgIFZlY1Bvb2wuZGlzcG9zZShmdyk7XG4gICAgICAgIFZlY1Bvb2wuZGlzcG9zZSh1cCk7XG4gICAgfTtcblxuICAgIHZhciBzZXRQb3NpdGlvbiA9IGZ1bmN0aW9uKG5vZGUsIHZlYykge1xuICAgICAgICBub2RlLnNldFBvc2l0aW9uKHZlYy54LCB2ZWMueSwgdmVjLnopO1xuICAgICAgICBWZWNQb29sLmRpc3Bvc2UodmVjKTtcbiAgICB9O1xuXG4gICAgdmFyIHNldFZlbG9jaXR5ID0gZnVuY3Rpb24obm9kZSwgdmVjKSB7XG4gICAgICAgIG5vZGUuc2V0VmVsb2NpdHkodmVjLngsIHZlYy55LCB2ZWMueik7XG4gICAgICAgIFZlY1Bvb2wuZGlzcG9zZSh2ZWMpO1xuICAgIH07XG5cbiAgICB2YXIgY2FsY3VsYXRlVmVsb2NpdHkgPSBmdW5jdGlvbihjdXJyZW50UG9zaXRpb24sIGxhc3RQb3NpdGlvbiwgZGVsdGFUaW1lKSB7XG4gICAgICAgIHZhciBkeCA9IGN1cnJlbnRQb3NpdGlvbi54IC0gbGFzdFBvc2l0aW9uLng7XG4gICAgICAgIHZhciBkeSA9IGN1cnJlbnRQb3NpdGlvbi55IC0gbGFzdFBvc2l0aW9uLnk7XG4gICAgICAgIHZhciBkeiA9IGN1cnJlbnRQb3NpdGlvbi56IC0gbGFzdFBvc2l0aW9uLno7XG4gICAgICAgIHJldHVybiBWZWNQb29sLmdldChkeCAvIGRlbHRhVGltZSwgZHkgLyBkZWx0YVRpbWUsIGR6IC8gZGVsdGFUaW1lKTtcbiAgICB9O1xuXG4gICAgLy8gY3Jvc3MgcHJvZHVjdCBvZiAyIHZlY3RvcnNcbiAgICB2YXIgY3Jvc3MgPSBmdW5jdGlvbiAoIGEsIGIgKSB7XG4gICAgICAgIHZhciBheCA9IGEueCwgYXkgPSBhLnksIGF6ID0gYS56O1xuICAgICAgICB2YXIgYnggPSBiLngsIGJ5ID0gYi55LCBieiA9IGIuejtcbiAgICAgICAgYS54ID0gYXkgKiBieiAtIGF6ICogYnk7XG4gICAgICAgIGEueSA9IGF6ICogYnggLSBheCAqIGJ6O1xuICAgICAgICBhLnogPSBheCAqIGJ5IC0gYXkgKiBieDtcbiAgICB9O1xuXG4gICAgLy8gbm9ybWFsaXNlIHRvIHVuaXQgdmVjdG9yXG4gICAgdmFyIG5vcm1hbGl6ZSA9IGZ1bmN0aW9uICh2ZWMzKSB7XG4gICAgICAgIGlmKHZlYzMueCA9PT0gMCAmJiB2ZWMzLnkgPT09IDAgJiYgdmVjMy56ID09PSAwKSB7XG4gICAgICAgICAgICByZXR1cm4gdmVjMztcbiAgICAgICAgfVxuICAgICAgICB2YXIgbGVuZ3RoID0gTWF0aC5zcXJ0KCB2ZWMzLnggKiB2ZWMzLnggKyB2ZWMzLnkgKiB2ZWMzLnkgKyB2ZWMzLnogKiB2ZWMzLnogKTtcbiAgICAgICAgdmFyIGludlNjYWxhciA9IDEgLyBsZW5ndGg7XG4gICAgICAgIHZlYzMueCAqPSBpbnZTY2FsYXI7XG4gICAgICAgIHZlYzMueSAqPSBpbnZTY2FsYXI7XG4gICAgICAgIHZlYzMueiAqPSBpbnZTY2FsYXI7XG4gICAgICAgIHJldHVybiB2ZWMzO1xuICAgIH07XG5cbiAgICAvLyBwYW4gbGVmdCB0byByaWdodCB3aXRoIHZhbHVlIGZyb20gLTEgdG8gMVxuICAgIC8vIGNyZWF0ZXMgYSBuaWNlIGN1cnZlIHdpdGggelxuICAgIHZhciBzZXRYID0gZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgdmFyIGRlZzQ1ID0gTWF0aC5QSSAvIDQsXG4gICAgICAgICAgICBkZWc5MCA9IGRlZzQ1ICogMixcbiAgICAgICAgICAgIHggPSB2YWx1ZSAqIGRlZzQ1LFxuICAgICAgICAgICAgeiA9IHggKyBkZWc5MDtcblxuICAgICAgICBpZiAoeiA+IGRlZzkwKSB7XG4gICAgICAgICAgICB6ID0gTWF0aC5QSSAtIHo7XG4gICAgICAgIH1cblxuICAgICAgICB4ID0gTWF0aC5zaW4oeCk7XG4gICAgICAgIHogPSBNYXRoLnNpbih6KTtcblxuICAgICAgICBub2RlLnNldFBvc2l0aW9uKHgsIDAsIHopO1xuICAgIH07XG5cbiAgICAvLyBzZXQgdGhlIHBvc2l0aW9uIHRoZSBhdWRpbyBpcyBjb21pbmcgZnJvbSlcbiAgICB2YXIgc2V0U291cmNlUG9zaXRpb24gPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gICAgICAgIHNldFBvc2l0aW9uKG5vZGUsIFZlY1Bvb2wuZ2V0KHgsIHksIHopKTtcbiAgICB9O1xuXG4gICAgLy8gc2V0IHRoZSBkaXJlY3Rpb24gdGhlIGF1ZGlvIGlzIGNvbWluZyBmcm9tKVxuICAgIHZhciBzZXRTb3VyY2VPcmllbnRhdGlvbiA9IGZ1bmN0aW9uKHgsIHksIHopIHtcbiAgICAgICAgc2V0T3JpZW50YXRpb24obm9kZSwgVmVjUG9vbC5nZXQoeCwgeSwgeikpO1xuICAgIH07XG5cbiAgICAvLyBzZXQgdGhlIHZlbG9pY3R5IG9mIHRoZSBhdWRpbyBzb3VyY2UgKGlmIG1vdmluZylcbiAgICB2YXIgc2V0U291cmNlVmVsb2NpdHkgPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gICAgICAgIHNldFZlbG9jaXR5KG5vZGUsIFZlY1Bvb2wuZ2V0KHgsIHksIHopKTtcbiAgICB9O1xuXG4gICAgLy8gc2V0IHRoZSBwb3NpdGlvbiBvZiB3aG8gb3Igd2hhdCBpcyBoZWFyaW5nIHRoZSBhdWRpbyAoY291bGQgYmUgY2FtZXJhIG9yIHNvbWUgY2hhcmFjdGVyKVxuICAgIHZhciBzZXRMaXN0ZW5lclBvc2l0aW9uID0gZnVuY3Rpb24oeCwgeSwgeikge1xuICAgICAgICBzZXRQb3NpdGlvbihjb250ZXh0Lmxpc3RlbmVyLCBWZWNQb29sLmdldCh4LCB5LCB6KSk7XG4gICAgfTtcblxuICAgIC8vIHNldCB0aGUgcG9zaXRpb24gb2Ygd2hvIG9yIHdoYXQgaXMgaGVhcmluZyB0aGUgYXVkaW8gKGNvdWxkIGJlIGNhbWVyYSBvciBzb21lIGNoYXJhY3RlcilcbiAgICB2YXIgc2V0TGlzdGVuZXJPcmllbnRhdGlvbiA9IGZ1bmN0aW9uKHgsIHksIHopIHtcbiAgICAgICAgc2V0T3JpZW50YXRpb24oY29udGV4dC5saXN0ZW5lciwgVmVjUG9vbC5nZXQoeCwgeSwgeikpO1xuICAgIH07XG5cbiAgICAvLyBzZXQgdGhlIHZlbG9jaXR5IChpZiBtb3ZpbmcpIG9mIHdobyBvciB3aGF0IGlzIGhlYXJpbmcgdGhlIGF1ZGlvIChjb3VsZCBiZSBjYW1lcmEgb3Igc29tZSBjaGFyYWN0ZXIpXG4gICAgdmFyIHNldExpc3RlbmVyVmVsb2NpdHkgPSBmdW5jdGlvbih4LCB5LCB6KSB7XG4gICAgICAgIHNldFZlbG9jaXR5KGNvbnRleHQubGlzdGVuZXIsIFZlY1Bvb2wuZ2V0KHgsIHksIHopKTtcbiAgICB9O1xuXG4gICAgLy8gcHVibGljIG1ldGhvZHNcbiAgICB2YXIgZXhwb3J0cyA9IHtcbiAgICAgICAgbm9kZTogbm9kZSxcbiAgICAgICAgc2V0WDogc2V0WCxcbiAgICAgICAgc2V0U291cmNlUG9zaXRpb246IHNldFNvdXJjZVBvc2l0aW9uLFxuICAgICAgICBzZXRTb3VyY2VPcmllbnRhdGlvbjogc2V0U291cmNlT3JpZW50YXRpb24sXG4gICAgICAgIHNldFNvdXJjZVZlbG9jaXR5OiBzZXRTb3VyY2VWZWxvY2l0eSxcbiAgICAgICAgc2V0TGlzdGVuZXJQb3NpdGlvbjogc2V0TGlzdGVuZXJQb3NpdGlvbixcbiAgICAgICAgc2V0TGlzdGVuZXJPcmllbnRhdGlvbjogc2V0TGlzdGVuZXJPcmllbnRhdGlvbixcbiAgICAgICAgc2V0TGlzdGVuZXJWZWxvY2l0eTogc2V0TGlzdGVuZXJWZWxvY2l0eSxcbiAgICAgICAgY2FsY3VsYXRlVmVsb2NpdHk6IGNhbGN1bGF0ZVZlbG9jaXR5LFxuICAgICAgICAvLyBtYXAgbmF0aXZlIG1ldGhvZHMgb2YgUGFubmVyTm9kZVxuICAgICAgICBzZXRQb3NpdGlvbjogbm9kZS5zZXRQb3NpdGlvbixcbiAgICAgICAgc2V0T3JpZW50YXRpb246IG5vZGUuc2V0T3JpZW50YXRpb24sXG4gICAgICAgIHNldFZlbG9jaXR5OiBub2RlLnNldFZlbG9jaXR5LFxuICAgICAgICAvLyBtYXAgbmF0aXZlIG1ldGhvZHMgb2YgQXVkaW9Ob2RlXG4gICAgICAgIGNvbm5lY3Q6IG5vZGUuY29ubmVjdC5iaW5kKG5vZGUpLFxuICAgICAgICBkaXNjb25uZWN0OiBub2RlLmRpc2Nvbm5lY3QuYmluZChub2RlKVxuICAgIH07XG5cbiAgICAvLyBtYXAgbmF0aXZlIHByb3BlcnRpZXMgb2YgUGFubmVyTm9kZVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKGV4cG9ydHMsIHtcbiAgICAgICAgJ3Bhbm5pbmdNb2RlbCc6IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLnBhbm5pbmdNb2RlbDsgfSxcbiAgICAgICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHsgbm9kZS5wYW5uaW5nTW9kZWwgPSB2YWx1ZTsgfVxuICAgICAgICB9LFxuICAgICAgICAnZGlzdGFuY2VNb2RlbCc6IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLmRpc3RhbmNlTW9kZWw7IH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7IG5vZGUuZGlzdGFuY2VNb2RlbCA9IHZhbHVlOyB9XG4gICAgICAgIH0sXG4gICAgICAgICdyZWZEaXN0YW5jZSc6IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLnJlZkRpc3RhbmNlOyB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkgeyBub2RlLnJlZkRpc3RhbmNlID0gdmFsdWU7IH1cbiAgICAgICAgfSxcbiAgICAgICAgJ21heERpc3RhbmNlJzoge1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG5vZGUubWF4RGlzdGFuY2U7IH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7IG5vZGUubWF4RGlzdGFuY2UgPSB2YWx1ZTsgfVxuICAgICAgICB9LFxuICAgICAgICAncm9sbG9mZkZhY3Rvcic6IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLnJvbGxvZmZGYWN0b3I7IH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7IG5vZGUucm9sbG9mZkZhY3RvciA9IHZhbHVlOyB9XG4gICAgICAgIH0sXG4gICAgICAgICdjb25lSW5uZXJBbmdsZSc6IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLmNvbmVJbm5lckFuZ2xlOyB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkgeyBub2RlLmNvbmVJbm5lckFuZ2xlID0gdmFsdWU7IH1cbiAgICAgICAgfSxcbiAgICAgICAgJ2NvbmVPdXRlckFuZ2xlJzoge1xuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG5vZGUuY29uZU91dGVyQW5nbGU7IH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7IG5vZGUuY29uZU91dGVyQW5nbGUgPSB2YWx1ZTsgfVxuICAgICAgICB9LFxuICAgICAgICAnY29uZU91dGVyR2Fpbic6IHtcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLmNvbmVPdXRlckdhaW47IH0sXG4gICAgICAgICAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7IG5vZGUuY29uZU91dGVyR2FpbiA9IHZhbHVlOyB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBPYmplY3QuZnJlZXplKGV4cG9ydHMpO1xufVxuXG4vKlxuICogRXhwb3J0c1xuICovXG5cbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gUGFubmVyO1xufVxuXG4iLCIndXNlIHN0cmljdCc7XG5cbi8qZnVuY3Rpb24gUmV2ZXJiKGNvbnRleHQsIHNlY29uZHMsIGRlY2F5LCByZXZlcnNlKSB7XG4gICAgdmFyIG5vZGUgPSBjb250ZXh0LmNyZWF0ZUNvbnZvbHZlcigpO1xuXG4gICAgdmFyIHVwZGF0ZSA9IGZ1bmN0aW9uKHNlY29uZHMsIGRlY2F5LCByZXZlcnNlKSB7XG4gICAgICAgIHNlY29uZHMgPSBzZWNvbmRzIHx8IDE7XG4gICAgICAgIGRlY2F5ID0gZGVjYXkgfHwgNTtcbiAgICAgICAgcmV2ZXJzZSA9ICEhcmV2ZXJzZTtcblxuICAgICAgICB2YXIgbnVtQ2hhbm5lbHMgPSAyLFxuICAgICAgICAgICAgcmF0ZSA9IGNvbnRleHQuc2FtcGxlUmF0ZSxcbiAgICAgICAgICAgIGxlbmd0aCA9IHJhdGUgKiBzZWNvbmRzLFxuICAgICAgICAgICAgaW1wdWxzZVJlc3BvbnNlID0gY29udGV4dC5jcmVhdGVCdWZmZXIobnVtQ2hhbm5lbHMsIGxlbmd0aCwgcmF0ZSksXG4gICAgICAgICAgICBsZWZ0ID0gaW1wdWxzZVJlc3BvbnNlLmdldENoYW5uZWxEYXRhKDApLFxuICAgICAgICAgICAgcmlnaHQgPSBpbXB1bHNlUmVzcG9uc2UuZ2V0Q2hhbm5lbERhdGEoMSksXG4gICAgICAgICAgICBuLCBlO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbGVuZ3RoOyBpKyspIHtcbiAgICAgICAgICAgIG4gPSByZXZlcnNlID8gbGVuZ3RoIC0gMSA6IGk7XG4gICAgICAgICAgICBlID0gTWF0aC5wb3coMSAtIG4gLyBsZW5ndGgsIGRlY2F5KTtcbiAgICAgICAgICAgIGxlZnRbaV0gPSAoTWF0aC5yYW5kb20oKSAqIDIgLSAxKSAqIGU7XG4gICAgICAgICAgICByaWdodFtpXSA9IChNYXRoLnJhbmRvbSgpICogMiAtIDEpICogZTtcbiAgICAgICAgfVxuXG4gICAgICAgIG5vZGUuYnVmZmVyID0gaW1wdWxzZVJlc3BvbnNlO1xuICAgIH07XG5cbiAgICB1cGRhdGUoc2Vjb25kcywgZGVjYXksIHJldmVyc2UpO1xuXG4gICAgLy8gcHVibGljIG1ldGhvZHNcbiAgICB2YXIgZXhwb3J0cyA9IHtcbiAgICAgICAgbm9kZTogbm9kZSxcbiAgICAgICAgdXBkYXRlOiB1cGRhdGUsXG4gICAgICAgIC8vIG1hcCBuYXRpdmUgbWV0aG9kcyBvZiBDb252b2x2ZXJOb2RlXG4gICAgICAgIGNvbm5lY3Q6IG5vZGUuY29ubmVjdC5iaW5kKG5vZGUpLFxuICAgICAgICBkaXNjb25uZWN0OiBub2RlLmRpc2Nvbm5lY3QuYmluZChub2RlKVxuICAgIH07XG5cbiAgICAvLyBtYXAgbmF0aXZlIHByb3BlcnRpZXMgb2YgUmV2ZXJiTm9kZVxuICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0aWVzKGV4cG9ydHMsIHtcbiAgICAgICAgJ2J1ZmZlcic6IHtcbiAgICAgICAgICAgIC8vIHRydWUgb3IgZmFsc2VcbiAgICAgICAgICAgIGdldDogZnVuY3Rpb24oKSB7IHJldHVybiBub2RlLmJ1ZmZlcjsgfSxcbiAgICAgICAgICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHsgbm9kZS5idWZmZXIgPSB2YWx1ZTsgfVxuICAgICAgICB9LFxuICAgICAgICAnbm9ybWFsaXplJzoge1xuICAgICAgICAgICAgLy8gdHJ1ZSBvciBmYWxzZVxuICAgICAgICAgICAgZ2V0OiBmdW5jdGlvbigpIHsgcmV0dXJuIG5vZGUubm9ybWFsaXplOyB9LFxuICAgICAgICAgICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkgeyBub2RlLm5vcm1hbGl6ZSA9IHZhbHVlOyB9XG4gICAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiBPYmplY3QuZnJlZXplKGV4cG9ydHMpO1xufSovXG5cbmZ1bmN0aW9uIFJldmVyYihjb250ZXh0LCBzZWNvbmRzLCBkZWNheSwgcmV2ZXJzZSkge1xuICAgIHZhciBub2RlID0gY29udGV4dC5jcmVhdGVDb252b2x2ZXIoKTtcblxuICAgIG5vZGUudXBkYXRlID0gZnVuY3Rpb24oc2Vjb25kcywgZGVjYXksIHJldmVyc2UpIHtcbiAgICAgICAgc2Vjb25kcyA9IHNlY29uZHMgfHwgMTtcbiAgICAgICAgZGVjYXkgPSBkZWNheSB8fCA1O1xuICAgICAgICByZXZlcnNlID0gISFyZXZlcnNlO1xuXG4gICAgICAgIHZhciBudW1DaGFubmVscyA9IDIsXG4gICAgICAgICAgICByYXRlID0gY29udGV4dC5zYW1wbGVSYXRlLFxuICAgICAgICAgICAgbGVuZ3RoID0gcmF0ZSAqIHNlY29uZHMsXG4gICAgICAgICAgICBpbXB1bHNlUmVzcG9uc2UgPSBjb250ZXh0LmNyZWF0ZUJ1ZmZlcihudW1DaGFubmVscywgbGVuZ3RoLCByYXRlKSxcbiAgICAgICAgICAgIGxlZnQgPSBpbXB1bHNlUmVzcG9uc2UuZ2V0Q2hhbm5lbERhdGEoMCksXG4gICAgICAgICAgICByaWdodCA9IGltcHVsc2VSZXNwb25zZS5nZXRDaGFubmVsRGF0YSgxKSxcbiAgICAgICAgICAgIG4sIGU7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICAgICAgbiA9IHJldmVyc2UgPyBsZW5ndGggLSAxIDogaTtcbiAgICAgICAgICAgIGUgPSBNYXRoLnBvdygxIC0gbiAvIGxlbmd0aCwgZGVjYXkpO1xuICAgICAgICAgICAgbGVmdFtpXSA9IChNYXRoLnJhbmRvbSgpICogMiAtIDEpICogZTtcbiAgICAgICAgICAgIHJpZ2h0W2ldID0gKE1hdGgucmFuZG9tKCkgKiAyIC0gMSkgKiBlO1xuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5idWZmZXIgPSBpbXB1bHNlUmVzcG9uc2U7XG4gICAgfTtcblxuICAgIG5vZGUudXBkYXRlKHNlY29uZHMsIGRlY2F5LCByZXZlcnNlKTtcblxuICAgIHJldHVybiBub2RlO1xufVxuXG4vKlxuICogRXhwb3J0c1xuICovXG5cbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gUmV2ZXJiO1xufVxuXG4iLCIndXNlIHN0cmljdCc7XG5cbnZhciBCdWZmZXJTb3VyY2UgPSByZXF1aXJlKCcuL3NvdXJjZS9idWZmZXItc291cmNlLmpzJyksXG4gICAgTWVkaWFTb3VyY2UgPSByZXF1aXJlKCcuL3NvdXJjZS9tZWRpYS1zb3VyY2UuanMnKSxcbiAgICBNaWNyb3Bob25lU291cmNlID0gcmVxdWlyZSgnLi9zb3VyY2UvbWljcm9waG9uZS1zb3VyY2UuanMnKSxcbiAgICBOb2RlTWFuYWdlciA9IHJlcXVpcmUoJy4vbm9kZS1tYW5hZ2VyLmpzJyksXG4gICAgT3NjaWxsYXRvclNvdXJjZSA9IHJlcXVpcmUoJy4vc291cmNlL29zY2lsbGF0b3Itc291cmNlLmpzJyksXG4gICAgU2NyaXB0U291cmNlID0gcmVxdWlyZSgnLi9zb3VyY2Uvc2NyaXB0LXNvdXJjZS5qcycpLFxuICAgIFV0aWxzID0gcmVxdWlyZSgnLi91dGlscy5qcycpO1xuXG5mdW5jdGlvbiBTb3VuZChjb250ZXh0LCBkYXRhLCBkZXN0aW5hdGlvbikge1xuICAgIHRoaXMuaWQgPSAnJztcbiAgICB0aGlzLl9jb250ZXh0ID0gY29udGV4dDtcbiAgICB0aGlzLl9kYXRhID0gbnVsbDtcbiAgICB0aGlzLl9lbmRlZENhbGxiYWNrID0gbnVsbDtcbiAgICB0aGlzLl9sb29wID0gZmFsc2U7XG4gICAgdGhpcy5fcGF1c2VkQXQgPSAwO1xuICAgIHRoaXMuX3BsYXlXaGVuUmVhZHkgPSBmYWxzZTtcbiAgICB0aGlzLl9zb3VyY2UgPSBudWxsO1xuICAgIHRoaXMuX3N0YXJ0ZWRBdCA9IDA7XG5cbiAgICB0aGlzLl9ub2RlID0gbmV3IE5vZGVNYW5hZ2VyKHRoaXMuX2NvbnRleHQpO1xuICAgIHRoaXMuX2dhaW4gPSB0aGlzLl9ub2RlLmdhaW4oKTtcbiAgICBpZih0aGlzLl9jb250ZXh0KSB7XG4gICAgICAgIHRoaXMuX25vZGUuc2V0RGVzdGluYXRpb24odGhpcy5fZ2Fpbik7XG4gICAgICAgIHRoaXMuX2dhaW4uY29ubmVjdChkZXN0aW5hdGlvbiB8fCB0aGlzLl9jb250ZXh0LmRlc3RpbmF0aW9uKTtcbiAgICB9XG5cbiAgICB0aGlzLnNldERhdGEoZGF0YSk7XG59XG5cblNvdW5kLnByb3RvdHlwZS5zZXREYXRhID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIGlmKCFkYXRhKSB7IHJldHVybiB0aGlzOyB9XG4gICAgdGhpcy5fZGF0YSA9IGRhdGE7IC8vIEF1ZGlvQnVmZmVyLCBNZWRpYUVsZW1lbnQsIGV0Y1xuXG4gICAgaWYoVXRpbHMuaXNBdWRpb0J1ZmZlcihkYXRhKSkge1xuICAgICAgICB0aGlzLl9zb3VyY2UgPSBuZXcgQnVmZmVyU291cmNlKGRhdGEsIHRoaXMuX2NvbnRleHQpO1xuICAgIH1cbiAgICBlbHNlIGlmKFV0aWxzLmlzTWVkaWFFbGVtZW50KGRhdGEpKSB7XG4gICAgICAgIHRoaXMuX3NvdXJjZSA9IG5ldyBNZWRpYVNvdXJjZShkYXRhLCB0aGlzLl9jb250ZXh0KTtcbiAgICB9XG4gICAgZWxzZSBpZihVdGlscy5pc01lZGlhU3RyZWFtKGRhdGEpKSB7XG4gICAgICAgIHRoaXMuX3NvdXJjZSA9IG5ldyBNaWNyb3Bob25lU291cmNlKGRhdGEsIHRoaXMuX2NvbnRleHQpO1xuICAgIH1cbiAgICBlbHNlIGlmKFV0aWxzLmlzT3NjaWxsYXRvclR5cGUoZGF0YSkpIHtcbiAgICAgICAgdGhpcy5fc291cmNlID0gbmV3IE9zY2lsbGF0b3JTb3VyY2UoZGF0YSwgdGhpcy5fY29udGV4dCk7XG4gICAgfVxuICAgIGVsc2UgaWYoVXRpbHMuaXNTY3JpcHRDb25maWcoZGF0YSkpIHtcbiAgICAgICAgdGhpcy5fc291cmNlID0gbmV3IFNjcmlwdFNvdXJjZShkYXRhLCB0aGlzLl9jb250ZXh0KTtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHRocm93IG5ldyBFcnJvcignQ2Fubm90IGRldGVjdCBkYXRhIHR5cGU6ICcgKyBkYXRhKTtcbiAgICB9XG5cbiAgICB0aGlzLl9ub2RlLnNldFNvdXJjZSh0aGlzLl9zb3VyY2Uuc291cmNlTm9kZSk7XG5cbiAgICBpZih0eXBlb2YgdGhpcy5fc291cmNlLm9uRW5kZWQgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5fc291cmNlLm9uRW5kZWQodGhpcy5fZW5kZWRIYW5kbGVyLCB0aGlzKTtcbiAgICB9XG5cbiAgICAvLyBzaG91bGQgdGhpcyB0YWtlIGFjY291bnQgb2YgZGVsYXkgYW5kIG9mZnNldD9cbiAgICBpZih0aGlzLl9wbGF5V2hlblJlYWR5KSB7XG4gICAgICAgIHRoaXMucGxheSgpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcztcbn07XG5cbi8qXG4gKiBDb250cm9sc1xuICovXG5cblNvdW5kLnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24oZGVsYXksIG9mZnNldCkge1xuICAgIGlmKCF0aGlzLl9zb3VyY2UpIHtcbiAgICAgICAgdGhpcy5fcGxheVdoZW5SZWFkeSA9IHRydWU7XG4gICAgICAgIHJldHVybiB0aGlzO1xuICAgIH1cbiAgICB0aGlzLl9ub2RlLnNldFNvdXJjZSh0aGlzLl9zb3VyY2Uuc291cmNlTm9kZSk7XG4gICAgdGhpcy5fc291cmNlLmxvb3AgPSB0aGlzLl9sb29wO1xuXG4gICAgLy8gdXBkYXRlIHZvbHVtZSBuZWVkZWQgZm9yIG5vIHdlYmF1ZGlvXG4gICAgaWYoIXRoaXMuX2NvbnRleHQpIHsgdGhpcy52b2x1bWUgPSB0aGlzLnZvbHVtZTsgfVxuXG4gICAgdGhpcy5fc291cmNlLnBsYXkoZGVsYXksIG9mZnNldCk7XG5cbiAgICByZXR1cm4gdGhpcztcbn07XG5cblNvdW5kLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgIGlmKCF0aGlzLl9zb3VyY2UpIHsgcmV0dXJuIHRoaXM7IH1cbiAgICB0aGlzLl9zb3VyY2UucGF1c2UoKTtcbiAgICByZXR1cm4gdGhpczsgIFxufTtcblxuU291bmQucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgICBpZighdGhpcy5fc291cmNlKSB7IHJldHVybiB0aGlzOyB9XG4gICAgdGhpcy5fc291cmNlLnN0b3AoKTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cblNvdW5kLnByb3RvdHlwZS5zZWVrID0gZnVuY3Rpb24ocGVyY2VudCkge1xuICAgIGlmKCF0aGlzLl9zb3VyY2UpIHsgcmV0dXJuIHRoaXM7IH1cbiAgICB0aGlzLnN0b3AoKTtcbiAgICB0aGlzLnBsYXkoMCwgdGhpcy5fc291cmNlLmR1cmF0aW9uICogcGVyY2VudCk7XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG4vKlxuICogRW5kZWQgaGFuZGxlclxuICovXG5cblNvdW5kLnByb3RvdHlwZS5vbkVuZGVkID0gZnVuY3Rpb24oZm4sIGNvbnRleHQpIHtcbiAgICB0aGlzLl9lbmRlZENhbGxiYWNrID0gZm4gPyBmbi5iaW5kKGNvbnRleHQgfHwgdGhpcykgOiBudWxsO1xuICAgIHJldHVybiB0aGlzO1xufTtcblxuU291bmQucHJvdG90eXBlLl9lbmRlZEhhbmRsZXIgPSBmdW5jdGlvbigpIHtcbiAgICBpZih0eXBlb2YgdGhpcy5fZW5kZWRDYWxsYmFjayA9PT0gJ2Z1bmN0aW9uJykge1xuICAgICAgICB0aGlzLl9lbmRlZENhbGxiYWNrKHRoaXMpO1xuICAgIH1cbn07XG5cbi8qXG4gKiBHZXR0ZXJzICYgU2V0dGVyc1xuICovXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VuZC5wcm90b3R5cGUsICdjb250ZXh0Jywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jb250ZXh0O1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU291bmQucHJvdG90eXBlLCAnY3VycmVudFRpbWUnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NvdXJjZSA/IHRoaXMuX3NvdXJjZS5jdXJyZW50VGltZSA6IDA7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VuZC5wcm90b3R5cGUsICdkYXRhJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9kYXRhO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU291bmQucHJvdG90eXBlLCAnZHVyYXRpb24nLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NvdXJjZSA/IHRoaXMuX3NvdXJjZS5kdXJhdGlvbiA6IDA7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VuZC5wcm90b3R5cGUsICdlbmRlZCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc291cmNlID8gdGhpcy5fc291cmNlLmVuZGVkIDogZmFsc2U7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VuZC5wcm90b3R5cGUsICdnYWluJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9nYWluO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU291bmQucHJvdG90eXBlLCAnbG9vcCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbG9vcDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgdGhpcy5fbG9vcCA9ICEhdmFsdWU7XG4gICAgICAgIGlmKHRoaXMuX3NvdXJjZSkge1xuICAgICAgICAgIHRoaXMuX3NvdXJjZS5sb29wID0gdGhpcy5fbG9vcDtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU291bmQucHJvdG90eXBlLCAnbm9kZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbm9kZTtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvdW5kLnByb3RvdHlwZSwgJ3BhdXNlZCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc291cmNlID8gdGhpcy5fc291cmNlLnBhdXNlZCA6IGZhbHNlO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU291bmQucHJvdG90eXBlLCAncGxheWluZycsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fc291cmNlID8gdGhpcy5fc291cmNlLnBsYXlpbmcgOiBmYWxzZTtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvdW5kLnByb3RvdHlwZSwgJ3Byb2dyZXNzJywge1xuICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiB0aGlzLl9zb3VyY2UgPyB0aGlzLl9zb3VyY2UucHJvZ3Jlc3MgOiAwO1xuICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFNvdW5kLnByb3RvdHlwZSwgJ3ZvbHVtZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZ2Fpbi5nYWluLnZhbHVlO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICBpZihpc05hTih2YWx1ZSkpIHsgcmV0dXJuOyB9XG5cbiAgICAgICAgdGhpcy5fZ2Fpbi5nYWluLnZhbHVlID0gdmFsdWU7XG5cbiAgICAgICAgaWYodGhpcy5fZGF0YSAmJiB0aGlzLl9kYXRhLnZvbHVtZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgICB0aGlzLl9kYXRhLnZvbHVtZSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbi8vIGZvciBvc2NpbGxhdG9yXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTb3VuZC5wcm90b3R5cGUsICdmcmVxdWVuY3knLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3NvdXJjZSA/IHRoaXMuX3NvdXJjZS5mcmVxdWVuY3kgOiAwO1xuICAgIH0sXG4gICAgc2V0OiBmdW5jdGlvbih2YWx1ZSkge1xuICAgICAgICBpZih0aGlzLl9zb3VyY2UpIHtcbiAgICAgICAgICAgIHRoaXMuX3NvdXJjZS5mcmVxdWVuY3kgPSB2YWx1ZTtcbiAgICAgICAgfVxuICAgIH1cbn0pO1xuXG4vKlxuICogRXhwb3J0c1xuICovXG5cbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gU291bmQ7XG59XG4iLCIndXNlIHN0cmljdCc7XG5cbmZ1bmN0aW9uIEJ1ZmZlclNvdXJjZShidWZmZXIsIGNvbnRleHQpIHtcbiAgICB0aGlzLmlkID0gJyc7XG4gICAgdGhpcy5fYnVmZmVyID0gYnVmZmVyOyAvLyBBcnJheUJ1ZmZlclxuICAgIHRoaXMuX2NvbnRleHQgPSBjb250ZXh0O1xuICAgIHRoaXMuX2VuZGVkID0gZmFsc2U7XG4gICAgdGhpcy5fZW5kZWRDYWxsYmFjayA9IG51bGw7XG4gICAgdGhpcy5fbG9vcCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZEF0ID0gMDtcbiAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5fc291cmNlTm9kZSA9IG51bGw7IC8vIEJ1ZmZlclNvdXJjZU5vZGVcbiAgICB0aGlzLl9zdGFydGVkQXQgPSAwO1xufVxuXG4vKlxuICogQ29udHJvbHNcbiAqL1xuXG5CdWZmZXJTb3VyY2UucHJvdG90eXBlLnBsYXkgPSBmdW5jdGlvbihkZWxheSwgb2Zmc2V0KSB7XG4gICAgaWYodGhpcy5fcGxheWluZykgeyByZXR1cm47IH1cbiAgICBpZihkZWxheSA9PT0gdW5kZWZpbmVkKSB7IGRlbGF5ID0gMDsgfVxuICAgIGlmKGRlbGF5ID4gMCkgeyBkZWxheSA9IHRoaXMuX2NvbnRleHQuY3VycmVudFRpbWUgKyBkZWxheTsgfVxuXG4gICAgaWYob2Zmc2V0ID09PSB1bmRlZmluZWQpIHsgb2Zmc2V0ID0gMDsgfVxuICAgIGlmKHRoaXMuX3BhdXNlZEF0ID4gMCkgeyBvZmZzZXQgPSBvZmZzZXQgKyB0aGlzLl9wYXVzZWRBdDsgfVxuXG4gICAgdGhpcy5zb3VyY2VOb2RlLmxvb3AgPSB0aGlzLl9sb29wO1xuICAgIHRoaXMuc291cmNlTm9kZS5vbmVuZGVkID0gdGhpcy5fZW5kZWRIYW5kbGVyLmJpbmQodGhpcyk7XG4gICAgdGhpcy5zb3VyY2VOb2RlLnN0YXJ0KGRlbGF5LCBvZmZzZXQpO1xuXG4gICAgaWYodGhpcy5fcGF1c2VkQXQpIHtcbiAgICAgICAgdGhpcy5fc3RhcnRlZEF0ID0gdGhpcy5fY29udGV4dC5jdXJyZW50VGltZSAtIHRoaXMuX3BhdXNlZEF0O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdGhpcy5fc3RhcnRlZEF0ID0gdGhpcy5fY29udGV4dC5jdXJyZW50VGltZSAtIG9mZnNldDtcbiAgICB9XG5cbiAgICB0aGlzLl9lbmRlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZEF0ID0gMDtcbiAgICB0aGlzLl9wbGF5aW5nID0gdHJ1ZTtcbn07XG5cbkJ1ZmZlclNvdXJjZS5wcm90b3R5cGUucGF1c2UgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgZWxhcHNlZCA9IHRoaXMuX2NvbnRleHQuY3VycmVudFRpbWUgLSB0aGlzLl9zdGFydGVkQXQ7XG4gICAgdGhpcy5zdG9wKCk7XG4gICAgdGhpcy5fcGF1c2VkQXQgPSBlbGFwc2VkO1xuICAgIHRoaXMuX3BsYXlpbmcgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXVzZWQgPSB0cnVlO1xufTtcblxuQnVmZmVyU291cmNlLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24oKSB7XG4gICAgaWYodGhpcy5fc291cmNlTm9kZSkge1xuICAgICAgICB0aGlzLl9zb3VyY2VOb2RlLm9uZW5kZWQgPSBudWxsO1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5fc291cmNlTm9kZS5zdG9wKDApO1xuICAgICAgICB9IGNhdGNoKGUpIHt9XG4gICAgICAgIHRoaXMuX3NvdXJjZU5vZGUgPSBudWxsO1xuICAgIH1cblxuICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZEF0ID0gMDtcbiAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5fc3RhcnRlZEF0ID0gMDtcbn07XG5cbi8qXG4gKiBFbmRlZCBoYW5kbGVyXG4gKi9cblxuQnVmZmVyU291cmNlLnByb3RvdHlwZS5vbkVuZGVkID0gZnVuY3Rpb24oZm4sIGNvbnRleHQpIHtcbiAgICB0aGlzLl9lbmRlZENhbGxiYWNrID0gZm4gPyBmbi5iaW5kKGNvbnRleHQgfHwgdGhpcykgOiBudWxsO1xufTtcblxuQnVmZmVyU291cmNlLnByb3RvdHlwZS5fZW5kZWRIYW5kbGVyID0gZnVuY3Rpb24oKSB7XG4gICAgdGhpcy5zdG9wKCk7XG4gICAgdGhpcy5fZW5kZWQgPSB0cnVlO1xuICAgIGlmKHR5cGVvZiB0aGlzLl9lbmRlZENhbGxiYWNrID09PSAnZnVuY3Rpb24nKSB7XG4gICAgICAgIHRoaXMuX2VuZGVkQ2FsbGJhY2sodGhpcyk7XG4gICAgfVxufTtcblxuLypcbiAqIEdldHRlcnMgJiBTZXR0ZXJzXG4gKi9cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KEJ1ZmZlclNvdXJjZS5wcm90b3R5cGUsICdjdXJyZW50VGltZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZih0aGlzLl9wYXVzZWRBdCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BhdXNlZEF0O1xuICAgICAgICB9XG4gICAgICAgIGlmKHRoaXMuX3N0YXJ0ZWRBdCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvbnRleHQuY3VycmVudFRpbWUgLSB0aGlzLl9zdGFydGVkQXQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShCdWZmZXJTb3VyY2UucHJvdG90eXBlLCAnZHVyYXRpb24nLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2J1ZmZlciA/IHRoaXMuX2J1ZmZlci5kdXJhdGlvbiA6IDA7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShCdWZmZXJTb3VyY2UucHJvdG90eXBlLCAnZW5kZWQnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2VuZGVkO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoQnVmZmVyU291cmNlLnByb3RvdHlwZSwgJ2xvb3AnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2xvb3A7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2xvb3AgPSAhIXZhbHVlO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoQnVmZmVyU291cmNlLnByb3RvdHlwZSwgJ3BhdXNlZCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGF1c2VkO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoQnVmZmVyU291cmNlLnByb3RvdHlwZSwgJ3BsYXlpbmcnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXlpbmc7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShCdWZmZXJTb3VyY2UucHJvdG90eXBlLCAncHJvZ3Jlc3MnLCB7XG4gIGdldDogZnVuY3Rpb24oKSB7XG4gICAgcmV0dXJuIE1hdGgubWluKHRoaXMuY3VycmVudFRpbWUgLyB0aGlzLmR1cmF0aW9uLCAxKTtcbiAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShCdWZmZXJTb3VyY2UucHJvdG90eXBlLCAnc291cmNlTm9kZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZighdGhpcy5fc291cmNlTm9kZSkge1xuICAgICAgICAgICAgdGhpcy5fc291cmNlTm9kZSA9IHRoaXMuX2NvbnRleHQuY3JlYXRlQnVmZmVyU291cmNlKCk7XG4gICAgICAgICAgICB0aGlzLl9zb3VyY2VOb2RlLmJ1ZmZlciA9IHRoaXMuX2J1ZmZlcjtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gdGhpcy5fc291cmNlTm9kZTtcbiAgICB9XG59KTtcblxuXG4vKlxuICogRXhwb3J0c1xuICovXG5cbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gQnVmZmVyU291cmNlO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBNZWRpYVNvdXJjZShlbCwgY29udGV4dCkge1xuICAgIHRoaXMuaWQgPSAnJztcbiAgICB0aGlzLl9jb250ZXh0ID0gY29udGV4dDtcbiAgICB0aGlzLl9lbCA9IGVsOyAvLyBIVE1MTWVkaWFFbGVtZW50XG4gICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9lbmRlZENhbGxiYWNrID0gbnVsbDtcbiAgICB0aGlzLl9lbmRlZEhhbmRsZXJCb3VuZCA9IHRoaXMuX2VuZGVkSGFuZGxlci5iaW5kKHRoaXMpO1xuICAgIHRoaXMuX2xvb3AgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXVzZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5fc291cmNlTm9kZSA9IG51bGw7IC8vIE1lZGlhRWxlbWVudFNvdXJjZU5vZGVcbn1cblxuLypcbiAqIENvbnRyb2xzXG4gKi9cblxuTWVkaWFTb3VyY2UucHJvdG90eXBlLnBsYXkgPSBmdW5jdGlvbihkZWxheSwgb2Zmc2V0KSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2RlbGF5VGltZW91dCk7XG5cbiAgICB0aGlzLnZvbHVtZSA9IHRoaXMuX3ZvbHVtZTtcblxuICAgIGlmKG9mZnNldCkge1xuICAgICAgICB0aGlzLl9lbC5jdXJyZW50VGltZSA9IG9mZnNldDtcbiAgICB9XG5cbiAgICBpZihkZWxheSkge1xuICAgICAgICB0aGlzLl9kZWxheVRpbWVvdXQgPSBzZXRUaW1lb3V0KHRoaXMucGxheS5iaW5kKHRoaXMpLCBkZWxheSk7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB0aGlzLl9lbC5wbGF5KCk7XG4gICAgfVxuXG4gICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXVzZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wbGF5aW5nID0gdHJ1ZTtcblxuICAgIHRoaXMuX2VsLnJlbW92ZUV2ZW50TGlzdGVuZXIoJ2VuZGVkJywgdGhpcy5fZW5kZWRIYW5kbGVyQm91bmQpO1xuICAgIHRoaXMuX2VsLmFkZEV2ZW50TGlzdGVuZXIoJ2VuZGVkJywgdGhpcy5fZW5kZWRIYW5kbGVyQm91bmQsIGZhbHNlKTtcbn07XG5cbk1lZGlhU291cmNlLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgIGNsZWFyVGltZW91dCh0aGlzLl9kZWxheVRpbWVvdXQpO1xuXG4gICAgaWYoIXRoaXMuX2VsKSB7IHJldHVybjsgfVxuXG4gICAgdGhpcy5fZWwucGF1c2UoKTtcbiAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5fcGF1c2VkID0gdHJ1ZTtcbn07XG5cbk1lZGlhU291cmNlLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24oKSB7XG4gICAgY2xlYXJUaW1lb3V0KHRoaXMuX2RlbGF5VGltZW91dCk7XG5cbiAgICBpZighdGhpcy5fZWwpIHsgcmV0dXJuOyB9XG5cbiAgICB0aGlzLl9lbC5wYXVzZSgpO1xuXG4gICAgdHJ5IHtcbiAgICAgICAgdGhpcy5fZWwuY3VycmVudFRpbWUgPSAwO1xuICAgICAgICAvLyBmaXhlcyBidWcgd2hlcmUgc2VydmVyIGRvZXNuJ3Qgc3VwcG9ydCBzZWVrOlxuICAgICAgICBpZih0aGlzLl9lbC5jdXJyZW50VGltZSA+IDApIHsgdGhpcy5fZWwubG9hZCgpOyB9ICAgIFxuICAgIH0gY2F0Y2goZSkge31cblxuICAgIHRoaXMuX3BsYXlpbmcgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXVzZWQgPSBmYWxzZTtcbn07XG5cbi8qXG4gKiBFbmRlZCBoYW5kbGVyXG4gKi9cblxuTWVkaWFTb3VyY2UucHJvdG90eXBlLm9uRW5kZWQgPSBmdW5jdGlvbihmbiwgY29udGV4dCkge1xuICAgIHRoaXMuX2VuZGVkQ2FsbGJhY2sgPSBmbiA/IGZuLmJpbmQoY29udGV4dCB8fCB0aGlzKSA6IG51bGw7XG59O1xuXG5NZWRpYVNvdXJjZS5wcm90b3R5cGUuX2VuZGVkSGFuZGxlciA9IGZ1bmN0aW9uKCkge1xuICAgIHRoaXMuX2VuZGVkID0gdHJ1ZTtcbiAgICB0aGlzLl9wYXVzZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG5cbiAgICBpZih0aGlzLl9sb29wKSB7XG4gICAgICAgIHRoaXMuX2VsLmN1cnJlbnRUaW1lID0gMDtcbiAgICAgICAgLy8gZml4ZXMgYnVnIHdoZXJlIHNlcnZlciBkb2Vzbid0IHN1cHBvcnQgc2VlazpcbiAgICAgICAgaWYodGhpcy5fZWwuY3VycmVudFRpbWUgPiAwKSB7IHRoaXMuX2VsLmxvYWQoKTsgfVxuICAgICAgICB0aGlzLnBsYXkoKTtcbiAgICB9IGVsc2UgaWYodHlwZW9mIHRoaXMuX2VuZGVkQ2FsbGJhY2sgPT09ICdmdW5jdGlvbicpIHtcbiAgICAgICAgdGhpcy5fZW5kZWRDYWxsYmFjayh0aGlzKTtcbiAgICB9XG59O1xuXG4vKlxuICogR2V0dGVycyAmIFNldHRlcnNcbiAqL1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWVkaWFTb3VyY2UucHJvdG90eXBlLCAnY3VycmVudFRpbWUnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2VsID8gdGhpcy5fZWwuY3VycmVudFRpbWUgOiAwO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWVkaWFTb3VyY2UucHJvdG90eXBlLCAnZHVyYXRpb24nLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2VsID8gdGhpcy5fZWwuZHVyYXRpb24gOiAwO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWVkaWFTb3VyY2UucHJvdG90eXBlLCAnZW5kZWQnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2VuZGVkO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWVkaWFTb3VyY2UucHJvdG90eXBlLCAnbG9vcCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fbG9vcDtcbiAgICB9LFxuICAgIHNldDogZnVuY3Rpb24odmFsdWUpIHtcbiAgICAgICAgdGhpcy5fbG9vcCA9IHZhbHVlO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWVkaWFTb3VyY2UucHJvdG90eXBlLCAncGF1c2VkJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wYXVzZWQ7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShNZWRpYVNvdXJjZS5wcm90b3R5cGUsICdwbGF5aW5nJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF5aW5nO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWVkaWFTb3VyY2UucHJvdG90eXBlLCAncHJvZ3Jlc3MnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuY3VycmVudFRpbWUgLyB0aGlzLmR1cmF0aW9uO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWVkaWFTb3VyY2UucHJvdG90eXBlLCAnc291cmNlTm9kZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZighdGhpcy5fc291cmNlTm9kZSAmJiB0aGlzLl9jb250ZXh0KSB7XG4gICAgICAgICAgICB0aGlzLl9zb3VyY2VOb2RlID0gdGhpcy5fY29udGV4dC5jcmVhdGVNZWRpYUVsZW1lbnRTb3VyY2UodGhpcy5fZWwpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9zb3VyY2VOb2RlO1xuICAgIH1cbn0pO1xuXG5pZiAodHlwZW9mIG1vZHVsZSA9PT0gJ29iamVjdCcgJiYgbW9kdWxlLmV4cG9ydHMpIHtcbiAgICBtb2R1bGUuZXhwb3J0cyA9IE1lZGlhU291cmNlO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBNaWNyb3Bob25lU291cmNlKHN0cmVhbSwgY29udGV4dCkge1xuICAgIHRoaXMuaWQgPSAnJztcbiAgICB0aGlzLl9jb250ZXh0ID0gY29udGV4dDtcbiAgICB0aGlzLl9lbmRlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZEF0ID0gMDtcbiAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5fc291cmNlTm9kZSA9IG51bGw7IC8vIE1pY3JvcGhvbmVTb3VyY2VOb2RlXG4gICAgdGhpcy5fc3RhcnRlZEF0ID0gMDtcbiAgICB0aGlzLl9zdHJlYW0gPSBzdHJlYW07XG59XG5cbi8qXG4gKiBDb250cm9sc1xuICovXG5cbk1pY3JvcGhvbmVTb3VyY2UucHJvdG90eXBlLnBsYXkgPSBmdW5jdGlvbihkZWxheSkge1xuICAgIGlmKGRlbGF5ID09PSB1bmRlZmluZWQpIHsgZGVsYXkgPSAwOyB9XG4gICAgaWYoZGVsYXkgPiAwKSB7IGRlbGF5ID0gdGhpcy5fY29udGV4dC5jdXJyZW50VGltZSArIGRlbGF5OyB9XG5cbiAgICB0aGlzLnNvdXJjZU5vZGUuc3RhcnQoZGVsYXkpO1xuXG4gICAgaWYodGhpcy5fcGF1c2VkQXQpIHtcbiAgICAgICAgdGhpcy5fc3RhcnRlZEF0ID0gdGhpcy5fY29udGV4dC5jdXJyZW50VGltZSAtIHRoaXMuX3BhdXNlZEF0O1xuICAgIH1cbiAgICBlbHNlIHtcbiAgICAgICAgdGhpcy5fc3RhcnRlZEF0ID0gdGhpcy5fY29udGV4dC5jdXJyZW50VGltZTtcbiAgICB9XG5cbiAgICB0aGlzLl9lbmRlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BsYXlpbmcgPSB0cnVlO1xuICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZEF0ID0gMDtcbn07XG5cbk1pY3JvcGhvbmVTb3VyY2UucHJvdG90eXBlLnBhdXNlID0gZnVuY3Rpb24oKSB7XG4gICAgdmFyIGVsYXBzZWQgPSB0aGlzLl9jb250ZXh0LmN1cnJlbnRUaW1lIC0gdGhpcy5fc3RhcnRlZEF0O1xuICAgIHRoaXMuc3RvcCgpO1xuICAgIHRoaXMuX3BhdXNlZEF0ID0gZWxhcHNlZDtcbiAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5fcGF1c2VkID0gdHJ1ZTtcbn07XG5cbk1pY3JvcGhvbmVTb3VyY2UucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLl9zb3VyY2VOb2RlKSB7XG4gICAgICAgIHRyeSB7XG4gICAgICAgICAgICB0aGlzLl9zb3VyY2VOb2RlLnN0b3AoMCk7XG4gICAgICAgIH0gY2F0Y2goZSkge31cbiAgICAgICAgdGhpcy5fc291cmNlTm9kZSA9IG51bGw7XG4gICAgfVxuICAgIHRoaXMuX2VuZGVkID0gdHJ1ZTtcbiAgICB0aGlzLl9wYXVzZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXVzZWRBdCA9IDA7XG4gICAgdGhpcy5fcGxheWluZyA9IGZhbHNlO1xuICAgIHRoaXMuX3N0YXJ0ZWRBdCA9IDA7XG59O1xuXG4vKlxuICogR2V0dGVycyAmIFNldHRlcnNcbiAqL1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWljcm9waG9uZVNvdXJjZS5wcm90b3R5cGUsICdjdXJyZW50VGltZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZih0aGlzLl9wYXVzZWRBdCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX3BhdXNlZEF0O1xuICAgICAgICB9XG4gICAgICAgIGlmKHRoaXMuX3N0YXJ0ZWRBdCkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXMuX2NvbnRleHQuY3VycmVudFRpbWUgLSB0aGlzLl9zdGFydGVkQXQ7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShNaWNyb3Bob25lU291cmNlLnByb3RvdHlwZSwgJ2R1cmF0aW9uJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWljcm9waG9uZVNvdXJjZS5wcm90b3R5cGUsICdlbmRlZCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fZW5kZWQ7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShNaWNyb3Bob25lU291cmNlLnByb3RvdHlwZSwgJ3BhdXNlZCcsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICByZXR1cm4gdGhpcy5fcGF1c2VkO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWljcm9waG9uZVNvdXJjZS5wcm90b3R5cGUsICdwbGF5aW5nJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF5aW5nO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoTWljcm9waG9uZVNvdXJjZS5wcm90b3R5cGUsICdwcm9ncmVzcycsIHtcbiAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICByZXR1cm4gMDtcbiAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShNaWNyb3Bob25lU291cmNlLnByb3RvdHlwZSwgJ3NvdXJjZU5vZGUnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYoIXRoaXMuX3NvdXJjZU5vZGUpIHtcbiAgICAgICAgICAgIHRoaXMuX3NvdXJjZU5vZGUgPSB0aGlzLl9jb250ZXh0LmNyZWF0ZU1lZGlhU3RyZWFtU291cmNlKHRoaXMuX3N0cmVhbSk7XG4gICAgICAgICAgICAvLyBIQUNLOiBzdG9wcyBtb3ogZ2FyYmFnZSBjb2xsZWN0aW9uIGtpbGxpbmcgdGhlIHN0cmVhbVxuICAgICAgICAgICAgLy8gc2VlIGh0dHBzOi8vc3VwcG9ydC5tb3ppbGxhLm9yZy9lbi1VUy9xdWVzdGlvbnMvOTg0MTc5XG4gICAgICAgICAgICBpZihuYXZpZ2F0b3IubW96R2V0VXNlck1lZGlhKSB7XG4gICAgICAgICAgICAgICAgd2luZG93Lm1vekhhY2sgPSB0aGlzLl9zb3VyY2VOb2RlO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9zb3VyY2VOb2RlO1xuICAgIH1cbn0pO1xuXG5cbi8qXG4gKiBFeHBvcnRzXG4gKi9cblxuaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBNaWNyb3Bob25lU291cmNlO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBPc2NpbGxhdG9yU291cmNlKHR5cGUsIGNvbnRleHQpIHtcbiAgICB0aGlzLmlkID0gJyc7XG4gICAgdGhpcy5fY29udGV4dCA9IGNvbnRleHQ7XG4gICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXVzZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXVzZWRBdCA9IDA7XG4gICAgdGhpcy5fcGxheWluZyA9IGZhbHNlO1xuICAgIHRoaXMuX3NvdXJjZU5vZGUgPSBudWxsOyAvLyBPc2NpbGxhdG9yU291cmNlTm9kZVxuICAgIHRoaXMuX3N0YXJ0ZWRBdCA9IDA7XG4gICAgdGhpcy5fdHlwZSA9IHR5cGU7XG4gICAgdGhpcy5fZnJlcXVlbmN5ID0gMjAwO1xufVxuXG4vKlxuICogQ29udHJvbHNcbiAqL1xuXG5Pc2NpbGxhdG9yU291cmNlLnByb3RvdHlwZS5wbGF5ID0gZnVuY3Rpb24oZGVsYXkpIHtcbiAgICBpZihkZWxheSA9PT0gdW5kZWZpbmVkKSB7IGRlbGF5ID0gMDsgfVxuICAgIGlmKGRlbGF5ID4gMCkgeyBkZWxheSA9IHRoaXMuX2NvbnRleHQuY3VycmVudFRpbWUgKyBkZWxheTsgfVxuXG4gICAgdGhpcy5zb3VyY2VOb2RlLnN0YXJ0KGRlbGF5KTtcblxuICAgIGlmKHRoaXMuX3BhdXNlZEF0KSB7XG4gICAgICAgIHRoaXMuX3N0YXJ0ZWRBdCA9IHRoaXMuX2NvbnRleHQuY3VycmVudFRpbWUgLSB0aGlzLl9wYXVzZWRBdDtcbiAgICB9XG4gICAgZWxzZSB7XG4gICAgICAgIHRoaXMuX3N0YXJ0ZWRBdCA9IHRoaXMuX2NvbnRleHQuY3VycmVudFRpbWU7XG4gICAgfVxuXG4gICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wbGF5aW5nID0gdHJ1ZTtcbiAgICB0aGlzLl9wYXVzZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9wYXVzZWRBdCA9IDA7XG59O1xuXG5Pc2NpbGxhdG9yU291cmNlLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBlbGFwc2VkID0gdGhpcy5fY29udGV4dC5jdXJyZW50VGltZSAtIHRoaXMuX3N0YXJ0ZWRBdDtcbiAgICB0aGlzLnN0b3AoKTtcbiAgICB0aGlzLl9wYXVzZWRBdCA9IGVsYXBzZWQ7XG4gICAgdGhpcy5fcGxheWluZyA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZCA9IHRydWU7XG59O1xuXG5Pc2NpbGxhdG9yU291cmNlLnByb3RvdHlwZS5zdG9wID0gZnVuY3Rpb24oKSB7XG4gICAgaWYodGhpcy5fc291cmNlTm9kZSkge1xuICAgICAgICB0cnkge1xuICAgICAgICAgICAgdGhpcy5fc291cmNlTm9kZS5zdG9wKDApO1xuICAgICAgICB9IGNhdGNoKGUpIHt9XG4gICAgICAgIHRoaXMuX3NvdXJjZU5vZGUgPSBudWxsO1xuICAgIH1cbiAgICB0aGlzLl9lbmRlZCA9IHRydWU7XG4gICAgdGhpcy5fcGF1c2VkID0gZmFsc2U7XG4gICAgdGhpcy5fcGF1c2VkQXQgPSAwO1xuICAgIHRoaXMuX3BsYXlpbmcgPSBmYWxzZTtcbiAgICB0aGlzLl9zdGFydGVkQXQgPSAwO1xufTtcblxuLypcbiAqIEdldHRlcnMgJiBTZXR0ZXJzXG4gKi9cblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KE9zY2lsbGF0b3JTb3VyY2UucHJvdG90eXBlLCAnZnJlcXVlbmN5Jywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9mcmVxdWVuY3k7XG4gICAgfSxcbiAgICBzZXQ6IGZ1bmN0aW9uKHZhbHVlKSB7XG4gICAgICAgIHRoaXMuX2ZyZXF1ZW5jeSA9IHZhbHVlO1xuICAgICAgICBpZih0aGlzLl9zb3VyY2VOb2RlKSB7XG4gICAgICAgICAgICB0aGlzLl9zb3VyY2VOb2RlLmZyZXF1ZW5jeS52YWx1ZSA9IHZhbHVlO1xuICAgICAgICB9XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShPc2NpbGxhdG9yU291cmNlLnByb3RvdHlwZSwgJ2N1cnJlbnRUaW1lJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmKHRoaXMuX3BhdXNlZEF0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fcGF1c2VkQXQ7XG4gICAgICAgIH1cbiAgICAgICAgaWYodGhpcy5fc3RhcnRlZEF0KSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcy5fY29udGV4dC5jdXJyZW50VGltZSAtIHRoaXMuX3N0YXJ0ZWRBdDtcbiAgICAgICAgfVxuICAgICAgICByZXR1cm4gMDtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KE9zY2lsbGF0b3JTb3VyY2UucHJvdG90eXBlLCAnZHVyYXRpb24nLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIDA7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShPc2NpbGxhdG9yU291cmNlLnByb3RvdHlwZSwgJ2VuZGVkJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbmRlZDtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KE9zY2lsbGF0b3JTb3VyY2UucHJvdG90eXBlLCAncGF1c2VkJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wYXVzZWQ7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShPc2NpbGxhdG9yU291cmNlLnByb3RvdHlwZSwgJ3BsYXlpbmcnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BsYXlpbmc7XG4gICAgfVxufSk7XG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShPc2NpbGxhdG9yU291cmNlLnByb3RvdHlwZSwgJ3Byb2dyZXNzJywge1xuICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAwO1xuICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KE9zY2lsbGF0b3JTb3VyY2UucHJvdG90eXBlLCAnc291cmNlTm9kZScsIHtcbiAgICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgICAgICBpZighdGhpcy5fc291cmNlTm9kZSAmJiB0aGlzLl9jb250ZXh0KSB7XG4gICAgICAgICAgICB0aGlzLl9zb3VyY2VOb2RlID0gdGhpcy5fY29udGV4dC5jcmVhdGVPc2NpbGxhdG9yKCk7XG4gICAgICAgICAgICB0aGlzLl9zb3VyY2VOb2RlLnR5cGUgPSB0aGlzLl90eXBlO1xuICAgICAgICAgICAgdGhpcy5fc291cmNlTm9kZS5mcmVxdWVuY3kudmFsdWUgPSB0aGlzLl9mcmVxdWVuY3k7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuX3NvdXJjZU5vZGU7XG4gICAgfVxufSk7XG5cbi8qXG4gKiBFeHBvcnRzXG4gKi9cblxuaWYgKHR5cGVvZiBtb2R1bGUgPT09ICdvYmplY3QnICYmIG1vZHVsZS5leHBvcnRzKSB7XG4gICAgbW9kdWxlLmV4cG9ydHMgPSBPc2NpbGxhdG9yU291cmNlO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBTY3JpcHRTb3VyY2UoZGF0YSwgY29udGV4dCkge1xuICAgIHRoaXMuaWQgPSAnJztcbiAgICB0aGlzLl9idWZmZXJTaXplID0gZGF0YS5idWZmZXJTaXplIHx8IDEwMjQ7XG4gICAgdGhpcy5fY2hhbm5lbHMgPSBkYXRhLmNoYW5uZWxzIHx8IDE7XG4gICAgdGhpcy5fY29udGV4dCA9IGNvbnRleHQ7XG4gICAgdGhpcy5fZW5kZWQgPSBmYWxzZTtcbiAgICB0aGlzLl9vblByb2Nlc3MgPSBkYXRhLmNhbGxiYWNrLmJpbmQoZGF0YS50aGlzQXJnIHx8IHRoaXMpO1xuICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZEF0ID0gMDtcbiAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5fc291cmNlTm9kZSA9IG51bGw7IC8vIFNjcmlwdFNvdXJjZU5vZGVcbiAgICB0aGlzLl9zdGFydGVkQXQgPSAwO1xufVxuXG4vKlxuICogQ29udHJvbHNcbiAqL1xuXG5TY3JpcHRTb3VyY2UucHJvdG90eXBlLnBsYXkgPSBmdW5jdGlvbihkZWxheSkge1xuICAgIGlmKGRlbGF5ID09PSB1bmRlZmluZWQpIHsgZGVsYXkgPSAwOyB9XG4gICAgaWYoZGVsYXkgPiAwKSB7IGRlbGF5ID0gdGhpcy5fY29udGV4dC5jdXJyZW50VGltZSArIGRlbGF5OyB9XG5cbiAgICB0aGlzLnNvdXJjZU5vZGUub25hdWRpb3Byb2Nlc3MgPSB0aGlzLl9vblByb2Nlc3M7XG5cbiAgICBpZih0aGlzLl9wYXVzZWRBdCkge1xuICAgICAgICB0aGlzLl9zdGFydGVkQXQgPSB0aGlzLl9jb250ZXh0LmN1cnJlbnRUaW1lIC0gdGhpcy5fcGF1c2VkQXQ7XG4gICAgfVxuICAgIGVsc2Uge1xuICAgICAgICB0aGlzLl9zdGFydGVkQXQgPSB0aGlzLl9jb250ZXh0LmN1cnJlbnRUaW1lO1xuICAgIH1cblxuICAgIHRoaXMuX2VuZGVkID0gZmFsc2U7XG4gICAgdGhpcy5fcGF1c2VkID0gZmFsc2U7XG4gICAgdGhpcy5fcGF1c2VkQXQgPSAwO1xuICAgIHRoaXMuX3BsYXlpbmcgPSB0cnVlO1xufTtcblxuU2NyaXB0U291cmNlLnByb3RvdHlwZS5wYXVzZSA9IGZ1bmN0aW9uKCkge1xuICAgIHZhciBlbGFwc2VkID0gdGhpcy5fY29udGV4dC5jdXJyZW50VGltZSAtIHRoaXMuX3N0YXJ0ZWRBdDtcbiAgICB0aGlzLnN0b3AoKTtcbiAgICB0aGlzLl9wYXVzZWRBdCA9IGVsYXBzZWQ7XG4gICAgdGhpcy5fcGxheWluZyA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZCA9IHRydWU7XG59O1xuXG5TY3JpcHRTb3VyY2UucHJvdG90eXBlLnN0b3AgPSBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLl9zb3VyY2VOb2RlKSB7XG4gICAgICAgIHRoaXMuX3NvdXJjZU5vZGUub25hdWRpb3Byb2Nlc3MgPSB0aGlzLl9vblBhdXNlZDtcbiAgICB9XG4gICAgdGhpcy5fZW5kZWQgPSB0cnVlO1xuICAgIHRoaXMuX3BhdXNlZCA9IGZhbHNlO1xuICAgIHRoaXMuX3BhdXNlZEF0ID0gMDtcbiAgICB0aGlzLl9wbGF5aW5nID0gZmFsc2U7XG4gICAgdGhpcy5fc3RhcnRlZEF0ID0gMDtcbn07XG5cblNjcmlwdFNvdXJjZS5wcm90b3R5cGUuX29uUGF1c2VkID0gZnVuY3Rpb24oZXZlbnQpIHtcbiAgICB2YXIgYnVmZmVyID0gZXZlbnQub3V0cHV0QnVmZmVyO1xuICAgIGZvciAodmFyIGkgPSAwLCBsID0gYnVmZmVyLm51bWJlck9mQ2hhbm5lbHM7IGkgPCBsOyBpKyspIHtcbiAgICAgICAgdmFyIGNoYW5uZWwgPSBidWZmZXIuZ2V0Q2hhbm5lbERhdGEoaSk7XG4gICAgICAgIGZvciAodmFyIGogPSAwLCBsZW4gPSBjaGFubmVsLmxlbmd0aDsgaiA8IGxlbjsgaisrKSB7XG4gICAgICAgICAgICBjaGFubmVsW2pdID0gMDtcbiAgICAgICAgfVxuICAgIH1cbn07XG5cbi8qXG4gKiBHZXR0ZXJzICYgU2V0dGVyc1xuICovXG5cbk9iamVjdC5kZWZpbmVQcm9wZXJ0eShTY3JpcHRTb3VyY2UucHJvdG90eXBlLCAnY3VycmVudFRpbWUnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgaWYodGhpcy5fcGF1c2VkQXQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9wYXVzZWRBdDtcbiAgICAgICAgfVxuICAgICAgICBpZih0aGlzLl9zdGFydGVkQXQpIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzLl9jb250ZXh0LmN1cnJlbnRUaW1lIC0gdGhpcy5fc3RhcnRlZEF0O1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU2NyaXB0U291cmNlLnByb3RvdHlwZSwgJ2R1cmF0aW9uJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiAwO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU2NyaXB0U291cmNlLnByb3RvdHlwZSwgJ2VuZGVkJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9lbmRlZDtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFNjcmlwdFNvdXJjZS5wcm90b3R5cGUsICdwYXVzZWQnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3BhdXNlZDtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFNjcmlwdFNvdXJjZS5wcm90b3R5cGUsICdwbGF5aW5nJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9wbGF5aW5nO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU2NyaXB0U291cmNlLnByb3RvdHlwZSwgJ3Byb2dyZXNzJywge1xuICBnZXQ6IGZ1bmN0aW9uKCkge1xuICAgIHJldHVybiAwO1xuICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFNjcmlwdFNvdXJjZS5wcm90b3R5cGUsICdzb3VyY2VOb2RlJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIGlmKCF0aGlzLl9zb3VyY2VOb2RlKSB7XG4gICAgICAgICAgICB0aGlzLl9zb3VyY2VOb2RlID0gdGhpcy5fY29udGV4dC5jcmVhdGVTY3JpcHRQcm9jZXNzb3IodGhpcy5fYnVmZmVyU2l6ZSwgMCwgdGhpcy5fY2hhbm5lbHMpO1xuICAgICAgICB9XG4gICAgICAgIHJldHVybiB0aGlzLl9zb3VyY2VOb2RlO1xuICAgIH1cbn0pO1xuXG4vKlxuICogRXhwb3J0c1xuICovXG5cbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gU2NyaXB0U291cmNlO1xufVxuIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBTdXBwb3J0KCkge1xuICAgIHRoaXMuX2luaXQoKTtcbn1cblxuU3VwcG9ydC5wcm90b3R5cGUuX2luaXQgPSBmdW5jdGlvbigpIHtcbiAgICB2YXIgZWwgPSBkb2N1bWVudC5jcmVhdGVFbGVtZW50KCdhdWRpbycpO1xuICAgIGlmKCFlbCkgeyByZXR1cm4gW107IH1cblxuICAgIHZhciB0ZXN0cyA9IFtcbiAgICAgICAgeyBleHQ6ICdvZ2cnLCB0eXBlOiAnYXVkaW8vb2dnOyBjb2RlY3M9XCJ2b3JiaXNcIicgfSxcbiAgICAgICAgeyBleHQ6ICdtcDMnLCB0eXBlOiAnYXVkaW8vbXBlZzsnIH0sXG4gICAgICAgIHsgZXh0OiAnb3B1cycsIHR5cGU6ICdhdWRpby9vZ2c7IGNvZGVjcz1cIm9wdXNcIicgfSxcbiAgICAgICAgeyBleHQ6ICd3YXYnLCB0eXBlOiAnYXVkaW8vd2F2OyBjb2RlY3M9XCIxXCInIH0sXG4gICAgICAgIHsgZXh0OiAnbTRhJywgdHlwZTogJ2F1ZGlvL3gtbTRhOycgfSxcbiAgICAgICAgeyBleHQ6ICdtNGEnLCB0eXBlOiAnYXVkaW8vYWFjOycgfVxuICAgIF07XG5cbiAgICB0aGlzLl9leHRlbnNpb25zID0gW107XG4gICAgdGhpcy5fY2FuUGxheSA9IHt9O1xuXG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0ZXN0cy5sZW5ndGg7IGkrKykge1xuICAgICAgICB2YXIgdGVzdCA9IHRlc3RzW2ldO1xuICAgICAgICB2YXIgY2FuUGxheVR5cGUgPSAhIWVsLmNhblBsYXlUeXBlKHRlc3QudHlwZSk7XG4gICAgICAgIGlmKGNhblBsYXlUeXBlKSB7XG4gICAgICAgICAgICB0aGlzLl9leHRlbnNpb25zLnB1c2godGVzdC5leHQpO1xuICAgICAgICB9XG4gICAgICAgIHRoaXMuX2NhblBsYXlbdGVzdC5leHRdID0gY2FuUGxheVR5cGU7XG4gICAgfVxufTtcblxuU3VwcG9ydC5wcm90b3R5cGUuZ2V0RmlsZUV4dGVuc2lvbiA9IGZ1bmN0aW9uKHVybCkge1xuICAgIHVybCA9IHVybC5zcGxpdCgnPycpWzBdO1xuICAgIHVybCA9IHVybC5zdWJzdHIodXJsLmxhc3RJbmRleE9mKCcvJykgKyAxKTtcblxuICAgIHZhciBhID0gdXJsLnNwbGl0KCcuJyk7XG4gICAgaWYoYS5sZW5ndGggPT09IDEgfHwgKGFbMF0gPT09ICcnICYmIGEubGVuZ3RoID09PSAyKSkge1xuICAgICAgICByZXR1cm4gJyc7XG4gICAgfVxuICAgIHJldHVybiBhLnBvcCgpLnRvTG93ZXJDYXNlKCk7XG59O1xuXG5TdXBwb3J0LnByb3RvdHlwZS5nZXRTdXBwb3J0ZWRGaWxlID0gZnVuY3Rpb24oZmlsZU5hbWVzKSB7XG4gICAgLy8gaWYgYXJyYXkgZ2V0IHRoZSBmaXJzdCBvbmUgdGhhdCB3b3Jrc1xuICAgIGlmKGZpbGVOYW1lcyBpbnN0YW5jZW9mIEFycmF5KSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgZmlsZU5hbWVzLmxlbmd0aDsgaSsrKSB7XG4gICAgICAgICAgICB2YXIgZXh0ID0gdGhpcy5nZXRGaWxlRXh0ZW5zaW9uKGZpbGVOYW1lc1tpXSk7XG4gICAgICAgICAgICB2YXIgaW5kID0gdGhpcy5fZXh0ZW5zaW9ucy5pbmRleE9mKGV4dCk7XG4gICAgICAgICAgICBpZihpbmQgPiAtMSkge1xuICAgICAgICAgICAgICAgIHJldHVybiBmaWxlTmFtZXNbaV07XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG4gICAgLy8gaWYgbm90IGFycmF5IGFuZCBpcyBvYmplY3RcbiAgICBlbHNlIGlmKGZpbGVOYW1lcyBpbnN0YW5jZW9mIE9iamVjdCkge1xuICAgICAgICBmb3IodmFyIGtleSBpbiBmaWxlTmFtZXMpIHtcbiAgICAgICAgICAgIHZhciBleHRlbnNpb24gPSB0aGlzLmdldEZpbGVFeHRlbnNpb24oZmlsZU5hbWVzW2tleV0pO1xuICAgICAgICAgICAgdmFyIGluZGV4ID0gdGhpcy5fZXh0ZW5zaW9ucy5pbmRleE9mKGV4dGVuc2lvbik7XG4gICAgICAgICAgICBpZihpbmRleCA+IC0xKSB7XG4gICAgICAgICAgICAgICAgcmV0dXJuIGZpbGVOYW1lc1trZXldO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuICAgIC8vIGlmIHN0cmluZyBqdXN0IHJldHVyblxuICAgIHJldHVybiBmaWxlTmFtZXM7XG59O1xuXG4vKlxuICogR2V0dGVycyAmIFNldHRlcnNcbiAqL1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU3VwcG9ydC5wcm90b3R5cGUsICdleHRlbnNpb25zJywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9leHRlbnNpb25zO1xuICAgIH1cbn0pO1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoU3VwcG9ydC5wcm90b3R5cGUsICdjYW5QbGF5Jywge1xuICAgIGdldDogZnVuY3Rpb24oKSB7XG4gICAgICAgIHJldHVybiB0aGlzLl9jYW5QbGF5O1xuICAgIH1cbn0pO1xuXG4vKlxuICogRXhwb3J0c1xuICovXG5cbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gU3VwcG9ydDtcbn1cbiIsIid1c2Ugc3RyaWN0JztcblxudmFyIFV0aWxzID0ge307XG5cblV0aWxzLnNldENvbnRleHQgPSBmdW5jdGlvbihjb250ZXh0KSB7XG4gICAgdGhpcy5fY29udGV4dCA9IGNvbnRleHQ7XG59O1xuXG5VdGlscy5jcm9zc0ZhZGUgPSBmdW5jdGlvbihmcm9tU291bmQsIHRvU291bmQsIGR1cmF0aW9uKSB7XG4gICAgZnJvbVNvdW5kLmdhaW4uZ2Fpbi5saW5lYXJSYW1wVG9WYWx1ZUF0VGltZSgwLCB0aGlzLl9jb250ZXh0LmN1cnJlbnRUaW1lICsgZHVyYXRpb24pO1xuICAgIHRvU291bmQuZ2Fpbi5nYWluLmxpbmVhclJhbXBUb1ZhbHVlQXRUaW1lKDEsIHRoaXMuX2NvbnRleHQuY3VycmVudFRpbWUgKyBkdXJhdGlvbik7XG59O1xuXG5VdGlscy5mYWRlRnJvbSA9IGZ1bmN0aW9uKHNvdW5kLCB2YWx1ZSwgZHVyYXRpb24pIHtcbiAgICB2YXIgdG9WYWx1ZSA9IHNvdW5kLmdhaW4uZ2Fpbi52YWx1ZTtcbiAgICBzb3VuZC5nYWluLmdhaW4udmFsdWUgPSB2YWx1ZTtcbiAgICBzb3VuZC5nYWluLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodG9WYWx1ZSwgdGhpcy5fY29udGV4dC5jdXJyZW50VGltZSArIGR1cmF0aW9uKTtcbn07XG5cblV0aWxzLmZhZGVUbyA9IGZ1bmN0aW9uKHNvdW5kLCB2YWx1ZSwgZHVyYXRpb24pIHtcbiAgICBzb3VuZC5nYWluLmdhaW4ubGluZWFyUmFtcFRvVmFsdWVBdFRpbWUodmFsdWUsIHRoaXMuX2NvbnRleHQuY3VycmVudFRpbWUgKyBkdXJhdGlvbik7XG59O1xuXG5VdGlscy5nZXRGcmVxdWVuY3kgPSBmdW5jdGlvbih2YWx1ZSkge1xuICAgIC8vIGdldCBmcmVxdWVuY3kgYnkgcGFzc2luZyBudW1iZXIgZnJvbSAwIHRvIDFcbiAgICAvLyBDbGFtcCB0aGUgZnJlcXVlbmN5IGJldHdlZW4gdGhlIG1pbmltdW0gdmFsdWUgKDQwIEh6KSBhbmQgaGFsZiBvZiB0aGVcbiAgICAvLyBzYW1wbGluZyByYXRlLlxuICAgIHZhciBtaW5WYWx1ZSA9IDQwO1xuICAgIHZhciBtYXhWYWx1ZSA9IHRoaXMuX2NvbnRleHQuc2FtcGxlUmF0ZSAvIDI7XG4gICAgLy8gTG9nYXJpdGhtIChiYXNlIDIpIHRvIGNvbXB1dGUgaG93IG1hbnkgb2N0YXZlcyBmYWxsIGluIHRoZSByYW5nZS5cbiAgICB2YXIgbnVtYmVyT2ZPY3RhdmVzID0gTWF0aC5sb2cobWF4VmFsdWUgLyBtaW5WYWx1ZSkgLyBNYXRoLkxOMjtcbiAgICAvLyBDb21wdXRlIGEgbXVsdGlwbGllciBmcm9tIDAgdG8gMSBiYXNlZCBvbiBhbiBleHBvbmVudGlhbCBzY2FsZS5cbiAgICB2YXIgbXVsdGlwbGllciA9IE1hdGgucG93KDIsIG51bWJlck9mT2N0YXZlcyAqICh2YWx1ZSAtIDEuMCkpO1xuICAgIC8vIEdldCBiYWNrIHRvIHRoZSBmcmVxdWVuY3kgdmFsdWUgYmV0d2VlbiBtaW4gYW5kIG1heC5cbiAgICByZXR1cm4gbWF4VmFsdWUgKiBtdWx0aXBsaWVyO1xufTtcblxuVXRpbHMuaXNBdWRpb0J1ZmZlciA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICByZXR1cm4gISEoZGF0YSAmJlxuICAgICAgICAgICAgICB3aW5kb3cuQXVkaW9CdWZmZXIgJiZcbiAgICAgICAgICAgICAgZGF0YSBpbnN0YW5jZW9mIHdpbmRvdy5BdWRpb0J1ZmZlcik7XG59O1xuXG5VdGlscy5pc01lZGlhRWxlbWVudCA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICByZXR1cm4gISEoZGF0YSAmJlxuICAgICAgICAgICAgICB3aW5kb3cuSFRNTE1lZGlhRWxlbWVudCAmJlxuICAgICAgICAgICAgICBkYXRhIGluc3RhbmNlb2Ygd2luZG93LkhUTUxNZWRpYUVsZW1lbnQpO1xufTtcblxuVXRpbHMuaXNNZWRpYVN0cmVhbSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICByZXR1cm4gISEoZGF0YSAmJlxuICAgICAgICAgICAgICB0eXBlb2YgZGF0YS5nZXRBdWRpb1RyYWNrcyA9PT0gJ2Z1bmN0aW9uJyAmJlxuICAgICAgICAgICAgICBkYXRhLmdldEF1ZGlvVHJhY2tzKCkubGVuZ3RoICYmXG4gICAgICAgICAgICAgIHdpbmRvdy5NZWRpYVN0cmVhbVRyYWNrICYmXG4gICAgICAgICAgICAgIGRhdGEuZ2V0QXVkaW9UcmFja3MoKVswXSBpbnN0YW5jZW9mIHdpbmRvdy5NZWRpYVN0cmVhbVRyYWNrKTtcbn07XG5cblV0aWxzLmlzT3NjaWxsYXRvclR5cGUgPSBmdW5jdGlvbihkYXRhKSB7XG4gICAgcmV0dXJuICEhKGRhdGEgJiYgdHlwZW9mIGRhdGEgPT09ICdzdHJpbmcnICYmXG4gICAgICAgICAgICAgKGRhdGEgPT09ICdzaW5lJyB8fCBkYXRhID09PSAnc3F1YXJlJyB8fFxuICAgICAgICAgICAgICBkYXRhID09PSAnc2F3dG9vdGgnIHx8IGRhdGEgPT09ICd0cmlhbmdsZScpKTtcbn07XG5cblV0aWxzLmlzU2NyaXB0Q29uZmlnID0gZnVuY3Rpb24oZGF0YSkge1xuICAgIHJldHVybiAhIShkYXRhICYmIHR5cGVvZiBkYXRhID09PSAnb2JqZWN0JyAmJlxuICAgICAgICAgICAgICBkYXRhLmJ1ZmZlclNpemUgJiYgZGF0YS5jaGFubmVscyAmJiBkYXRhLmNhbGxiYWNrKTtcbn07XG5cblV0aWxzLmlzRmlsZSA9IGZ1bmN0aW9uKGRhdGEpIHtcbiAgICByZXR1cm4gISEoZGF0YSAmJiAoZGF0YSBpbnN0YW5jZW9mIEFycmF5IHx8XG4gICAgICAgICAgICAgICh0eXBlb2YgZGF0YSA9PT0gJ3N0cmluZycgJiYgZGF0YS5pbmRleE9mKCcuJykgPiAtMSkpKTtcbn07XG5cblV0aWxzLm1pY3JvcGhvbmUgPSBmdW5jdGlvbihjb25uZWN0ZWQsIGRlbmllZCwgZXJyb3IsIHRoaXNBcmcpIHtcbiAgICByZXR1cm4gbmV3IFV0aWxzLk1pY3JvcGhvbmUoY29ubmVjdGVkLCBkZW5pZWQsIGVycm9yLCB0aGlzQXJnKTtcbn07XG5cbi8qVXRpbHMucGFuID0gZnVuY3Rpb24ocGFubmVyKSB7XG4gICAgY29uc29sZS5sb2coJ3BhbicsIHRoaXMuX2NvbnRleHQpO1xuICAgIHJldHVybiBuZXcgVXRpbHMuUGFuKHRoaXMuX2NvbnRleHQsIHBhbm5lcik7XG59OyovXG5cblV0aWxzLnRpbWVDb2RlID0gZnVuY3Rpb24oc2Vjb25kcywgZGVsaW0pIHtcbiAgICBpZihkZWxpbSA9PT0gdW5kZWZpbmVkKSB7IGRlbGltID0gJzonOyB9XG4gICAgdmFyIGggPSBNYXRoLmZsb29yKHNlY29uZHMgLyAzNjAwKTtcbiAgICB2YXIgbSA9IE1hdGguZmxvb3IoKHNlY29uZHMgJSAzNjAwKSAvIDYwKTtcbiAgICB2YXIgcyA9IE1hdGguZmxvb3IoKHNlY29uZHMgJSAzNjAwKSAlIDYwKTtcbiAgICB2YXIgaHIgPSAoaCA9PT0gMCA/ICcnIDogKGggPCAxMCA/ICcwJyArIGggKyBkZWxpbSA6IGggKyBkZWxpbSkpO1xuICAgIHZhciBtbiA9IChtIDwgMTAgPyAnMCcgKyBtIDogbSkgKyBkZWxpbTtcbiAgICB2YXIgc2MgPSAocyA8IDEwID8gJzAnICsgcyA6IHMpO1xuICAgIHJldHVybiBociArIG1uICsgc2M7XG59O1xuXG5VdGlscy53YXZlZm9ybSA9IGZ1bmN0aW9uKGJ1ZmZlciwgbGVuZ3RoKSB7XG4gICAgcmV0dXJuIG5ldyBVdGlscy5XYXZlZm9ybShidWZmZXIsIGxlbmd0aCk7XG59O1xuXG4vKlxuICogV2F2ZWZvcm1cbiAqL1xuXG5VdGlscy5XYXZlZm9ybSA9IGZ1bmN0aW9uKGJ1ZmZlciwgbGVuZ3RoKSB7XG4gICAgdGhpcy5kYXRhID0gdGhpcy5nZXREYXRhKGJ1ZmZlciwgbGVuZ3RoKTtcbn07XG5cblV0aWxzLldhdmVmb3JtLnByb3RvdHlwZSA9IHtcbiAgICBnZXREYXRhOiBmdW5jdGlvbihidWZmZXIsIGxlbmd0aCkge1xuICAgICAgICBpZighd2luZG93LkZsb2F0MzJBcnJheSB8fCAhVXRpbHMuaXNBdWRpb0J1ZmZlcihidWZmZXIpKSB7XG4gICAgICAgICAgICByZXR1cm4gW107XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS5sb2coJy0tLS0tLS0tLS0tLS0tLS0tLS0nKTtcbiAgICAgICAgY29uc29sZS50aW1lKCd3YXZlZm9ybURhdGEnKTtcbiAgICAgICAgdmFyIHdhdmVmb3JtID0gbmV3IEZsb2F0MzJBcnJheShsZW5ndGgpLFxuICAgICAgICAgICAgY2h1bmsgPSBNYXRoLmZsb29yKGJ1ZmZlci5sZW5ndGggLyBsZW5ndGgpLFxuICAgICAgICAgICAgLy9jaHVuayA9IGJ1ZmZlci5sZW5ndGggLyBsZW5ndGgsXG4gICAgICAgICAgICByZXNvbHV0aW9uID0gNSwgLy8gMTBcbiAgICAgICAgICAgIGluY3IgPSBNYXRoLmZsb29yKGNodW5rIC8gcmVzb2x1dGlvbiksXG4gICAgICAgICAgICBncmVhdGVzdCA9IDA7XG5cbiAgICAgICAgaWYoaW5jciA8IDEpIHsgaW5jciA9IDE7IH1cblxuICAgICAgICBmb3IgKHZhciBpID0gMCwgY2hubHMgPSBidWZmZXIubnVtYmVyT2ZDaGFubmVsczsgaSA8IGNobmxzOyBpKyspIHtcbiAgICAgICAgICAgIC8vIGNoZWNrIGVhY2ggY2hhbm5lbFxuICAgICAgICAgICAgdmFyIGNoYW5uZWwgPSBidWZmZXIuZ2V0Q2hhbm5lbERhdGEoaSk7XG4gICAgICAgICAgICAvL2ZvciAodmFyIGogPSBsZW5ndGggLSAxOyBqID49IDA7IGotLSkge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBsZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIC8vIGdldCBoaWdoZXN0IHZhbHVlIHdpdGhpbiB0aGUgY2h1bmtcbiAgICAgICAgICAgICAgICAvL3ZhciBjaCA9IGogKiBjaHVuaztcbiAgICAgICAgICAgICAgICAvL2ZvciAodmFyIGsgPSBjaCArIGNodW5rIC0gMTsgayA+PSBjaDsgayAtPSBpbmNyKSB7XG4gICAgICAgICAgICAgICAgZm9yICh2YXIgayA9IGogKiBjaHVuaywgbCA9IGsgKyBjaHVuazsgayA8IGw7IGsgKz0gaW5jcikge1xuICAgICAgICAgICAgICAgICAgICAvLyBzZWxlY3QgaGlnaGVzdCB2YWx1ZSBmcm9tIGNoYW5uZWxzXG4gICAgICAgICAgICAgICAgICAgIHZhciBhID0gY2hhbm5lbFtrXTtcbiAgICAgICAgICAgICAgICAgICAgaWYoYSA8IDApIHsgYSA9IC1hOyB9XG4gICAgICAgICAgICAgICAgICAgIGlmIChhID4gd2F2ZWZvcm1bal0pIHtcbiAgICAgICAgICAgICAgICAgICAgICAgIHdhdmVmb3JtW2pdID0gYTtcbiAgICAgICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICAgICAgICAvLyB1cGRhdGUgaGlnaGVzdCBvdmVyYWxsIGZvciBzY2FsaW5nXG4gICAgICAgICAgICAgICAgICAgIGlmKGEgPiBncmVhdGVzdCkge1xuICAgICAgICAgICAgICAgICAgICAgICAgZ3JlYXRlc3QgPSBhO1xuICAgICAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICAgIC8vIHNjYWxlIHVwP1xuICAgICAgICB2YXIgc2NhbGUgPSAxIC8gZ3JlYXRlc3QsXG4gICAgICAgICAgICBsZW4gPSB3YXZlZm9ybS5sZW5ndGg7XG4gICAgICAgIGZvciAoaSA9IDA7IGkgPCBsZW47IGkrKykge1xuICAgICAgICAgICAgd2F2ZWZvcm1baV0gKj0gc2NhbGU7XG4gICAgICAgIH1cbiAgICAgICAgY29uc29sZS50aW1lRW5kKCd3YXZlZm9ybURhdGEnKTtcbiAgICAgICAgcmV0dXJuIHdhdmVmb3JtO1xuICAgIH0sXG4gICAgZ2V0Q2FudmFzOiBmdW5jdGlvbihoZWlnaHQsIGNvbG9yLCBiZ0NvbG9yLCBjYW52YXNFbCkge1xuICAgIC8vd2F2ZWZvcm06IGZ1bmN0aW9uKGFyciwgd2lkdGgsIGhlaWdodCwgY29sb3IsIGJnQ29sb3IsIGNhbnZhc0VsKSB7XG4gICAgICAgIC8vdmFyIGFyciA9IHRoaXMud2F2ZWZvcm1EYXRhKGJ1ZmZlciwgd2lkdGgpO1xuICAgICAgICB2YXIgY2FudmFzID0gY2FudmFzRWwgfHwgZG9jdW1lbnQuY3JlYXRlRWxlbWVudCgnY2FudmFzJyk7XG4gICAgICAgIHZhciB3aWR0aCA9IGNhbnZhcy53aWR0aCA9IHRoaXMuZGF0YS5sZW5ndGg7XG4gICAgICAgIGNhbnZhcy5oZWlnaHQgPSBoZWlnaHQ7XG4gICAgICAgIHZhciBjb250ZXh0ID0gY2FudmFzLmdldENvbnRleHQoJzJkJyk7XG4gICAgICAgIGNvbnRleHQuc3Ryb2tlU3R5bGUgPSBjb2xvcjtcbiAgICAgICAgY29udGV4dC5maWxsU3R5bGUgPSBiZ0NvbG9yO1xuICAgICAgICBjb250ZXh0LmZpbGxSZWN0KDAsIDAsIHdpZHRoLCBoZWlnaHQpO1xuICAgICAgICB2YXIgeCwgeTtcbiAgICAgICAgLy9jb25zb2xlLnRpbWUoJ3dhdmVmb3JtQ2FudmFzJyk7XG4gICAgICAgIGNvbnRleHQuYmVnaW5QYXRoKCk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwLCBsID0gdGhpcy5kYXRhLmxlbmd0aDsgaSA8IGw7IGkrKykge1xuICAgICAgICAgICAgeCA9IGkgKyAwLjU7XG4gICAgICAgICAgICB5ID0gaGVpZ2h0IC0gTWF0aC5yb3VuZChoZWlnaHQgKiB0aGlzLmRhdGFbaV0pO1xuICAgICAgICAgICAgY29udGV4dC5tb3ZlVG8oeCwgeSk7XG4gICAgICAgICAgICBjb250ZXh0LmxpbmVUbyh4LCBoZWlnaHQpO1xuICAgICAgICB9XG4gICAgICAgIGNvbnRleHQuc3Ryb2tlKCk7XG4gICAgICAgIC8vY29uc29sZS50aW1lRW5kKCd3YXZlZm9ybUNhbnZhcycpO1xuICAgICAgICByZXR1cm4gY2FudmFzO1xuICAgIH1cbn07XG5cblxuLypcbiAqIE1pY3JvcGhvbmVcbiAqL1xuXG5VdGlscy5NaWNyb3Bob25lID0gZnVuY3Rpb24oY29ubmVjdGVkLCBkZW5pZWQsIGVycm9yLCB0aGlzQXJnKSB7XG4gICAgbmF2aWdhdG9yLmdldFVzZXJNZWRpYV8gPSAobmF2aWdhdG9yLmdldFVzZXJNZWRpYSB8fCBuYXZpZ2F0b3Iud2Via2l0R2V0VXNlck1lZGlhIHx8IG5hdmlnYXRvci5tb3pHZXRVc2VyTWVkaWEgfHwgbmF2aWdhdG9yLm1zR2V0VXNlck1lZGlhKTtcbiAgICB0aGlzLl9pc1N1cHBvcnRlZCA9ICEhbmF2aWdhdG9yLmdldFVzZXJNZWRpYV87XG4gICAgdGhpcy5fc3RyZWFtID0gbnVsbDtcblxuICAgIHRoaXMuX29uQ29ubmVjdGVkID0gY29ubmVjdGVkLmJpbmQodGhpc0FyZyB8fCB0aGlzKTtcbiAgICB0aGlzLl9vbkRlbmllZCA9IGRlbmllZCA/IGRlbmllZC5iaW5kKHRoaXNBcmcgfHwgdGhpcykgOiBmdW5jdGlvbigpIHt9O1xuICAgIHRoaXMuX29uRXJyb3IgPSBlcnJvciA/IGVycm9yLmJpbmQodGhpc0FyZyB8fCB0aGlzKSA6IGZ1bmN0aW9uKCkge307XG59O1xuXG5VdGlscy5NaWNyb3Bob25lLnByb3RvdHlwZS5jb25uZWN0ID0gZnVuY3Rpb24oKSB7XG4gICAgaWYoIXRoaXMuX2lzU3VwcG9ydGVkKSB7IHJldHVybjsgfVxuICAgIHZhciBzZWxmID0gdGhpcztcbiAgICBuYXZpZ2F0b3IuZ2V0VXNlck1lZGlhXygge2F1ZGlvOnRydWV9LCBmdW5jdGlvbihzdHJlYW0pIHtcbiAgICAgICAgc2VsZi5fc3RyZWFtID0gc3RyZWFtO1xuICAgICAgICBzZWxmLl9vbkNvbm5lY3RlZChzdHJlYW0pO1xuICAgIH0sIGZ1bmN0aW9uKGUpIHtcbiAgICAgICAgaWYoZS5uYW1lID09PSAnUGVybWlzc2lvbkRlbmllZEVycm9yJyB8fCBlID09PSAnUEVSTUlTU0lPTl9ERU5JRUQnKSB7XG4gICAgICAgICAgICBjb25zb2xlLmxvZygnUGVybWlzc2lvbiBkZW5pZWQuIFlvdSBjYW4gdW5kbyB0aGlzIGJ5IGNsaWNraW5nIHRoZSBjYW1lcmEgaWNvbiB3aXRoIHRoZSByZWQgY3Jvc3MgaW4gdGhlIGFkZHJlc3MgYmFyJyk7XG4gICAgICAgICAgICBzZWxmLl9vbkRlbmllZCgpO1xuICAgICAgICB9XG4gICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgc2VsZi5fb25FcnJvcihlLm1lc3NhZ2UgfHwgZSk7XG4gICAgICAgIH1cbiAgICB9KTtcbiAgICByZXR1cm4gdGhpcztcbn07XG5cblV0aWxzLk1pY3JvcGhvbmUucHJvdG90eXBlLmRpc2Nvbm5lY3QgPSBmdW5jdGlvbigpIHtcbiAgICBpZih0aGlzLl9zdHJlYW0pIHtcbiAgICAgICAgdGhpcy5fc3RyZWFtLnN0b3AoKTtcbiAgICAgICAgdGhpcy5fc3RyZWFtID0gbnVsbDtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXM7XG59O1xuXG5PYmplY3QuZGVmaW5lUHJvcGVydHkoVXRpbHMuTWljcm9waG9uZS5wcm90b3R5cGUsICdzdHJlYW0nLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX3N0cmVhbTtcbiAgICB9XG59KTtcblxuT2JqZWN0LmRlZmluZVByb3BlcnR5KFV0aWxzLk1pY3JvcGhvbmUucHJvdG90eXBlLCAnaXNTdXBwb3J0ZWQnLCB7XG4gICAgZ2V0OiBmdW5jdGlvbigpIHtcbiAgICAgICAgcmV0dXJuIHRoaXMuX2lzU3VwcG9ydGVkO1xuICAgIH1cbn0pO1xuXG4vKlxuICogRXhwb3J0c1xuICovXG5cbmlmICh0eXBlb2YgbW9kdWxlID09PSAnb2JqZWN0JyAmJiBtb2R1bGUuZXhwb3J0cykge1xuICAgIG1vZHVsZS5leHBvcnRzID0gVXRpbHM7XG59XG4iXX0=
