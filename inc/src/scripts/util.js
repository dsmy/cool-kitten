/*!
 * Stellar.js v0.6.2
 * http://markdalgleish.com/projects/stellar.js
 * 
 * Copyright 2013, Mark Dalgleish
 * This content is released under the MIT license
 * http://markdalgleish.mit-license.org
 */

;(function($, window, document, undefined) {

  var pluginName = 'stellar',
    defaults = {
      scrollProperty: 'scroll',
      positionProperty: 'position',
      horizontalScrolling: true,
      verticalScrolling: true,
      horizontalOffset: 0,
      verticalOffset: 0,
      responsive: false,
      parallaxBackgrounds: true,
      parallaxElements: true,
      hideDistantElements: true,
      hideElement: function($elem) { $elem.hide(); },
      showElement: function($elem) { $elem.show(); }
    },

    scrollProperty = {
      scroll: {
        getLeft: function($elem) { return $elem.scrollLeft(); },
        setLeft: function($elem, val) { $elem.scrollLeft(val); },

        getTop: function($elem) { return $elem.scrollTop(); },
        setTop: function($elem, val) { $elem.scrollTop(val); }
      },
      position: {
        getLeft: function($elem) { return parseInt($elem.css('left'), 10) * -1; },
        getTop: function($elem) { return parseInt($elem.css('top'), 10) * -1; }
      },
      margin: {
        getLeft: function($elem) { return parseInt($elem.css('margin-left'), 10) * -1; },
        getTop: function($elem) { return parseInt($elem.css('margin-top'), 10) * -1; }
      },
      transform: {
        getLeft: function($elem) {
          var computedTransform = getComputedStyle($elem[0])[prefixedTransform];
          return (computedTransform !== 'none' ? parseInt(computedTransform.match(/(-?[0-9]+)/g)[4], 10) * -1 : 0);
        },
        getTop: function($elem) {
          var computedTransform = getComputedStyle($elem[0])[prefixedTransform];
          return (computedTransform !== 'none' ? parseInt(computedTransform.match(/(-?[0-9]+)/g)[5], 10) * -1 : 0);
        }
      }
    },

    positionProperty = {
      position: {
        setLeft: function($elem, left) { $elem.css('left', left); },
        setTop: function($elem, top) { $elem.css('top', top); }
      },
      transform: {
        setPosition: function($elem, left, startingLeft, top, startingTop) {
          $elem[0].style[prefixedTransform] = 'translate3d(' + (left - startingLeft) + 'px, ' + (top - startingTop) + 'px, 0)';
        }
      }
    },

    // Returns a function which adds a vendor prefix to any CSS property name
    vendorPrefix = (function() {
      var prefixes = /^(Moz|Webkit|Khtml|O|ms|Icab)(?=[A-Z])/,
        style = $('script')[0].style,
        prefix = '',
        prop;

      for (prop in style) {
        if (prefixes.test(prop)) {
          prefix = prop.match(prefixes)[0];
          break;
        }
      }

      if ('WebkitOpacity' in style) { prefix = 'Webkit'; }
      if ('KhtmlOpacity' in style) { prefix = 'Khtml'; }

      return function(property) {
        return prefix + (prefix.length > 0 ? property.charAt(0).toUpperCase() + property.slice(1) : property);
      };
    }()),

    prefixedTransform = vendorPrefix('transform'),

    supportsBackgroundPositionXY = $('<div />', { style: 'background:#fff' }).css('background-position-x') !== undefined,

    setBackgroundPosition = (supportsBackgroundPositionXY ?
      function($elem, x, y) {
        $elem.css({
          'background-position-x': x,
          'background-position-y': y
        });
      } :
      function($elem, x, y) {
        $elem.css('background-position', x + ' ' + y);
      }
    ),

    getBackgroundPosition = (supportsBackgroundPositionXY ?
      function($elem) {
        return [
          $elem.css('background-position-x'),
          $elem.css('background-position-y')
        ];
      } :
      function($elem) {
        return $elem.css('background-position').split(' ');
      }
    ),

    requestAnimFrame = (
      window.requestAnimationFrame       ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame    ||
      window.oRequestAnimationFrame      ||
      window.msRequestAnimationFrame     ||
      function(callback) {
        setTimeout(callback, 1000 / 60);
      }
    );

  function Plugin(element, options) {
    this.element = element;
    this.options = $.extend({}, defaults, options);

    this._defaults = defaults;
    this._name = pluginName;

    this.init();
  }

  Plugin.prototype = {
    init: function() {
      this.options.name = pluginName + '_' + Math.floor(Math.random() * 1e9);

      this._defineElements();
      this._defineGetters();
      this._defineSetters();
      this._handleWindowLoadAndResize();
      this._detectViewport();

      this.refresh({ firstLoad: true });

      if (this.options.scrollProperty === 'scroll') {
        this._handleScrollEvent();
      } else {
        this._startAnimationLoop();
      }
    },
    _defineElements: function() {
      if (this.element === document.body) this.element = window;
      this.$scrollElement = $(this.element);
      this.$element = (this.element === window ? $('body') : this.$scrollElement);
      this.$viewportElement = (this.options.viewportElement !== undefined ? $(this.options.viewportElement) : (this.$scrollElement[0] === window || this.options.scrollProperty === 'scroll' ? this.$scrollElement : this.$scrollElement.parent()) );
    },
    _defineGetters: function() {
      var self = this,
        scrollPropertyAdapter = scrollProperty[self.options.scrollProperty];

      this._getScrollLeft = function() {
        return scrollPropertyAdapter.getLeft(self.$scrollElement);
      };

      this._getScrollTop = function() {
        return scrollPropertyAdapter.getTop(self.$scrollElement);
      };
    },
    _defineSetters: function() {
      var self = this,
        scrollPropertyAdapter = scrollProperty[self.options.scrollProperty],
        positionPropertyAdapter = positionProperty[self.options.positionProperty],
        setScrollLeft = scrollPropertyAdapter.setLeft,
        setScrollTop = scrollPropertyAdapter.setTop;

      this._setScrollLeft = (typeof setScrollLeft === 'function' ? function(val) {
        setScrollLeft(self.$scrollElement, val);
      } : $.noop);

      this._setScrollTop = (typeof setScrollTop === 'function' ? function(val) {
        setScrollTop(self.$scrollElement, val);
      } : $.noop);

      this._setPosition = positionPropertyAdapter.setPosition ||
        function($elem, left, startingLeft, top, startingTop) {
          if (self.options.horizontalScrolling) {
            positionPropertyAdapter.setLeft($elem, left, startingLeft);
          }

          if (self.options.verticalScrolling) {
            positionPropertyAdapter.setTop($elem, top, startingTop);
          }
        };
    },
    _handleWindowLoadAndResize: function() {
      var self = this,
        $window = $(window);

      if (self.options.responsive) {
        $window.bind('load.' + this.name, function() {
          self.refresh();
        });
      }

      $window.bind('resize.' + this.name, function() {
        self._detectViewport();

        if (self.options.responsive) {
          self.refresh();
        }
      });
    },
    refresh: function(options) {
      var self = this,
        oldLeft = self._getScrollLeft(),
        oldTop = self._getScrollTop();

      if (!options || !options.firstLoad) {
        this._reset();
      }

      this._setScrollLeft(0);
      this._setScrollTop(0);

      this._setOffsets();
      this._findParticles();
      this._findBackgrounds();

      // Fix for WebKit background rendering bug
      if (options && options.firstLoad && /WebKit/.test(navigator.userAgent)) {
        $(window).load(function() {
          var oldLeft = self._getScrollLeft(),
            oldTop = self._getScrollTop();

          self._setScrollLeft(oldLeft + 1);
          self._setScrollTop(oldTop + 1);

          self._setScrollLeft(oldLeft);
          self._setScrollTop(oldTop);
        });
      }

      this._setScrollLeft(oldLeft);
      this._setScrollTop(oldTop);
    },
    _detectViewport: function() {
      var viewportOffsets = this.$viewportElement.offset(),
        hasOffsets = viewportOffsets !== null && viewportOffsets !== undefined;

      this.viewportWidth = this.$viewportElement.width();
      this.viewportHeight = this.$viewportElement.height();

      this.viewportOffsetTop = (hasOffsets ? viewportOffsets.top : 0);
      this.viewportOffsetLeft = (hasOffsets ? viewportOffsets.left : 0);
    },
    _findParticles: function() {
      var self = this,
        scrollLeft = this._getScrollLeft(),
        scrollTop = this._getScrollTop();

      if (this.particles !== undefined) {
        for (var i = this.particles.length - 1; i >= 0; i--) {
          this.particles[i].$element.data('stellar-elementIsActive', undefined);
        }
      }

      this.particles = [];

      if (!this.options.parallaxElements) return;

      this.$element.find('[data-stellar-ratio]').each(function(i) {
        var $this = $(this),
          horizontalOffset,
          verticalOffset,
          positionLeft,
          positionTop,
          marginLeft,
          marginTop,
          $offsetParent,
          offsetLeft,
          offsetTop,
          parentOffsetLeft = 0,
          parentOffsetTop = 0,
          tempParentOffsetLeft = 0,
          tempParentOffsetTop = 0;

        // Ensure this element isn't already part of another scrolling element
        if (!$this.data('stellar-elementIsActive')) {
          $this.data('stellar-elementIsActive', this);
        } else if ($this.data('stellar-elementIsActive') !== this) {
          return;
        }

        self.options.showElement($this);

        // Save/restore the original top and left CSS values in case we refresh the particles or destroy the instance
        if (!$this.data('stellar-startingLeft')) {
          $this.data('stellar-startingLeft', $this.css('left'));
          $this.data('stellar-startingTop', $this.css('top'));
        } else {
          $this.css('left', $this.data('stellar-startingLeft'));
          $this.css('top', $this.data('stellar-startingTop'));
        }

        positionLeft = $this.position().left;
        positionTop = $this.position().top;

        // Catch-all for margin top/left properties (these evaluate to 'auto' in IE7 and IE8)
        marginLeft = ($this.css('margin-left') === 'auto') ? 0 : parseInt($this.css('margin-left'), 10);
        marginTop = ($this.css('margin-top') === 'auto') ? 0 : parseInt($this.css('margin-top'), 10);

        offsetLeft = $this.offset().left - marginLeft;
        offsetTop = $this.offset().top - marginTop;

        // Calculate the offset parent
        $this.parents().each(function() {
          var $this = $(this);

          if ($this.data('stellar-offset-parent') === true) {
            parentOffsetLeft = tempParentOffsetLeft;
            parentOffsetTop = tempParentOffsetTop;
            $offsetParent = $this;

            return false;
          } else {
            tempParentOffsetLeft += $this.position().left;
            tempParentOffsetTop += $this.position().top;
          }
        });

        // Detect the offsets
        horizontalOffset = ($this.data('stellar-horizontal-offset') !== undefined ? $this.data('stellar-horizontal-offset') : ($offsetParent !== undefined && $offsetParent.data('stellar-horizontal-offset') !== undefined ? $offsetParent.data('stellar-horizontal-offset') : self.horizontalOffset));
        verticalOffset = ($this.data('stellar-vertical-offset') !== undefined ? $this.data('stellar-vertical-offset') : ($offsetParent !== undefined && $offsetParent.data('stellar-vertical-offset') !== undefined ? $offsetParent.data('stellar-vertical-offset') : self.verticalOffset));

        // Add our object to the particles collection
        self.particles.push({
          $element: $this,
          $offsetParent: $offsetParent,
          isFixed: $this.css('position') === 'fixed',
          horizontalOffset: horizontalOffset,
          verticalOffset: verticalOffset,
          startingPositionLeft: positionLeft,
          startingPositionTop: positionTop,
          startingOffsetLeft: offsetLeft,
          startingOffsetTop: offsetTop,
          parentOffsetLeft: parentOffsetLeft,
          parentOffsetTop: parentOffsetTop,
          stellarRatio: ($this.data('stellar-ratio') !== undefined ? $this.data('stellar-ratio') : 1),
          width: $this.outerWidth(true),
          height: $this.outerHeight(true),
          isHidden: false
        });
      });
    },
    _findBackgrounds: function() {
      var self = this,
        scrollLeft = this._getScrollLeft(),
        scrollTop = this._getScrollTop(),
        $backgroundElements;

      this.backgrounds = [];

      if (!this.options.parallaxBackgrounds) return;

      $backgroundElements = this.$element.find('[data-stellar-background-ratio]');

      if (this.$element.data('stellar-background-ratio')) {
                $backgroundElements = $backgroundElements.add(this.$element);
      }

      $backgroundElements.each(function() {
        var $this = $(this),
          backgroundPosition = getBackgroundPosition($this),
          horizontalOffset,
          verticalOffset,
          positionLeft,
          positionTop,
          marginLeft,
          marginTop,
          offsetLeft,
          offsetTop,
          $offsetParent,
          parentOffsetLeft = 0,
          parentOffsetTop = 0,
          tempParentOffsetLeft = 0,
          tempParentOffsetTop = 0;

        // Ensure this element isn't already part of another scrolling element
        if (!$this.data('stellar-backgroundIsActive')) {
          $this.data('stellar-backgroundIsActive', this);
        } else if ($this.data('stellar-backgroundIsActive') !== this) {
          return;
        }

        // Save/restore the original top and left CSS values in case we destroy the instance
        if (!$this.data('stellar-backgroundStartingLeft')) {
          $this.data('stellar-backgroundStartingLeft', backgroundPosition[0]);
          $this.data('stellar-backgroundStartingTop', backgroundPosition[1]);
        } else {
          setBackgroundPosition($this, $this.data('stellar-backgroundStartingLeft'), $this.data('stellar-backgroundStartingTop'));
        }

        // Catch-all for margin top/left properties (these evaluate to 'auto' in IE7 and IE8)
        marginLeft = ($this.css('margin-left') === 'auto') ? 0 : parseInt($this.css('margin-left'), 10);
        marginTop = ($this.css('margin-top') === 'auto') ? 0 : parseInt($this.css('margin-top'), 10);

        offsetLeft = $this.offset().left - marginLeft - scrollLeft;
        offsetTop = $this.offset().top - marginTop - scrollTop;
        
        // Calculate the offset parent
        $this.parents().each(function() {
          var $this = $(this);

          if ($this.data('stellar-offset-parent') === true) {
            parentOffsetLeft = tempParentOffsetLeft;
            parentOffsetTop = tempParentOffsetTop;
            $offsetParent = $this;

            return false;
          } else {
            tempParentOffsetLeft += $this.position().left;
            tempParentOffsetTop += $this.position().top;
          }
        });

        // Detect the offsets
        horizontalOffset = ($this.data('stellar-horizontal-offset') !== undefined ? $this.data('stellar-horizontal-offset') : ($offsetParent !== undefined && $offsetParent.data('stellar-horizontal-offset') !== undefined ? $offsetParent.data('stellar-horizontal-offset') : self.horizontalOffset));
        verticalOffset = ($this.data('stellar-vertical-offset') !== undefined ? $this.data('stellar-vertical-offset') : ($offsetParent !== undefined && $offsetParent.data('stellar-vertical-offset') !== undefined ? $offsetParent.data('stellar-vertical-offset') : self.verticalOffset));

        self.backgrounds.push({
          $element: $this,
          $offsetParent: $offsetParent,
          isFixed: $this.css('background-attachment') === 'fixed',
          horizontalOffset: horizontalOffset,
          verticalOffset: verticalOffset,
          startingValueLeft: backgroundPosition[0],
          startingValueTop: backgroundPosition[1],
          startingBackgroundPositionLeft: (isNaN(parseInt(backgroundPosition[0], 10)) ? 0 : parseInt(backgroundPosition[0], 10)),
          startingBackgroundPositionTop: (isNaN(parseInt(backgroundPosition[1], 10)) ? 0 : parseInt(backgroundPosition[1], 10)),
          startingPositionLeft: $this.position().left,
          startingPositionTop: $this.position().top,
          startingOffsetLeft: offsetLeft,
          startingOffsetTop: offsetTop,
          parentOffsetLeft: parentOffsetLeft,
          parentOffsetTop: parentOffsetTop,
          stellarRatio: ($this.data('stellar-background-ratio') === undefined ? 1 : $this.data('stellar-background-ratio'))
        });
      });
    },
    _reset: function() {
      var particle,
        startingPositionLeft,
        startingPositionTop,
        background,
        i;

      for (i = this.particles.length - 1; i >= 0; i--) {
        particle = this.particles[i];
        startingPositionLeft = particle.$element.data('stellar-startingLeft');
        startingPositionTop = particle.$element.data('stellar-startingTop');

        this._setPosition(particle.$element, startingPositionLeft, startingPositionLeft, startingPositionTop, startingPositionTop);

        this.options.showElement(particle.$element);

        particle.$element.data('stellar-startingLeft', null).data('stellar-elementIsActive', null).data('stellar-backgroundIsActive', null);
      }

      for (i = this.backgrounds.length - 1; i >= 0; i--) {
        background = this.backgrounds[i];

        background.$element.data('stellar-backgroundStartingLeft', null).data('stellar-backgroundStartingTop', null);

        setBackgroundPosition(background.$element, background.startingValueLeft, background.startingValueTop);
      }
    },
    destroy: function() {
      this._reset();

      this.$scrollElement.unbind('resize.' + this.name).unbind('scroll.' + this.name);
      this._animationLoop = $.noop;

      $(window).unbind('load.' + this.name).unbind('resize.' + this.name);
    },
    _setOffsets: function() {
      var self = this,
        $window = $(window);

      $window.unbind('resize.horizontal-' + this.name).unbind('resize.vertical-' + this.name);

      if (typeof this.options.horizontalOffset === 'function') {
        this.horizontalOffset = this.options.horizontalOffset();
        $window.bind('resize.horizontal-' + this.name, function() {
          self.horizontalOffset = self.options.horizontalOffset();
        });
      } else {
        this.horizontalOffset = this.options.horizontalOffset;
      }

      if (typeof this.options.verticalOffset === 'function') {
        this.verticalOffset = this.options.verticalOffset();
        $window.bind('resize.vertical-' + this.name, function() {
          self.verticalOffset = self.options.verticalOffset();
        });
      } else {
        this.verticalOffset = this.options.verticalOffset;
      }
    },
    _repositionElements: function() {
      var scrollLeft = this._getScrollLeft(),
        scrollTop = this._getScrollTop(),
        horizontalOffset,
        verticalOffset,
        particle,
        fixedRatioOffset,
        background,
        bgLeft,
        bgTop,
        isVisibleVertical = true,
        isVisibleHorizontal = true,
        newPositionLeft,
        newPositionTop,
        newOffsetLeft,
        newOffsetTop,
        i;

      // First check that the scroll position or container size has changed
      if (this.currentScrollLeft === scrollLeft && this.currentScrollTop === scrollTop && this.currentWidth === this.viewportWidth && this.currentHeight === this.viewportHeight) {
        return;
      } else {
        this.currentScrollLeft = scrollLeft;
        this.currentScrollTop = scrollTop;
        this.currentWidth = this.viewportWidth;
        this.currentHeight = this.viewportHeight;
      }

      // Reposition elements
      for (i = this.particles.length - 1; i >= 0; i--) {
        particle = this.particles[i];

        fixedRatioOffset = (particle.isFixed ? 1 : 0);

        // Calculate position, then calculate what the particle's new offset will be (for visibility check)
        if (this.options.horizontalScrolling) {
          newPositionLeft = (scrollLeft + particle.horizontalOffset + this.viewportOffsetLeft + particle.startingPositionLeft - particle.startingOffsetLeft + particle.parentOffsetLeft) * -(particle.stellarRatio + fixedRatioOffset - 1) + particle.startingPositionLeft;
          newOffsetLeft = newPositionLeft - particle.startingPositionLeft + particle.startingOffsetLeft;
        } else {
          newPositionLeft = particle.startingPositionLeft;
          newOffsetLeft = particle.startingOffsetLeft;
        }

        if (this.options.verticalScrolling) {
          newPositionTop = (scrollTop + particle.verticalOffset + this.viewportOffsetTop + particle.startingPositionTop - particle.startingOffsetTop + particle.parentOffsetTop) * -(particle.stellarRatio + fixedRatioOffset - 1) + particle.startingPositionTop;
          newOffsetTop = newPositionTop - particle.startingPositionTop + particle.startingOffsetTop;
        } else {
          newPositionTop = particle.startingPositionTop;
          newOffsetTop = particle.startingOffsetTop;
        }

        // Check visibility
        if (this.options.hideDistantElements) {
          isVisibleHorizontal = !this.options.horizontalScrolling || newOffsetLeft + particle.width > (particle.isFixed ? 0 : scrollLeft) && newOffsetLeft < (particle.isFixed ? 0 : scrollLeft) + this.viewportWidth + this.viewportOffsetLeft;
          isVisibleVertical = !this.options.verticalScrolling || newOffsetTop + particle.height > (particle.isFixed ? 0 : scrollTop) && newOffsetTop < (particle.isFixed ? 0 : scrollTop) + this.viewportHeight + this.viewportOffsetTop;
        }

        if (isVisibleHorizontal && isVisibleVertical) {
          if (particle.isHidden) {
            this.options.showElement(particle.$element);
            particle.isHidden = false;
          }

          this._setPosition(particle.$element, newPositionLeft, particle.startingPositionLeft, newPositionTop, particle.startingPositionTop);
        } else {
          if (!particle.isHidden) {
            this.options.hideElement(particle.$element);
            particle.isHidden = true;
          }
        }
      }

      // Reposition backgrounds
      for (i = this.backgrounds.length - 1; i >= 0; i--) {
        background = this.backgrounds[i];

        fixedRatioOffset = (background.isFixed ? 0 : 1);
        bgLeft = (this.options.horizontalScrolling ? (scrollLeft + background.horizontalOffset - this.viewportOffsetLeft - background.startingOffsetLeft + background.parentOffsetLeft - background.startingBackgroundPositionLeft) * (fixedRatioOffset - background.stellarRatio) + 'px' : background.startingValueLeft);
        bgTop = (this.options.verticalScrolling ? (scrollTop + background.verticalOffset - this.viewportOffsetTop - background.startingOffsetTop + background.parentOffsetTop - background.startingBackgroundPositionTop) * (fixedRatioOffset - background.stellarRatio) + 'px' : background.startingValueTop);

        setBackgroundPosition(background.$element, bgLeft, bgTop);
      }
    },
    _handleScrollEvent: function() {
      var self = this,
        ticking = false;

      var update = function() {
        self._repositionElements();
        ticking = false;
      };

      var requestTick = function() {
        if (!ticking) {
          requestAnimFrame(update);
          ticking = true;
        }
      };
      
      this.$scrollElement.bind('scroll.' + this.name, requestTick);
      requestTick();
    },
    _startAnimationLoop: function() {
      var self = this;

      this._animationLoop = function() {
        requestAnimFrame(self._animationLoop);
        self._repositionElements();
      };
      this._animationLoop();
    }
  };

  $.fn[pluginName] = function (options) {
    var args = arguments;
    if (options === undefined || typeof options === 'object') {
      return this.each(function () {
        if (!$.data(this, 'plugin_' + pluginName)) {
          $.data(this, 'plugin_' + pluginName, new Plugin(this, options));
        }
      });
    } else if (typeof options === 'string' && options[0] !== '_' && options !== 'init') {
      return this.each(function () {
        var instance = $.data(this, 'plugin_' + pluginName);
        if (instance instanceof Plugin && typeof instance[options] === 'function') {
          instance[options].apply(instance, Array.prototype.slice.call(args, 1));
        }
        if (options === 'destroy') {
          $.data(this, 'plugin_' + pluginName, null);
        }
      });
    }
  };

  $[pluginName] = function(options) {
    var $window = $(window);
    return $window.stellar.apply($window, Array.prototype.slice.call(arguments, 0));
  };

  // Expose the scroll and position property function hashes so they can be extended
  $[pluginName].scrollProperty = scrollProperty;
  $[pluginName].positionProperty = positionProperty;

  // Expose the plugin class so it can be modified
  window.Stellar = Plugin;
}(jQuery, this, document));

/*
 * jQuery Easing v1.3 - http://gsgd.co.uk/sandbox/jquery/easing/
 *
 * Uses the built in easing capabilities added In jQuery 1.1
 * to offer multiple easing options
 *
 * TERMS OF USE - jQuery Easing
 * 
 * Open source under the BSD License. 
 * 
 * Copyright © 2008 George McGinley Smith
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 * 
 * Redistributions of source code must retain the above copyright notice, this list of 
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list 
 * of conditions and the following disclaimer in the documentation and/or other materials 
 * provided with the distribution.
 * 
 * Neither the name of the author nor the names of contributors may be used to endorse 
 * or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
 * OF THE POSSIBILITY OF SUCH DAMAGE. 
 *
*/

// t: current time, b: begInnIng value, c: change In value, d: duration
jQuery.easing['jswing'] = jQuery.easing['swing'];

jQuery.extend( jQuery.easing,
{
  def: 'easeOutQuad',
  swing: function (x, t, b, c, d) {
    //alert(jQuery.easing.default);
    return jQuery.easing[jQuery.easing.def](x, t, b, c, d);
  },
  easeInQuad: function (x, t, b, c, d) {
    return c*(t/=d)*t + b;
  },
  easeOutQuad: function (x, t, b, c, d) {
    return -c *(t/=d)*(t-2) + b;
  },
  easeInOutQuad: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t + b;
    return -c/2 * ((--t)*(t-2) - 1) + b;
  },
  easeInCubic: function (x, t, b, c, d) {
    return c*(t/=d)*t*t + b;
  },
  easeOutCubic: function (x, t, b, c, d) {
    return c*((t=t/d-1)*t*t + 1) + b;
  },
  easeInOutCubic: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t*t + b;
    return c/2*((t-=2)*t*t + 2) + b;
  },
  easeInQuart: function (x, t, b, c, d) {
    return c*(t/=d)*t*t*t + b;
  },
  easeOutQuart: function (x, t, b, c, d) {
    return -c * ((t=t/d-1)*t*t*t - 1) + b;
  },
  easeInOutQuart: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t*t*t + b;
    return -c/2 * ((t-=2)*t*t*t - 2) + b;
  },
  easeInQuint: function (x, t, b, c, d) {
    return c*(t/=d)*t*t*t*t + b;
  },
  easeOutQuint: function (x, t, b, c, d) {
    return c*((t=t/d-1)*t*t*t*t + 1) + b;
  },
  easeInOutQuint: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return c/2*t*t*t*t*t + b;
    return c/2*((t-=2)*t*t*t*t + 2) + b;
  },
  easeInSine: function (x, t, b, c, d) {
    return -c * Math.cos(t/d * (Math.PI/2)) + c + b;
  },
  easeOutSine: function (x, t, b, c, d) {
    return c * Math.sin(t/d * (Math.PI/2)) + b;
  },
  easeInOutSine: function (x, t, b, c, d) {
    return -c/2 * (Math.cos(Math.PI*t/d) - 1) + b;
  },
  easeInExpo: function (x, t, b, c, d) {
    return (t==0) ? b : c * Math.pow(2, 10 * (t/d - 1)) + b;
  },
  easeOutExpo: function (x, t, b, c, d) {
    return (t==d) ? b+c : c * (-Math.pow(2, -10 * t/d) + 1) + b;
  },
  easeInOutExpo: function (x, t, b, c, d) {
    if (t==0) return b;
    if (t==d) return b+c;
    if ((t/=d/2) < 1) return c/2 * Math.pow(2, 10 * (t - 1)) + b;
    return c/2 * (-Math.pow(2, -10 * --t) + 2) + b;
  },
  easeInCirc: function (x, t, b, c, d) {
    return -c * (Math.sqrt(1 - (t/=d)*t) - 1) + b;
  },
  easeOutCirc: function (x, t, b, c, d) {
    return c * Math.sqrt(1 - (t=t/d-1)*t) + b;
  },
  easeInOutCirc: function (x, t, b, c, d) {
    if ((t/=d/2) < 1) return -c/2 * (Math.sqrt(1 - t*t) - 1) + b;
    return c/2 * (Math.sqrt(1 - (t-=2)*t) + 1) + b;
  },
  easeInElastic: function (x, t, b, c, d) {
    var s=1.70158;var p=0;var a=c;
    if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
    if (a < Math.abs(c)) { a=c; var s=p/4; }
    else var s = p/(2*Math.PI) * Math.asin (c/a);
    return -(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
  },
  easeOutElastic: function (x, t, b, c, d) {
    var s=1.70158;var p=0;var a=c;
    if (t==0) return b;  if ((t/=d)==1) return b+c;  if (!p) p=d*.3;
    if (a < Math.abs(c)) { a=c; var s=p/4; }
    else var s = p/(2*Math.PI) * Math.asin (c/a);
    return a*Math.pow(2,-10*t) * Math.sin( (t*d-s)*(2*Math.PI)/p ) + c + b;
  },
  easeInOutElastic: function (x, t, b, c, d) {
    var s=1.70158;var p=0;var a=c;
    if (t==0) return b;  if ((t/=d/2)==2) return b+c;  if (!p) p=d*(.3*1.5);
    if (a < Math.abs(c)) { a=c; var s=p/4; }
    else var s = p/(2*Math.PI) * Math.asin (c/a);
    if (t < 1) return -.5*(a*Math.pow(2,10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )) + b;
    return a*Math.pow(2,-10*(t-=1)) * Math.sin( (t*d-s)*(2*Math.PI)/p )*.5 + c + b;
  },
  easeInBack: function (x, t, b, c, d, s) {
    if (s == undefined) s = 1.70158;
    return c*(t/=d)*t*((s+1)*t - s) + b;
  },
  easeOutBack: function (x, t, b, c, d, s) {
    if (s == undefined) s = 1.70158;
    return c*((t=t/d-1)*t*((s+1)*t + s) + 1) + b;
  },
  easeInOutBack: function (x, t, b, c, d, s) {
    if (s == undefined) s = 1.70158; 
    if ((t/=d/2) < 1) return c/2*(t*t*(((s*=(1.525))+1)*t - s)) + b;
    return c/2*((t-=2)*t*(((s*=(1.525))+1)*t + s) + 2) + b;
  },
  easeInBounce: function (x, t, b, c, d) {
    return c - jQuery.easing.easeOutBounce (x, d-t, 0, c, d) + b;
  },
  easeOutBounce: function (x, t, b, c, d) {
    if ((t/=d) < (1/2.75)) {
      return c*(7.5625*t*t) + b;
    } else if (t < (2/2.75)) {
      return c*(7.5625*(t-=(1.5/2.75))*t + .75) + b;
    } else if (t < (2.5/2.75)) {
      return c*(7.5625*(t-=(2.25/2.75))*t + .9375) + b;
    } else {
      return c*(7.5625*(t-=(2.625/2.75))*t + .984375) + b;
    }
  },
  easeInOutBounce: function (x, t, b, c, d) {
    if (t < d/2) return jQuery.easing.easeInBounce (x, t*2, 0, c, d) * .5 + b;
    return jQuery.easing.easeOutBounce (x, t*2-d, 0, c, d) * .5 + c*.5 + b;
  }
});

/*
 *
 * TERMS OF USE - EASING EQUATIONS
 * 
 * Open source under the BSD License. 
 * 
 * Copyright © 2001 Robert Penner
 * All rights reserved.
 * 
 * Redistribution and use in source and binary forms, with or without modification, 
 * are permitted provided that the following conditions are met:
 * 
 * Redistributions of source code must retain the above copyright notice, this list of 
 * conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright notice, this list 
 * of conditions and the following disclaimer in the documentation and/or other materials 
 * provided with the distribution.
 * 
 * Neither the name of the author nor the names of contributors may be used to endorse 
 * or promote products derived from this software without specific prior written permission.
 * 
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY 
 * EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE
 *  COPYRIGHT OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL,
 *  EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE
 *  GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED 
 * AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
 *  NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED 
 * OF THE POSSIBILITY OF SUCH DAMAGE. 
 *
 */