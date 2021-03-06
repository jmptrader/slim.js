class Slim extends HTMLElement {

    /**
     * Auto-detect if the browser supports web-components. If it does not,
     * it will add a script tag with the required url.
     * Best practice to call polyfill in <head> section of the HTML
     * @example
     *      <head>
     *          <script src="./path/to/slim/Slim.min.js"></script>
     *          <script>
     *              Slim.polyfill('./path/to/web-components-polyfill.js');
     *          </script>
     *      </head>
     * @param url
     */
    static polyfill(url) {
        if (Slim.__isWCSupported) return;
        const scriptTag = document.createElement('script');
        scriptTag.src = url;
        document.getElementsByTagName('head')[0].appendChild(scriptTag);
    }

    /**
     * Declares a slim component
     *
     * @param {String} tag html tag name
     * @param {String|class|function} clazzOrTemplate the template string or the class itself
     * @param {class|function} clazz if not given as second argument, mandatory after the template
     */
    static tag(tag, clazzOrTemplate, clazz) {
        if (clazz === undefined) {
            clazz = clazzOrTemplate;
        } else {
            Slim.__templateDict[tag] = clazzOrTemplate;
        }
        Slim.__prototypeDict[tag] = clazz;

        // window.customElements.define(tag, clazz);
        if (Slim.__prototypeDict['slim-repeat'] === undefined) {
            Slim.__initRepeater();
        }
        customElements.define(tag, clazz);
    }

    //noinspection JSUnusedGlobalSymbols
    /**
     *
     * @param {class|function} clazz returns the tag declared for a given class or constructor
     * @returns {string}
     */
    static getTag(clazz) {
        for (let tag in Slim.__prototypeDict) {
            if (Slim.__prototypeDict[tag] === clazz)
                return tag;
        }
    }

    static __createUqIndex() {
        Slim.__uqIndex++;
        return Slim.__uqIndex.toString(16);
    }

    /**
     * Supported HTML events built-in on slim components
     * @returns {Array<String>}
     */
    static get interactionEventNames() {
        return ['click','mouseover','mouseout','mousemove','mouseenter','mousedown','mouseup','dblclick','contextmenu','wheel',
            'mouseleave','select','pointerlockchange','pointerlockerror','focus','blur',
            'input', 'error', 'invalid',
            'animationstart','animationend','animationiteration','reset','submit','resize','scroll',
            'keydown','keypress','keyup', 'change']
    }

    /**
     * Aspect oriented functions to handle lifecycle phases of elements. The plugin function should gets the element as an argument.
     * This is used to extend elements' capabilities or data injections across the application
     * @param {String} phase
     * @param {function} plugin
     */
    static plugin(phase, plugin) {
        if (['create','beforeRender','beforeRemove','afterRender'].indexOf(phase) === -1) {
            throw "Supported phase can be create, beforeRemove, beforeRender or afterRender only"
        }
        Slim.__plugins[phase].push(plugin)
    }

    //noinspection JSUnusedGlobalSymbols
    /**
     * This is used to extend Slim. All custom attributes handlers would recieve the function and the value of the attribute when relevant.
     * @param {String} attr attribute name
     * @param {function} fn
     */
    static registerCustomAttribute(attr, fn) {
        Slim.__customAttributeProcessors[attr] = Slim.__customAttributeProcessors[attr] || [];
        Slim.__customAttributeProcessors[attr].push(fn);
    }

    /**
     * @param phase
     * @param element
     * @private
     */
    static __runPlugins(phase, element) {
        Slim.__plugins[phase].forEach( fn => {
            fn(element)
        })
    }

    /**
     * Polyfill for IE11 support
     * @param target
     */
    static removeChild(target) {
        if (target.remove) {
            target.remove();
        }
        if (target.parentNode) {
            target.parentNode.removeChild(target);
        }
        if (target.__ieClone) {
            Slim.removeChild(target.__ieClone);
        }
        if (target._boundChildren) {
            target._boundChildren.forEach( child => {
                if (child.__ieClone) {
                    Slim.removeChild(child.__ieClone);
                }
            });
        }
    }

    /**
     *
     * @param source
     * @param target
     * @param activate
     * @private
     */
    static __moveChildrenBefore(source, target, activate) {
        while (source.firstChild) {
            target.parentNode.insertBefore(source.firstChild, target)
        }
        let children = Slim.selectorToArr(target, '*');
        for (let child of children) {
            if (activate && child.isSlim) {
                child.createdCallback()
            }
        }
    }

    /**
     *
     * @param source
     * @param target
     * @param activate
     * @private
     */
    static __moveChildren(source, target, activate) {
        while (source.firstChild) {
            target.appendChild(source.firstChild)
        }
        let children = Slim.selectorToArr(target, '*');
        for (let child of children) {
            if (activate && child.isSlim) {
                child.createdCallback()
            }
        }
    }

    /**
     *
     * @param obj
     * @param desc
     * @returns {{source: *, prop: *, obj: *}}
     * @private
     */
    static __lookup(obj, desc) {
        let arr = desc.split(".");
        let prop = arr[0];
        while(arr.length && obj) {
            obj = obj[prop = arr.shift()]
        }
        return {source: desc, prop:prop, obj:obj};
    }

    static __inject(descriptor) {
        try {
            descriptor.target[ Slim.__dashToCamel(descriptor.attribute) ] = Slim.__injections[ descriptor.factory ](descriptor.target);
        }
        catch (err) {
            console.error('Could not inject ' + descriptor.attribute + ' into ' + descriptor.target);
            console.info('Descriptor ', descriptor);
            throw err;
        }

    }

    static inject(name, injector) {
        Slim.__injections[name] = injector;
    }

    /**
     *
     * @param descriptor
     * @private
     */
    static __createRepeater(descriptor) {
        let repeater;
        repeater = document.createElement('slim-repeat');
        repeater.sourceNode = descriptor.target;
        descriptor.target.repeater = repeater;
        descriptor.target.parentNode.insertBefore(repeater, descriptor.target);
        descriptor.repeater = repeater;

        repeater._boundParent = descriptor.source;
        descriptor.target.parentNode.removeChild(descriptor.target);
        repeater._isAdjacentRepeater = descriptor.repeatAdjacent;
        repeater.setAttribute('source', descriptor.properties[0]);
        repeater.setAttribute('target-attr', descriptor.targetAttribute);
        descriptor.repeater = repeater
    }

    /**
     *
     * @param dash
     * @returns {XML|void|string|*}
     * @private
     */
    static __dashToCamel(dash) {
        return dash.indexOf('-') < 0 ? dash : dash.replace(/-[a-z]/g, m => {return m[1].toUpperCase()})
    }

    //noinspection JSUnusedGlobalSymbols
    /**
     *
     * @param camel
     * @returns {string}
     * @private
     */
    static __camelToDash(camel) {
        return camel.replace(/([A-Z])/g, '-$1').toLowerCase();
    }

    constructor() {
        super();
        this.createdCallback();
    }

    find(selector) {
        return this.rootElement.querySelector(selector);
    }

    //noinspection JSUnusedGlobalSymbols
    findAll(selector) {
        return Slim.selectorToArr(this.rootElement, selector);
    }

    watch(prop, executor) {
        let descriptor = {
            type: 'W',
            properties: [ prop ],
            executor: executor,
            target: this,
            source: this
        };
        this._bindings = this._bindings || {};
        this._boundParent = this._boundParent || this;
        this.__bind(descriptor)
    }

    /**
     * Function delegation in the DOM chain is supported by this function. All slim components are capable of triggering
     * delegated methods using callAttribute and send any payload as they define in their API.
     * @param {String} attributeName
     * @param {any} value
     */
    callAttribute(attributeName, value) {
        if (!this._boundParent) {
            throw 'Unable to call attribute-bound method when no bound parent available';
        }
        let fnName = this.getAttribute(attributeName);
        if (fnName === null) {
            console.warn && console.warn('Unable to call null attribute-bound method on bound parent ' + this._boundParent.outerHTML);
            return;
        }
        if (typeof this._boundParent[fnName] === 'function') {
            this._boundParent[fnName](value)
        } else if (this._boundParent && this._boundParent._boundParent && typeof this._boundParent._boundParent[fnName] === 'function') {
            // safari, firefox
            this._boundParent._boundParent[fnName](value)
        } else if (this._boundRepeaterParent && typeof this._boundRepeaterParent[fnName] === 'function') {
            this._boundRepeaterParent[fnName](value)
        } else {
            throw "Unable to call attribute-bound method: " + fnName + ' on bound parent ' + this._boundParent.outerHTML + ' with value ' + value
        }
        if (typeof this.update === 'function' && (this.isInteractive || Slim.autoAttachInteractionEvents || this.getAttribute('interactive'))) {
            this.update()
        }
    }

    __propertyChanged(property, value) {
        if (typeof this[property + 'Changed'] === 'function') {
            this[property + 'Changed'](value);
        }
    }

    /**
     *
     * @param descriptor
     * @private
     */
    __bind(descriptor) {
        descriptor.properties.forEach(
            prop => {
                let rootProp;
                if (prop.indexOf('.') > 0) {
                    rootProp = prop.split('.')[0]
                } else {
                    rootProp = prop
                }
                let source = descriptor.source || descriptor.target._boundParent || descriptor.parentNode;
                source._bindings = source._bindings || {};
                source._bindings[rootProp] = source._bindings[rootProp] || {
                        value: source[rootProp],
                        executors: []
                    };
                if (!source.__lookupGetter__(rootProp)) source.__defineGetter__(rootProp, function() {
                    return this._bindings[rootProp].value
                });
                const originalSetter = source.__lookupSetter__(rootProp);
                const newSetter = function(x) {
                    this._bindings[rootProp].value = x;
                    if (descriptor.sourceText) {
                        descriptor.target.innerText = descriptor.sourceText
                    }
                    this._executeBindings(rootProp);
                    this.__propertyChanged(rootProp, x);
                };
                newSetter.isBindingSetter = true;
                if (!originalSetter) {
                    source.__defineSetter__(rootProp, newSetter);
                } else if (originalSetter && !originalSetter.isBindingSetter) {
                    source.__defineSetter__(rootProp, function(x) {
                        originalSetter.call(this, x);
                        newSetter.call(this, x);
                    });
                    source.__lookupSetter__(rootProp).isBindingSetter = true;
                }
                let executor;
                if (descriptor.type === 'C') {
                    executor = () => {
                        descriptor.executor()
                    }
                } else if (descriptor.type === 'P') {
                    executor = () => {
                        let targets;
                        if (!descriptor.target.hasAttribute('slim-repeat')) {
                            targets = [descriptor.target];
                        } else {
                            targets = descriptor.target.repeater.clones;
                        }
                        if (targets) {
                            let sourceRef = descriptor.target._boundRepeaterParent || descriptor.target._boundParent;
                            let value = Slim.__lookup((sourceRef || source), prop).obj || Slim.__lookup(descriptor.target, prop).obj;
                            const attrName = Slim.__dashToCamel(descriptor.attribute);
                            targets.forEach(target => {
                                target[ attrName ] = value;
                                target.setAttribute( descriptor.attribute, value )
                            })
                        }
                    }
                } else if (descriptor.type === 'M') {
                    executor = () => {
                        let targets = [ descriptor.target ];
                        if (descriptor.target.hasAttribute('slim-repeat')) {
                            targets = descriptor.target.repeater.clones;
                        }
                        let sourceRef = descriptor.target._boundRepeaterParent || source;
                        let value = sourceRef[ descriptor.method ].apply( sourceRef,
                            descriptor.properties.map( prop => { return descriptor.target[prop] || sourceRef[prop] }));
                        const attrName = Slim.__dashToCamel(descriptor.attribute);
                        targets.forEach(target => {
                            target[ attrName ] = value;
                            target.setAttribute( descriptor.attribute, value )
                        });
                    }
                } else if (descriptor.type === 'T') {
                    executor = () => {
                        let source = descriptor.target._boundParent;
                        descriptor.target._innerText = descriptor.target._innerText.replace(`[[${prop}]]`, Slim.__lookup(source, prop).obj)
                    }
                } else if (descriptor.type === 'TM') {
                    executor = () => {
                        const values = descriptor.properties.map( compoundProp => {
                            return Slim.__lookup(source, compoundProp).obj;
                        });
                        try{
                            const value = source[descriptor.methodName].apply(source, values);
                            descriptor.target._innerText = descriptor.target._innerText.replace(descriptor.expression, value);
                        }
                        catch(exc) {
                            console.error(`Could not execute function ${descriptor.methodName} in element ${descriptor.source.localName}`);
                            console.info(exc);
                        }
                    }
                } else if (descriptor.type === 'R') {
                    executor = () => {
                        descriptor.repeater.registerForRender();
                        // !descriptor.repeater.isRendering && descriptor.repeater.renderList()
                    }
                } else if (descriptor.type === 'W') {
                    executor = () => {
                        descriptor.executor(Slim.__lookup(source, prop).obj)
                    }
                } else if (descriptor.type === 'F') {
                    executor = () => {
                        let value = !!Slim.__lookup(descriptor.source, prop).obj;
                        if (descriptor.reversed) {
                            value = !value;
                        }
                        if (!value) {
                            if (descriptor.target.parentNode) {
                                descriptor.target.insertAdjacentElement('beforeBegin', descriptor.helper);
                                Slim.removeChild(descriptor.target);
                            }
                        } else {
                            if (!descriptor.target.parentNode) {
                                descriptor.helper.insertAdjacentElement('beforeBegin', descriptor.target);
                                if (descriptor.target.isSlim) {
                                    descriptor.target.createdCallback();
                                }
                                Slim.removeChild(descriptor.helper);
                            }
                        }
                    }
                }
                executor.descriptor = descriptor;
                source._bindings[rootProp].executors.push( executor )
            }
        )
    }

    static __processStyleNode(node, tag, uqIndex) {
        if (Slim.__isWCSupported) return;
        const rxRules = /([^\r\n,{}]+)(,(?=[^}]*{)|\s*{)/g;
        const match = node.innerText.match(rxRules);
        if (match) {
            match.forEach( selector => {
                if (selector.indexOf(':host') < 0) {
                    node.innerText = node.innerText.replace(selector, ':host ' + selector);
                }
            });
        }

        const customTagName = `${tag}[slim-uq="${uqIndex}"]`;
        node.innerText = node.innerText.replace(/\:host/g, customTagName);

        if (Slim.__isIE11) {
            const ieClone = document.createElement('style');
            ieClone.type = 'text/css';
            node.__ieClone = ieClone;
            ieClone.innerText = node.innerText;
            while (ieClone.innerText.indexOf('  ') >= 0) {
                ieClone.innerText = ieClone.innerText.replace('  ', ' ');
            }
            document.head.appendChild(ieClone);
        }
    }

    /**
     *
     * @param attribute
     * @param child
     * @returns {{type: string, target: *, targetAttribute: *, repeatAdjacent: boolean, attribute: string, properties: [*], source: (*|Slim)}}
     * @private
     */
    static __processRepeater(attribute, child) {
        return {
            type: 'R',
            target: child,
            targetAttribute: child.getAttribute('slim-repeat-as') ? child.getAttribute('slim-repeat-as') : 'data',
            repeatAdjacent: child.hasAttribute('slim-repeat-adjacent') || child.localName === 'option' || child.localName === 'tr' || child.localName === 'th' || child.localName === 'td',
            attribute: attribute.nodeName,
            properties: [ attribute.nodeValue ],
            source: child._boundParent
        }
    }

    /**
     *
     * @param attribute
     * @param child
     * @returns {{type: string, target: *, properties: [*], executor: (function())}}
     * @private
     */
    static __processCustomAttribute(attribute, child) {
        return {
            type: "C",
            target: child,
            properties: [attribute.nodeValue],
            executor: () => {
                Slim.__customAttributeProcessors[attribute.nodeName].forEach( customAttrProcessor => {
                    customAttrProcessor(child, attribute.nodeValue);
                });
            }
        };
    }

    /**
     * Extracts a value by using dot-notation from a target
     * @param target
     * @param expression
     * @returns {*}
     */
    static extract(target, expression) {
        const rxInject = Slim.rxInject.exec(expression);
        const rxProp = Slim.rxProp.exec(expression);
        const rxMethod = Slim.rxMethod.exec(expression);

        if (rxProp) {
            return target[rxProp[1]]
        } else if (rxMethod) {
            return target[ rxMethod[1] ].apply( target, rxMethod[3].replace(' ','').split(',') );
        }
    }

    /**
     *
     * @param attribute
     * @param child
     * @returns {*}
     * @private
     */
    static __processAttribute(attribute, child) {
        if (attribute.nodeName === 'slim-repeat') {
            return Slim.__processRepeater(attribute, child)
        }

        if (attribute.nodeName === 'slim-if') {
            let propertyName = attribute.nodeValue;
            let reverse = false;
            if (attribute.nodeValue.charAt(0) === '!') {
                propertyName = propertyName.slice(1);
                reverse = true;
            }
            return {
                type: 'F',
                target: child,
                source: child._boundParent,
                helper: document.createElement('slim-if-helper'),
                reversed: reverse,
                properties: [ propertyName ]
            }
        }

        if (Slim.__customAttributeProcessors[attribute.nodeName]) {
            return Slim.__processCustomAttribute(attribute, child);
        }

        const rxInject = Slim.rxInject.exec(attribute.nodeValue);
        const rxProp = Slim.rxProp.exec(attribute.nodeValue);
        const rxMethod = Slim.rxMethod.exec(attribute.nodeValue);

        if (rxMethod) {
            return {
                type: 'M',
                target: child,
                attribute: attribute.nodeName,
                method: rxMethod[1],
                properties: rxMethod[3].replace(' ','').split(',')
            }
        } else if (rxProp) {
            return {
                type: 'P',
                target: child,
                attribute: attribute.nodeName,
                properties: [ rxProp[1] ]
            }
        } else if (rxInject) {
            return {
                type: 'I',
                target: child,
                attribute: attribute.nodeName,
                factory: rxInject[1]
            }
        }
    }

    /**
     * Checks if the element is actually placed on the DOM or is a template element only
     * @returns {boolean}
     */
    get isVirtual() {
        let node = this;
        while (node) {
            node = node.parentNode;
            if (!node) {
                return true
            }
            if (node.nodeName === 'BODY' || node.host) {
                return false
            }
        }
        return true
    }

    /**
     * By default, Slim components does not use shadow dom. Override and return true if you wish to use shadow dom.
     * @returns {boolean}
     */
    get useShadow() {
        return false;
    }

    /**
     * Returns the element or it's shadow root, depends on the result from useShadow()
     * @returns {*}
     */
    get rootElement() {
        if (this.useShadow && this.createShadowRoot) {
            this.__shadowRoot = this.__shadowRoot || this.createShadowRoot();
            return this.__shadowRoot
        }
        return this
    }

    /**
     * Part of the standard web-component lifecycle. Overriding it is not recommended.
     */
    createdCallback() {
        // __createdCallbackRunOnce is required for babel louzy transpiling
        if (this.isVirtual) return;
        if (this.__createdCallbackRunOnce) return;
        this.__createdCallbackRunOnce = true;
        this.initialize();
        this.onBeforeCreated();
        this._captureBindings();
        Slim.__runPlugins('create', this);
        this.onCreated();
        this.__onCreatedComplete = true;
        this.onBeforeRender();
        Slim.__runPlugins('beforeRender', this);
        Slim.__moveChildren( this._virtualDOM, this.rootElement, true );
        this.onAfterRender();
        Slim.__runPlugins('afterRender', this);
        this.update()
    }

    /**
     *
     * @private
     */
    _initInteractiveEvents() {
        if (!this.__eventsInitialized && (Slim.autoAttachInteractionEvents || this.isInteractive || this.hasAttribute('interactive'))) Slim.interactionEventNames.forEach(eventType => {
            this.addEventListener(eventType, e => { this.handleEvent(e) })
        })
    }

    /**
     * Part of the non-standard slim web-component's lifecycle. Overriding it is not recommended.
     */
    initialize() {
        this.uq_index = Slim.__createUqIndex();
        this.setAttribute('slim-uq', this.uq_index);
        this._bindings = this._bindings || {};
        this._boundChildren = this._boundChildren || [];
        this._initInteractiveEvents();
        this.__eventsInitialized = true;
        this.alternateTemplate = this.alternateTemplate || null;
        this._virtualDOM = this._virtualDOM || document.createDocumentFragment();
    }

    /**
     * Simple test if an HTML element is a Slim elememnt.
     * @returns {boolean}
     */
    get isSlim() { return true }

    /**
     * Override and provide a template, if not given in the tag creation process.
     * @returns {*|null}
     */
    get template() {
        return (Slim.__templateDict[ this.nodeName.toLowerCase()]) || null;
    }

    /**
     * By default, interactive events are registered only if returns true, or directly requested for.
     * @returns {boolean}
     */
    get isInteractive() { return false }

    /**
     * Handles interactive events, overriding this is not recommended.
     * @param e
     */
    handleEvent(e) {
        if (this.hasAttribute('on' + e.type)) {
            this.callAttribute('on' + e.type, e)
        } else if (this.hasAttribute(e.type)) {
            this.callAttribute(e.type, e)
        }
    }

    /**
     * Part of the standard web-component lifecycle. Overriding it is not recommended.
     */
    connectedCallback() {
        this.onAdded();
    }

    /**
     * Part of the standard web-component lifecycle. Overriding it is not recommended.
     */
    disconnectedCallback() {
        Slim.__runPlugins('beforeRemove', this);
        this.onRemoved()
    }

    attributeChangedCallback(attr, oldValue, newValue) {
        if (oldValue === newValue) return;
        if (!this._bindings) return;
        if (this._bindings[attr]) {
            this[Slim.__dashToCamel(attr)] = newValue;
        }
    }

    onAdded() { /* abstract */ }
    onRemoved() { /* abstract */ }
    onBeforeCreated() { /* abstract */ }
    onCreated() { /* abstract */}
    onBeforeRender() { /* abstract */ }
    onAfterRender() { /* abstract */ }
    onBeforeUpdate() { /* abstract */ }
    onAfterUpdate() { /* abstract */ }

    /**
     * Part of Slim's lifecycle, overriding is not recommended without calling super.update()
     */
    update() {
        this.onBeforeUpdate();
        this._executeBindings();
        this.onAfterUpdate()
    }

    /**
     * Part of Slim's lifecycle, overriding is not recommended without calling super.render()
     */
    render(template) {
        Slim.__runPlugins('beforeRender', this);
        this.onBeforeRender();
        this.alternateTemplate = template;
        this.initialize();
        this.rootElement.innerHTML = '';
        this._captureBindings();
        this._executeBindings();
        Slim.__moveChildren( this._virtualDOM, this.rootElement, true );
        this.onAfterRender();
        Slim.__runPlugins('afterRender', this)
    }

    /**
     *
     * @param prop
     * @private
     */
    _executeBindings(prop) {
        if (!this._bindings) return;
        // reset bound texts
        this._boundChildren.forEach( child => {
            // this._boundChildren.forEach( child => {
            if (child.hasAttribute('bind') && child.sourceText !== undefined) {
                child._innerText = child.sourceText
            }
        });

        // execute specific binding or all
        const properties = prop ? [ prop ] : Object.keys(this._bindings);
        properties.forEach( property => {
            this._bindings[property].executors.forEach( fn => {
                if (fn.descriptor.type !== 'T' && fn.descriptor.type !== 'TM') fn()
            } )
        });

        // execute text bindings always
        Object.keys(this._bindings).forEach( property => {
            this._bindings[property].executors.forEach( fn => {
                if (fn.descriptor.type === 'T' || fn.descriptor.type === 'TM') {
                    fn();
                }
            });
            this._bindings[property].executors.forEach( fn => {
                if (fn.descriptor.type === 'T' || fn.descriptor.type === 'TM') {
                    fn.descriptor.target.innerText = fn.descriptor.target._innerText;
                    if (fn.descriptor.target.__ieClone) {
                        fn.descriptor.target.__ieClone.innerText = fn.descriptor.target.innerText;
                    }
                }
            })
        })
    }

    /**
     *
     * @private
     */
    _captureBindings() {
        const self = this;
        let $tpl = this.alternateTemplate || this.template;
        if (!$tpl) {
            while (this.firstChild) {
                // TODO: find why this line is needed for babel!!!
                self._virtualDOM = this._virtualDOM || document.createDocumentFragment();
                self._virtualDOM.appendChild( this.firstChild )
            }
        } else if (typeof($tpl) === 'string') {
            const frag = document.createRange().createContextualFragment($tpl);
            while (frag.firstChild) {
                this._virtualDOM.appendChild(frag.firstChild);
            }
            let virtualContent = this._virtualDOM.querySelector('slim-content');
            if (virtualContent) {
                while (self.firstChild) {
                    self.firstChild._boundParent = this.firstChild._boundParent || this;
                    virtualContent.appendChild( this.firstChild )
                }
            }
        }

        let allChildren = Slim.selectorToArr(this._virtualDOM, '*');
        for (let child of allChildren) {
            child._sourceOuterHTML = child.outerHTML;
            child._boundParent = child._boundParent || this;
            self._boundChildren = this._boundChildren || [];
            self._boundChildren.push(child);
            if (child.localName === 'style' && this.useShadow) {
                Slim.__processStyleNode(child, this.localName, this.uq_index);
            }
            if (child.getAttribute('slim-id')) {
                child._boundParent[ Slim.__dashToCamel(child.getAttribute('slim-id')) ] = child
            }
            let slimID = child.getAttribute('slim-id');
            if (slimID) this[slimID] = child;
            let descriptors = [];
            if (child.attributes) for (let i = 0; i < child.attributes.length; i++) {
                if (!child.isSlim && !child.__eventsInitialized && Slim.interactionEventNames.indexOf(child.attributes[i].nodeName) >= 0) {
                    child.isInteractive = true;
                    child.handleEvent = self.handleEvent.bind(child);
                    child.callAttribute = self.callAttribute.bind(child);
                    child.addEventListener(child.attributes[i].nodeName, child.handleEvent);
                    child.__eventsInitialized = true;
                }
                let desc = Slim.__processAttribute(child.attributes[i], child);
                if (desc) descriptors.push(desc);
                child[Slim.__dashToCamel(child.attributes[i].nodeName)] = child.attributes[i].nodeValue;
                if (child.attributes[i].nodeName.indexOf('#') == '0') {
                    let refName = child.attributes[i].nodeName.slice(1);
                    this[refName] = child
                }
            }

            descriptors = descriptors.sort( (a) => {
                if (a.type === 'I') { return -1 }
                else if (a.type === 'R') return 1
                else if (a.type === 'C') return 2
                return 0
            });

            child._boundProperties = {};

            descriptors.forEach(
                descriptor => {
                    descriptor.properties && descriptor.properties.forEach( prop => {
                        child._boundProperties[prop] = true;
                    });
                    if (descriptor.type === 'P' || descriptor.type === 'M' || descriptor.type === 'C') {
                        this.__bind(descriptor)
                    } else if (descriptor.type === 'I') {
                        Slim.__inject(descriptor)
                    } else if (descriptor.type === 'R') {
                        Slim.__createRepeater(descriptor);
                        this.__bind(descriptor)
                    } else if (descriptor.type === 'F') {
                        this.__bind(descriptor);
                    }
                }
            )
        }

        allChildren = Slim.selectorToArr(this._virtualDOM, '*[bind]');

        // bind method-based text binds
        for (let child of allChildren) {
            let match = child.innerText.match(/\[\[(\w+)\((.+)\)]\]/g);
            if (match) {
                match.forEach( expression => {
                    // group 1 -> method
                    // group 2 -> propertie(s), separated by comma, may have space
                    const matches = expression.match(Slim.rxMethod);
                    const methodName = matches[1];
                    const props = matches[3].split(' ').join('').split(',');
                    let descriptor = {
                        type: 'TM',
                        properties: props,
                        target: child,
                        expression: expression,
                        source: child._boundParent,
                        sourceText: child.innerText,
                        methodName: methodName
                    }
                    child.sourceText = child.innerText;
                    this.__bind(descriptor);
                });
            }
        }
        // bind property based text binds
        for (let child of allChildren) {
            let match = child.innerText.match(/\[\[([\w|.]+)\]\]/g);
            if (match && child.children.firstChild) {
                throw 'Bind Error: Illegal bind attribute use on element type ' + child.localName + ' with nested children.\n' + child.outerHTML;
            }
            if (match) {
                let properties = [];
                for (let i = 0; i < match.length; i++) {
                    let lookup = match[i].match(/([^\[].+[^\]])/)[0];
                    properties.push(lookup)
                }
                let descriptor = {
                    type: 'T',
                    properties: properties,
                    target: child,
                    sourceText: child.innerText
                };
                child.sourceText = child.innerText;
                this.__bind(descriptor)
            }
        }
    }

}

Slim.rxInject = /\{(.+[^(\((.+)\))])\}/
Slim.rxProp = /\[\[(.+[^(\((.+)\))])\]\]/
Slim.rxMethod = /\[\[(.+)(\((.+)\)){1}\]\]/
Slim.__customAttributeProcessors = {};
Slim.__prototypeDict = {};
Slim.__uqIndex = 0;
Slim.__templateDict = {};
Slim.__injections = {};
Slim.__plugins = {
    'create': [],
    'beforeRender': [],
    'afterRender': [],
    'beforeRemove': []
};

try {
    Slim.__isWCSupported = (function() {
        return ('registerElement' in document
        && 'import' in document.createElement('link')
        && 'content' in document.createElement('template'))
    })()
}
catch (err) {
    Slim.__isWCSupported = false
}

try {
    Slim.__isIE11 = (function() {
        return !!window['MSInputMethodContext'] && !!document['documentMode'];
    })();
}
catch (err) {
    Slim.__isIE11 = false;
}

if (Slim.__isWCSupported && NodeList.prototype.hasOwnProperty('forEach')) {
    Slim.selectorToArr = function(target, selector) {
        return target.querySelectorAll(selector);
    }
} else {
    Slim.selectorToArr = function(target, selector) {
        return Array.prototype.slice.call( target.querySelectorAll(selector) );
    }
}

/**
 *
 * @private
 */
Slim.__initRepeater = function() {
    class SlimRepeater extends Slim {

        get useShadow() {
            return false;
        }

        get sourceData() {
            try {
                let lookup = Slim.__lookup(this._boundParent, this.getAttribute('source'));
                return lookup.obj || []
            }
            catch (err) {
                return []
            }
        }

        onAdded() {
            if (!this.uq_index) {
                this.createdCallback();
            }
            this.checkoutRender();
        }

        onRemoved() {
            this.sourceData.unregisterSlimRepeater(this)
        }

        registerForRender() {
            if (this.pendingRender) return;
            this.pendingRender = true;
            setTimeout( () => {
                this.checkoutRender();
            }, 0);
        }

        checkoutRender() {
            this.pendingRender = false;
            this.renderList();
        }

        clearList() {
            this.clones && this.clones.forEach( clone => {
                Slim.removeChild(clone);
            });
            this.clones = [];
        }

        updateExistingList() {
            let targetPropName = this.getAttribute('target-attr');
            const sourceData = this.sourceData;
            this.clones.forEach( (clone, idx) => {
                clone[targetPropName] = this.sourceData[idx];
                clone.data_index = idx;
                clone.data_source = sourceData;
                Slim.selectorToArr(clone, '*').forEach( element => {
                    element[targetPropName] = sourceData[idx];
                    element.data_index = idx;
                    element.data_source = sourceData;
                    if (element.isSlim) {
                        element.update();
                    }
                });
                if (clone.isSlim) {
                    clone.update();
                }
            });
            this.clones[0]._boundProperties && Object.keys(this.clones[0]._boundProperties).forEach( prop => {
                try {
                    this.clones[0]._boundParent._executeBindings(prop.split('.')[0]);
                    this._boundParent._executeBindings(prop.split('.')[0]);
                }
                catch (err) { /* swallow error */ }
            });
            Slim.selectorToArr(this.clones[0], '*').forEach( element => {
                try {
                    element._boundParent._executeBindings(prop.split('.')[0]);
                    this._boundParent._executeBindings(prop.split('.')[0]);
                }
                catch (err) { /* swallow error */ }
            });
            this._executeBindings();
        }

        renderList() {
            if (this.isRendering) return;
            this.isRendering = true;
            if (!this.sourceNode) {
                this.isRendering = false;
                return;
            }
            this.sourceData.registerSlimRepeater(this);

            if (this.clones && this.clones.length === this.sourceData.length && this.sourceData.length > 0) {
                this.updateExistingList();
                this.isRendering = false;
                return;
            }

            if (this.clones && this.clones.length > this.sourceData.length && this.sourceData.length > 0) {
                const leftovers = this.clones.splice(this.sourceData.length);
                leftovers.forEach( leftover => {
                    Slim.removeChild(leftover);
                });
                this.updateExistingList();
                this.isRendering = false;
                return;
            }
            if (this.clones && this.clones.length < this.sourceData.length && this.clones.length > 0) {
                this.updateExistingList();
                let remaining = this.sourceData.slice(this.clones.length);
                this.createItems(remaining);
                this.isRendering = false;
                return;
            }
            this.clearList();
            this.createItems(this.sourceData);
            this.isRendering = false;
        }

        createItems(sourceData) {
            let targetPropName = this.getAttribute('target-attr');
            const offset = this.clones.length;
            const newClones = [];
            sourceData.forEach( (dataItem, index) => {
                let clone = this.sourceNode.cloneNode(true);
                clone.removeAttribute('slim-repeat');
                clone.removeAttribute('slim-repeat-as');
                clone.setAttribute('slim-repeat-index', index + offset);
                if (!Slim.__isWCSupported) {
                    this.insertAdjacentHTML('beforeEnd', clone.outerHTML);
                    clone = this.find('*[slim-repeat-index="' + index.toString() + '"]')
                }
                clone[targetPropName] = dataItem;
                clone.data_index = index + offset;
                clone.data_source = this.sourceData;
                clone.sourceText = clone.innerText;
                if (Slim.__isWCSupported) {
                    this.insertAdjacentElement('beforeEnd', clone)
                }
                newClones.push(clone)
            });
            if (this._virtualDOM) this._captureBindings();
            for (let clone of newClones) {
                clone[targetPropName] = clone[targetPropName];
                clone._boundRepeaterParent = this._boundParent;
                if (Slim.__prototypeDict[clone.localName] !== undefined || clone.isSlim) {
                    clone._boundParent = this._boundParent
                }
                else {
                    clone._boundParent = clone
                }
                Slim.selectorToArr(clone, '*').forEach( element => {
                    element._boundParent = clone._boundParent;
                    element._boundRepeaterParent = clone._boundRepeaterParent;
                    element[targetPropName] = clone[targetPropName];
                    element.data_index = clone.data_index + offset;
                    element.data_source = clone.data_source;
                })
            }

            if (!this.clones) {
                this.clones = [];
            }
            this.clones = this.clones.concat(newClones);

            this._executeBindings();
            if (this._isAdjacentRepeater) {
                this._virtualDOM && Slim.__moveChildrenBefore(this._virtualDOM, this, true)
            } else {
                this._virtualDOM && Slim.__moveChildren(this._virtualDOM, this, true)
            }
        }
    }
    Slim.tag('slim-repeat', SlimRepeater);

    window.SlimRepeater = SlimRepeater
};
window.Slim = Slim

// monkey punching array to be observable by slim repeaters
;(function() {

    const originals = {};
    ['push','pop','shift', 'unshift', 'splice', 'sort', 'reverse'].forEach( function(method) {
        originals[method] = Array.prototype[method];
        Array.prototype[method] = function() {
            let result = originals[method].apply(this, arguments);
            if (this.registeredSlimRepeaters) {
                this.registeredSlimRepeaters.forEach( repeater => {
                    repeater.registerForRender();
                })
            }
            return result
        }
    });


    Array.prototype.registerSlimRepeater = function(repeater) {
        if (this.registeredSlimRepeaters === undefined) {
            Object.defineProperty(this, 'registeredSlimRepeaters', {
                enumerable: false,
                configurable: false,
                value: []
            });
        }

        if (this.registeredSlimRepeaters.indexOf(repeater) < 0) {
            this.registeredSlimRepeaters.push(repeater)
        }
    };

    Array.prototype.unregisterSlimRepeater = function(repeater) {
        if (this.registeredSlimRepeaters && this.registeredSlimRepeaters.indexOf(repeater) >= 0) {
            this.registeredSlimRepeaters.splice( this.registeredSlimRepeaters.indexOf(repeater), 1)
        }
    }

})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports.Slim = Slim
}

