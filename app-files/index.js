/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function () {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function () {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function () {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Create scenes.
  var scenes = data.scenes.map(function (data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100 * Math.PI / 180, 120 * Math.PI / 180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function (hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function (hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI / 2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function () {
      screenfull.toggle();
    });
    screenfull.on('change', function () {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function (scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function () {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement', new Marzipano.ElementPressControlMethod(viewUpElement, 'y', -velocity, friction), true);
  controls.registerMethod('downElement', new Marzipano.ElementPressControlMethod(viewDownElement, 'y', velocity, friction), true);
  controls.registerMethod('leftElement', new Marzipano.ElementPressControlMethod(viewLeftElement, 'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement, 'x', velocity, friction), true);
  controls.registerMethod('inElement', new Marzipano.ElementPressControlMethod(viewInElement, 'zoom', -velocity, friction), true);
  controls.registerMethod('outElement', new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom', velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    updateSceneName(scene);
    updateSceneList(scene);
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = ['-ms-transform', '-webkit-transform', 'transform'];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function () {
      switchScene(findSceneById(hotspot.target));
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');
    header.style.backgroundColor = '#6D23E7';

    // Create image element.
    var iconWrapper = document.createElement('div');
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // Place header and text into wrapper element.
    wrapper.appendChild(header);
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    // var toggle = function() {
    //   wrapper.classList.toggle('visible');
    //   modal.classList.toggle('visible');
    // };

    function setInnerHTML(elm, html) {
      elm.innerHTML = html;

      Array.from(elm.querySelectorAll("script"))
        .forEach(oldScriptEl => {
          const newScriptEl = document.createElement("script");

          Array.from(oldScriptEl.attributes).forEach(attr => {
            newScriptEl.setAttribute(attr.name, attr.value)
          });

          const scriptText = document.createTextNode(oldScriptEl.innerHTML);
          newScriptEl.appendChild(scriptText);

          oldScriptEl.parentNode.replaceChild(newScriptEl, oldScriptEl);
        });
    }

    var infobox = document.createElement('div');
    var html = `
    <style>
    .volume-slider {
      width: 200px;
      height: 6px;
      position: relative;
      border-radius: 10px;
  }

  .volume-slider input[type="range"] {
      -webkit-appearance: none;
      appearance: none;
      width: 100%;
      height: 100%;
      background-color: transparent;
      outline: none;
  }

  .volume-slider input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      appearance: none;
      width: 15px;
      height: 15px;
      background-color: #333;
      cursor: pointer;
      border-radius: 10px;

  }

  .volume-slider input[type="range"]::-moz-range-thumb {
      width: 20px;
      height: 20px;
      background-color: #333;
      cursor: pointer;
  }

  .slider {
      overflow: hidden;
      position: relative;
  }

  .slider-container {
      display: flex;
      width: fit-content;
      transition: transform 0.3s ease;
  }

  .container {
      display: flex;
      justify-content: center;
      align-items: center;
      height: 200px;
      flex-direction: column;
  }

  .inner-div {
      text-align: center;
  }

  .bilder {
      width: 300px;
      height: 300px;
      display: none;
  }
    </style>
    <div class="slideIn">
    <div style="background-color: #6D23E7; border-radius: 5px; width: 900px; height: 500px;">
    <img style="width: 45px; float: right; cursor: pointer" src="./img/closeYellow.png" id="${hotspot.name}">
    <div style="display: flex; color: white;">
      <div style="flex: 1; display: flex; justify-content: center; align-items: center;">
      <div class="container">
      <div class="inner-div">
          <div class="slider">
              <div class="slider-container">
                  <img class="bilder" src="bilder/Bild1.jpg" alt="Bild 1">
                  <img class="bilder" src="bilder/Bild2.jpg" alt="Bild 2">
                  <img class="bilder" src="bilder/Bild3.jpg" alt="Bild 3">
                  <img class="bilder" src="bilder/Bild4.jpg" alt="Bild 4">
                  <img class="bilder" src="bilder/Bild5.jpg" alt="Bild 5">
                  <img class="bilder" src="bilder/Bild6.jpg" alt="Bild 6" style="display: block;">
                  <img class="bilder" src="bilder/Bild7.jpg" alt="Bild 7">
                  <img class="bilder" src="bilder/Bild8.jpg" alt="Bild 8">
                  <img class="bilder" src="bilder/Bild9.jpg" alt="Bild 9">
                  <img class="bilder" src="bilder/Bild10.jpg" alt="Bild 10">
                  <img class="bilder" src="bilder/Bild11.jpg" alt="Bild 11">
              </div>
          </div>
      </div>
      <div class="inner-div">
          <div class="volume-slider" style="margin-top: 10px;">
              <input style="background-color: #e4e4e4; border-radius: 10px;" type="range" min="1" max="11" value="6"
                  step="1" oninput="changePic(this.value)">
          </div>
      </div>
  </div>
      </div>
      <div style="flex: 1; padding-left: 20px; padding-top: 100px;">
        <p style="font-size: 40px; font-weight: bold;">${hotspot.name}</p>
        <p style="font-size: 25px; font-style: italic; padding-top: 15px;">${hotspot.artist}</p>
        <p style="font-size: 20px; padding-top: 30px; width: 450px;">${hotspot.disc}</p>
        <a href="${hotspot.link}" target="_blank" style="margin-left: 90px; display: inline-block; padding: 12px 40px; border-radius: 30px; background-color: #FAFF00; color: #fff; font-size: 18px; color: black; text-decoration: none; text-align: center; cursor: pointer; margin-top: 40px;">Mehr Infromationen</a>
      </div>
    </div>
    </div>
    </div>
    <script>
    var images = document.querySelectorAll('.slider img');

    function changePic(value) {
      var index = parseInt(value) - 1;
      for (var i = 0; i < images.length; i++) {
        if (i === index) {
          images[i].style.display = 'block';
        } else {
          images[i].style.display = 'none';
        }
      }
    }
    </script>`;

    setInnerHTML(infobox, html);

    infobox.style.display = 'none';
    infobox.style.position = 'fixed';
    infobox.style.top = '50%';
    infobox.style.left = '50%';
    infobox.style.transform = 'translate(-50%, -50%)';
    infobox.style.padding = '10px';
    infobox.style.width = '1000px';
    infobox.style.height = '550px';
    infobox.style.borderRadius = '10px';
    infobox.style.color = 'black';
    infobox.style.marginTop = '-275px';
    infobox.style.marginLeft = '-500px';

    document.body.appendChild(infobox);



    function toggle() {
      var temp = infobox.style.display;
      var temp = infobox.style.display;
      if (temp === 'block') {
        infobox.classList.add('slideOut');
        infobox.classList.remove('slideIn');
        setTimeout(() => {
          infobox.style.display = 'none';
        }, 1000); // Wartezeit, bis die Animation abgeschlossen ist (1s)
      }
      else {
        infobox.style.display = 'block';
        infobox.classList.add('slideIn');
        infobox.classList.remove('slideOut');
      }
    }

    var closeElement = document.getElementById(hotspot.name);
    closeElement.addEventListener("click", toggle);

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', toggle);

    // Hide content when close icon is clicked.
    modal.querySelector('.info-hotspot-close-wrapper').addEventListener('click', toggle);

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = ['touchstart', 'touchmove', 'touchend', 'touchcancel',
      'wheel', 'mousewheel'];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function (event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }

  // Display the initial scene.
  switchScene(scenes[0]);

})();
