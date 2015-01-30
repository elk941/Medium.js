
(function(Medium, w, d) {
	"use strict";

	Medium.Action = function (medium) {
		this.medium = medium;

		this.handledEvents = {
			keydown: null,
			keyup: null,
			blur: null,
			focus: null,
			paste: null
		};

	};
	Medium.Action.prototype = {
		setup: function () {
			this
				.handleFocus()
				.handleBlur()
				.handleKeyDown()
				.handleKeyUp()
				.handlePaste();
		},
		destroy: function() {
			var el = this.medium.element;

			utils
				.removeEvent(el, 'focus', this.handledEvents.focus)
				.removeEvent(el, 'blur', this.handledEvents.blur)
				.removeEvent(el, 'keydown', this.handledEvents.keydown)
				.removeEvent(el, 'keyup', this.handledEvents.keyup)
				.removeEvent(el, 'paste', this.handledEvents.paste);
		},
		handleFocus: function () {

			var medium = this.medium,
				el = medium.element;

			utils.addEvent(el, 'focus', this.handledEvents.focus = function(e) {
				e = e || w.event;

				console.log(el);
				Medium.activeElement = el;

				medium.placeholders();
			});

			return this;
		},
		handleBlur: function () {

			var medium = this.medium,
				el = medium.element;

			utils.addEvent(el, 'blur', this.handledEvents.blur = function(e) {
				e = e || w.event;

				if (Medium.activeElement === el) {
					Medium.activeElement = null;
				}

				medium.placeholders();
			});

			return this;
		},
		handleKeyDown: function () {

			var action = this,
				medium = this.medium,
				settings = medium.settings,
				cache = medium.cache,
				el = medium.element;

			utils.addEvent(el, 'keydown', this.handledEvents.keydown = function(e) {
				e = e || w.event;

				var keepEvent = true;

				//in Chrome it sends out this event before every regular event, not sure why
				if (e.keyCode === 229) return;

				utils.isCommand(settings, e, function () {
					cache.cmd = true;
				}, function () {
					cache.cmd = false;
				});

				utils.isShift(e, function () {
					cache.shift = true;
				}, function () {
					cache.shift = false;
				});

				utils.isModifier(settings, e, function (cmd) {
					if (cache.cmd) {

						if (( (settings.mode === Medium.inlineMode) || (settings.mode === Medium.partialMode) ) && cmd !== "paste") {
							utils.preventDefaultEvent(e);
							return false;
						}

						var cmdType = typeof cmd;
						var fn = null;
						if (cmdType === "function") {
							fn = cmd;
						} else {
							fn = medium[cmd];
						}

						keepEvent = fn.call(medium, e);

						if (keepEvent === false || keepEvent === medium) {
							utils.preventDefaultEvent(e);
							utils.stopPropagation(e);
						}
						return true;
					}
					return false;
				});

				if (settings.maxLength !== -1) {
					var len = utils.text(el).length,
						hasSelection = false,
						selection = w.getSelection(),
						isSpecial = utils.isSpecial(e),
						isNavigational = utils.isNavigational(e);

					if (selection) {
						hasSelection = !selection.isCollapsed;
					}

					if (isSpecial || isNavigational) {
						return true;
					}

					if (len >= settings.maxLength && !hasSelection) {
						settings.maxLengthReached(el);
						utils.preventDefaultEvent(e);
						return false;
					}
				}

				switch (e.keyCode) {
					case key['enter']:
						if (action.enterKey(e) === false) {
							utils.preventDefaultEvent(e);
						}
						break;
					case key['backspace']:
					case key['delete']:
						action.backspaceOrDeleteKey(e);
						break;
				}

				return keepEvent;
			});

			return this;
		},
		handleKeyUp: function () {

			var action = this,
				medium = this.medium,
				settings = medium.settings,
				cache = medium.cache,
				cursor = medium.cursor,
				el = medium.element;

			utils.addEvent(el, 'keyup', this.handledEvents.keyup = function(e) {
				e = e || w.event;
				utils.isCommand(settings, e, function () {
					cache.cmd = false;
				}, function () {
					cache.cmd = true;
				});
				medium.clean();
				medium.placeholders();

				//here we have a key context, so if you need to create your own object within a specific context it is doable
				var keyContext;
				if (
					settings.keyContext !== null
					&& ( keyContext = settings.keyContext[e.keyCode] )
				) {
					var el = cursor.parent();

					if (el) {
						keyContext.call(medium, e, el);
					}
				}

				action.preserveElementFocus();
			});

			return this;
		},
		handlePaste: function(e) {
			var medium = this.medium,
				el = medium.element,
				settings = medium.settings,
				selection = medium.selection;

			utils.addEvent(el, 'paste', this.handledEvents.paste = function(e) {
				e = e || w.event;
				medium.makeUndoable();
				var length = medium.value().length,
					totalLength;

				if (settings.pasteAsText) {
					utils.preventDefaultEvent(e);
					var sel = selection.saveSelection();

					medium.prompt(function(text) {
						text = text || '';
						if (text.length > 0) {
							el.focus();
							Medium.activeElement = el;
							selection.restoreSelection(sel);

							//encode the text first
							text = utils.encodeHtml(text);

							//cut down it's length
							totalLength = text.length + length;
							if (settings.maxLength > 0 && totalLength > settings.maxLength) {
								text = text.substring(0, settings.maxLength - length);
							}

							if (settings.mode !== Medium.inlineMode) {
								text = text.replace(/\n/g, '<br>');
							}

							(new Medium.Html(medium, text))
								.setClean(false)
								.insert(settings.beforeInsertHtml, true);

							medium.clean();
							medium.placeholders();
						}
					});
					return false;
				} else {
					setTimeout(function() {
						medium.clean();
						medium.placeholders();
					}, 20);
				}
			});

			return this;
		},
		enterKey: function (e) {
			var medium = this.medium,
				el = medium.element,
				settings = medium.settings,
				cache = medium.cache,
				cursor = medium.cursor;

			if( settings.mode === Medium.inlineMode || settings.mode === Medium.inlineRichMode ){
				return false;
			}

			if (cache.shift) {
				if (settings.tags['break']) {
					medium.addTag(settings.tags['break'], true);
					return false;
				}

			} else {

				var focusedElement = utils.atCaret(medium) || {},
					children = el.children,
					lastChild = focusedElement === el.lastChild ? el.lastChild : null,
					makeHR,
					secondToLast,
					paragraph;

				if (
					lastChild
					&& lastChild !== el.firstChild
					&& settings.autoHR
					&& settings.mode !== Medium.partialMode
					&& settings.tags.horizontalRule
				) {

					utils.preventDefaultEvent(e);

					makeHR =
						utils.text(lastChild) === ""
						&& lastChild.nodeName.toLowerCase() === settings.tags.paragraph;

					if (makeHR && children.length >= 2) {
						secondToLast = children[ children.length - 2 ];

						if (secondToLast.nodeName.toLowerCase() === settings.tags.horizontalRule) {
							makeHR = false;
						}
					}

					if (makeHR) {
						medium.addTag(settings.tags.horizontalRule, false, true, focusedElement);
						focusedElement = focusedElement.nextSibling;
					}

					if ((paragraph = medium.addTag(settings.tags.paragraph, true, null, focusedElement)) !== null) {
						paragraph.innerHTML = '';
						cursor.set(medium, 0, paragraph);
					}
				}
			}

			return true;
		},
		backspaceOrDeleteKey: function (e) {
			var medium = this.medium,
				settings = medium.settings,
				el = medium.element;

			if (settings.onBackspaceOrDelete !== undefined) {
				var result = settings.onBackspaceOrDelete.call(medium, e, el);

				if (result) {
					return;
				}
			}

			if (el.lastChild === null) return;

			var lastChild = el.lastChild,
				beforeLastChild = lastChild.previousSibling;

			if (
				lastChild
				&& settings.tags.horizontalRule
				&& lastChild.nodeName.toLocaleLowerCase() === settings.tags.horizontalRule
			) {
				el.removeChild(lastChild);
			} else if (
				lastChild
				&& beforeLastChild
				&& utils.text(lastChild).length < 1

				&& beforeLastChild.nodeName.toLowerCase() === settings.tags.horizontalRule
				&& lastChild.nodeName.toLowerCase() === settings.tags.paragraph
			) {
				el.removeChild(lastChild);
				el.removeChild(beforeLastChild);
			}
		},
		preserveElementFocus: function () {
			// Fetch node that has focus
			var anchorNode = w.getSelection ? w.getSelection().anchorNode : d.activeElement;
			if (anchorNode) {
				var medium = this.medium,
					cache = medium.cache,
					el = medium.element,
					s = medium.settings,
					cur = anchorNode.parentNode,
					children = el.children,
					diff = cur !== cache.focusedElement,
					elementIndex = 0,
					i;

				// anchorNode is our target if element is empty
				if (cur === s.element) {
					cur = anchorNode;
				}

				// Find our child index
				for (i = 0; i < children.length; i++) {
					if (cur === children[i]) {
						elementIndex = i;
						break;
					}
				}

				// Focused element is different
				if (diff) {
					cache.focusedElement = cur;
					cache.focusedElementIndex = elementIndex;
				}
			}
		}
	};

})(Medium, w, d);
